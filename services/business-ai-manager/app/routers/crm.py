from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import delete, or_, select

from ..agent.tools import _cust
from ..deps import Ctx, ctx
from ..models import Customer, CustomerNote, Invoice, Product, Role
from ..services.audit import audit

router = APIRouter(prefix="/crm", tags=["crm"])


class CustomerIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=50)
    company: str | None = Field(default=None, max_length=200)
    segment: str | None = Field(default=None, max_length=50)
    is_lead: bool = False
    pipeline_stage: str = Field(default="new", pattern="^(new|contacted|quoted|won|lost)$")
    last_purchase_at: datetime | None = None


@router.get("/customers")
def list_customers(q: str | None = Query(default=None, max_length=100), leads: bool | None = None,
                   limit: int = Query(default=50, le=200), offset: int = 0, c: Ctx = Depends(ctx)):
    stmt = select(Customer).where(Customer.business_id == c.business.id)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Customer.name.ilike(like), Customer.email.ilike(like), Customer.company.ilike(like)))
    if leads is not None:
        stmt = stmt.where(Customer.is_lead.is_(leads))
    rows = c.db.scalars(stmt.order_by(Customer.name).limit(limit).offset(offset)).all()
    return [_cust(x) for x in rows]


@router.post("/customers", status_code=201)
def create_customer(body: CustomerIn, c: Ctx = Depends(ctx)):
    cu = Customer(business_id=c.business.id, **body.model_dump())
    c.db.add(cu)
    c.db.flush()
    audit(c.db, "crm.customer.created", c.business.id, c.user.id, customer_id=cu.id)
    c.db.commit()
    return _cust(cu)


def _own(c: Ctx, cid: str) -> Customer:
    cu = c.db.get(Customer, cid)
    if not cu or cu.business_id != c.business.id:
        raise HTTPException(404, "Customer not found")
    return cu


@router.get("/customers/{cid}")
def get_customer(cid: str, c: Ctx = Depends(ctx)):
    cu = _own(c, cid)
    notes = c.db.scalars(select(CustomerNote).where(CustomerNote.customer_id == cid)
                         .order_by(CustomerNote.created_at.desc())).all()
    return {**_cust(cu), "notes": [{"id": n.id, "body": n.body, "created_at": n.created_at.isoformat(),
                                    "follow_up_at": n.follow_up_at.isoformat() if n.follow_up_at else None}
                                   for n in notes]}


@router.put("/customers/{cid}")
def update_customer(cid: str, body: CustomerIn, c: Ctx = Depends(ctx)):
    cu = _own(c, cid)
    for k, v in body.model_dump().items():
        setattr(cu, k, v)
    audit(c.db, "crm.customer.updated", c.business.id, c.user.id, customer_id=cid)
    c.db.commit()
    return _cust(cu)


@router.delete("/customers/{cid}", status_code=204)
def delete_customer(cid: str, c: Ctx = Depends(ctx)):
    c.require(Role.manager)
    _own(c, cid)
    if c.db.scalar(select(Invoice.id).where(Invoice.customer_id == cid)) is not None:
        raise HTTPException(409, "This customer has invoices. Keep the customer for your records, "
                                 "or delete their invoices first.")
    c.db.execute(delete(CustomerNote).where(CustomerNote.customer_id == cid))
    c.db.execute(delete(Customer).where(Customer.id == cid))
    audit(c.db, "crm.customer.deleted", c.business.id, c.user.id, customer_id=cid)
    c.db.commit()


class NoteIn(BaseModel):
    body: str = Field(min_length=1, max_length=4000)
    follow_up_at: datetime | None = None


@router.post("/customers/{cid}/notes", status_code=201)
def add_note(cid: str, body: NoteIn, c: Ctx = Depends(ctx)):
    _own(c, cid)
    n = CustomerNote(business_id=c.business.id, customer_id=cid, author_id=c.user.id, **body.model_dump())
    c.db.add(n)
    c.db.commit()
    return {"id": n.id}


class ProductIn(BaseModel):
    sku: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=200)
    unit_price: float = Field(ge=0)
    stock_qty: int = Field(ge=0)
    reorder_level: int = Field(default=0, ge=0)


@router.post("/products", status_code=201)
def create_product(body: ProductIn, c: Ctx = Depends(ctx)):
    c.require(Role.manager)
    p = Product(business_id=c.business.id, **{**body.model_dump(), "sku": body.sku.upper()})
    c.db.add(p)
    c.db.commit()
    return {"id": p.id, "sku": p.sku}


@router.get("/products")
def list_products(c: Ctx = Depends(ctx)):
    rows = c.db.scalars(select(Product).where(Product.business_id == c.business.id).order_by(Product.sku)).all()
    return [{"id": p.id, "sku": p.sku, "name": p.name, "unit_price": str(p.unit_price),
             "stock_qty": p.stock_qty, "reorder_level": p.reorder_level} for p in rows]
