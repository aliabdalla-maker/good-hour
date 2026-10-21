"""Tool registry. Every tool: pydantic-validated args, minimum role, and a `consequential`
flag. Consequential tools are never executed by the model directly - they create an
ApprovalRequest that a human must approve. Business numbers are computed here, never by the LLM."""
import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Callable

from pydantic import BaseModel, EmailStr, Field, ValidationError
from sqlalchemy import func, or_, select

from ..deps import ROLE_RANK, Ctx
from ..llm.base import ToolSpec
from ..models import (Customer, CustomerNote, Invoice, InvoiceStatus, Product, Role)

TWO = Decimal("0.01")


class ToolInputError(Exception):
    pass


@dataclass
class Tool:
    name: str
    description: str
    args: type[BaseModel]
    min_role: Role
    consequential: bool
    run: Callable[[Ctx, BaseModel], dict]

    def spec(self) -> ToolSpec:
        schema = self.args.model_json_schema()
        schema.pop("title", None)
        return ToolSpec(self.name, self.description, schema)

    def validate(self, raw: dict) -> BaseModel:
        try:
            return self.args.model_validate(raw)
        except ValidationError as e:
            raise ToolInputError(e.errors(include_url=False, include_context=False)) from e


def _cust(c: Customer) -> dict:
    return {"id": c.id, "name": c.name, "email": c.email, "phone": c.phone, "company": c.company,
            "is_lead": c.is_lead, "stage": c.pipeline_stage,
            "last_purchase_at": c.last_purchase_at.isoformat() if c.last_purchase_at else None}


def _get_customer(ctx: Ctx, cid: str) -> Customer:
    c = ctx.db.get(Customer, cid)
    if not c or c.business_id != ctx.business.id:
        raise ToolInputError(f"Customer {cid} not found in this business")
    return c


# ---------- read-only tools ----------
class SearchCustomers(BaseModel):
    query: str = Field(min_length=1, max_length=100)


def search_customers(ctx: Ctx, a: SearchCustomers) -> dict:
    q = f"%{a.query}%"
    rows = ctx.db.scalars(select(Customer).where(
        Customer.business_id == ctx.business.id,
        or_(Customer.name.ilike(q), Customer.email.ilike(q), Customer.company.ilike(q))).limit(20)).all()
    return {"ok": True, "customers": [_cust(c) for c in rows]}


class CustomerId(BaseModel):
    customer_id: str = Field(min_length=1, max_length=32)


def customer_history(ctx: Ctx, a: CustomerId) -> dict:
    c = _get_customer(ctx, a.customer_id)
    notes = ctx.db.scalars(select(CustomerNote).where(CustomerNote.customer_id == c.id)
                           .order_by(CustomerNote.created_at.desc()).limit(20)).all()
    invs = ctx.db.scalars(select(Invoice).where(Invoice.customer_id == c.id).limit(20)).all()
    return {"ok": True, "customer": _cust(c),
            "notes": [{"body": n.body, "at": n.created_at.isoformat()} for n in notes],
            "invoices": [{"number": i.number, "status": i.status.value, "total": str(i.total)} for i in invs]}


class InactiveArgs(BaseModel):
    days: int = Field(ge=1, le=3650)


def inactive_customers(ctx: Ctx, a: InactiveArgs) -> dict:
    cutoff = datetime.now(timezone.utc) - timedelta(days=a.days)
    rows = ctx.db.scalars(select(Customer).where(
        Customer.business_id == ctx.business.id, Customer.is_lead.is_(False),
        or_(Customer.last_purchase_at.is_(None), Customer.last_purchase_at < cutoff)).limit(100)).all()
    return {"ok": True, "count": len(rows), "customers": [_cust(c) for c in rows]}


class SkuArgs(BaseModel):
    sku: str = Field(min_length=1, max_length=64)


def check_stock(ctx: Ctx, a: SkuArgs) -> dict:
    p = ctx.db.scalar(select(Product).where(Product.business_id == ctx.business.id, Product.sku == a.sku))
    if not p:
        return {"ok": False, "error": f"No product with SKU {a.sku}"}
    return {"ok": True, "sku": p.sku, "name": p.name, "stock_qty": p.stock_qty,
            "reorder_level": p.reorder_level, "unit_price": str(p.unit_price), "source": "inventory database"}


class NoArgs(BaseModel):
    pass


def low_stock(ctx: Ctx, a: NoArgs) -> dict:
    rows = ctx.db.scalars(select(Product).where(Product.business_id == ctx.business.id,
                                                Product.stock_qty <= Product.reorder_level)).all()
    return {"ok": True, "items": [{"sku": p.sku, "name": p.name, "stock_qty": p.stock_qty,
                                   "reorder_level": p.reorder_level,
                                   "suggested_order_qty": max(p.reorder_level * 2 - p.stock_qty, 0)} for p in rows]}


class DraftEmail(BaseModel):
    customer_id: str
    subject: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=5000)


def draft_email(ctx: Ctx, a: DraftEmail) -> dict:
    c = _get_customer(ctx, a.customer_id)
    return {"ok": True, "status": "draft_only_not_sent", "to": c.email, "subject": a.subject, "body": a.body}


# ---------- low-risk writes (permission checked, no approval) ----------
class CreateCustomer(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=50)
    company: str | None = Field(default=None, max_length=200)
    is_lead: bool = True


def create_customer(ctx: Ctx, a: CreateCustomer) -> dict:
    c = Customer(business_id=ctx.business.id, **a.model_dump())
    ctx.db.add(c)
    ctx.db.flush()
    return {"ok": True, "customer": _cust(c)}


class AddNote(BaseModel):
    customer_id: str
    body: str = Field(min_length=1, max_length=4000)
    follow_up_in_days: int | None = Field(default=None, ge=0, le=365)


def add_note(ctx: Ctx, a: AddNote) -> dict:
    c = _get_customer(ctx, a.customer_id)
    fu = datetime.now(timezone.utc) + timedelta(days=a.follow_up_in_days) if a.follow_up_in_days is not None else None
    ctx.db.add(CustomerNote(business_id=ctx.business.id, customer_id=c.id, author_id=ctx.user.id,
                            body=a.body, follow_up_at=fu))
    return {"ok": True, "saved": True}


class InvoiceLine(BaseModel):
    sku: str
    quantity: int = Field(ge=1, le=100000)


class DraftInvoice(BaseModel):
    customer_id: str
    lines: list[InvoiceLine] = Field(min_length=1, max_length=50)


def compute_invoice(ctx: Ctx, a: DraftInvoice) -> dict:
    """Deterministic pricing + VAT from the database. Raises if any SKU/price is unknown."""
    lines, subtotal = [], Decimal(0)
    for ln in a.lines:
        p = ctx.db.scalar(select(Product).where(Product.business_id == ctx.business.id, Product.sku == ln.sku))
        if not p:
            raise ToolInputError(f"Unknown SKU {ln.sku}: cannot price it")
        amount = (p.unit_price * ln.quantity).quantize(TWO, ROUND_HALF_UP)
        lines.append({"sku": p.sku, "name": p.name, "quantity": ln.quantity,
                      "unit_price": str(p.unit_price), "amount": str(amount)})
        subtotal += amount
    vat = (subtotal * Decimal(ctx.business.vat_rate) / 100).quantize(TWO, ROUND_HALF_UP)
    return {"lines": lines, "subtotal": subtotal, "vat": vat, "total": subtotal + vat}


def draft_invoice(ctx: Ctx, a: DraftInvoice) -> dict:
    _get_customer(ctx, a.customer_id)
    calc = compute_invoice(ctx, a)
    n = ctx.db.scalar(select(func.count(Invoice.id)).where(Invoice.business_id == ctx.business.id)) or 0
    inv = Invoice(business_id=ctx.business.id, customer_id=a.customer_id, number=f"INV-{n + 1:05d}",
                  lines=calc["lines"], subtotal=calc["subtotal"], vat=calc["vat"], total=calc["total"],
                  currency=ctx.business.currency, status=InvoiceStatus.draft)
    ctx.db.add(inv)
    ctx.db.flush()
    return {"ok": True, "invoice_id": inv.id, "number": inv.number, "status": "draft",
            "lines": calc["lines"], "subtotal": str(inv.subtotal), "vat": str(inv.vat),
            "total": str(inv.total), "currency": inv.currency}


# ---------- consequential (approval required) ----------
def send_email(ctx: Ctx, a: DraftEmail) -> dict:
    c = _get_customer(ctx, a.customer_id)
    if not c.email:
        return {"ok": False, "error": "Customer has no email address"}
    # No email provider connected in the MVP: the approved message goes to the outbox and the
    # Android app hands it to the user's own mail app via the share sheet. Never claim delivery.
    ctx.db.add(CustomerNote(business_id=ctx.business.id, customer_id=c.id, author_id=ctx.user.id,
                            body=f"Email approved for sending. Subject: {a.subject}"))
    return {"ok": True, "status": "queued_for_user_to_send", "delivery_confirmed": False,
            "to": c.email, "subject": a.subject, "body": a.body}


class ApproveInvoice(BaseModel):
    invoice_id: str


def approve_invoice(ctx: Ctx, a: ApproveInvoice) -> dict:
    inv = ctx.db.get(Invoice, a.invoice_id)
    if not inv or inv.business_id != ctx.business.id:
        return {"ok": False, "error": "Invoice not found"}
    if inv.status != InvoiceStatus.draft:
        return {"ok": False, "error": f"Invoice is {inv.status.value}, not draft"}
    inv.status = InvoiceStatus.approved
    return {"ok": True, "invoice_id": inv.id, "number": inv.number, "status": "approved"}


REGISTRY: dict[str, Tool] = {t.name: t for t in [
    Tool("search_customers", "Search CRM customers and leads by name, email or company.", SearchCustomers, Role.staff, False, search_customers),
    Tool("get_customer_history", "Get a customer's profile, notes and invoices.", CustomerId, Role.staff, False, customer_history),
    Tool("list_inactive_customers", "List customers with no purchase in the last N days.", InactiveArgs, Role.staff, False, inactive_customers),
    Tool("check_stock", "Get verified stock level and price for a product SKU.", SkuArgs, Role.staff, False, check_stock),
    Tool("list_low_stock", "List products at or below their reorder level.", NoArgs, Role.staff, False, low_stock),
    Tool("draft_email", "Prepare an email draft to a customer. Does NOT send.", DraftEmail, Role.staff, False, draft_email),
    Tool("create_customer", "Create a new customer or lead record.", CreateCustomer, Role.staff, False, create_customer),
    Tool("add_customer_note", "Add a note / follow-up reminder to a customer.", AddNote, Role.staff, False, add_note),
    Tool("draft_invoice", "Create a DRAFT invoice; prices and VAT are computed from the product database.", DraftInvoice, Role.staff, False, draft_invoice),
    Tool("send_email", "Send an email to a customer. Requires human approval.", DraftEmail, Role.staff, True, send_email),
    Tool("approve_invoice", "Mark a draft invoice as approved. Requires human approval by a manager.", ApproveInvoice, Role.manager, True, approve_invoice),
]}


def tools_for(role: Role) -> list[Tool]:
    return [t for t in REGISTRY.values() if ROLE_RANK[role] >= ROLE_RANK[Role.staff]]


def can_execute(tool: Tool, role: Role) -> bool:
    return ROLE_RANK[role] >= ROLE_RANK[tool.min_role]


def idempotency_key(business_id: str, tool: str, args: dict) -> str:
    raw = json.dumps({"b": business_id, "t": tool, "a": args}, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode()).hexdigest()
