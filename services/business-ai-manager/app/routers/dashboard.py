import csv
import io
from decimal import Decimal

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select

from ..deps import Ctx, ctx
from ..models import (ApprovalRequest, ApprovalStatus, Customer, Invoice, InvoiceStatus, Product)
from ..services.billing import entitlement_view, get_entitlement
from ..services.usage import limits_for, month_usage

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard")
def dashboard(c: Ctx = Depends(ctx)):
    b = c.business.id
    customers = c.db.scalar(select(func.count(Customer.id)).where(Customer.business_id == b, Customer.is_lead.is_(False)))
    leads = c.db.scalar(select(func.count(Customer.id)).where(Customer.business_id == b, Customer.is_lead.is_(True)))
    outstanding = c.db.execute(select(func.count(Invoice.id), func.coalesce(func.sum(Invoice.total), 0))
                               .where(Invoice.business_id == b,
                                      Invoice.status.in_([InvoiceStatus.approved, InvoiceStatus.sent]))).one()
    low = c.db.scalar(select(func.count(Product.id)).where(Product.business_id == b,
                                                           Product.stock_qty <= Product.reorder_level))
    pending = c.db.scalar(select(func.count(ApprovalRequest.id)).where(
        ApprovalRequest.business_id == b, ApprovalRequest.status == ApprovalStatus.pending))
    products = c.db.scalar(select(func.count(Product.id)).where(Product.business_id == b))
    ent = get_entitlement(c.db, b)
    c.db.commit()
    return {
        "has_data": bool(customers or leads or products),  # app shows setup prompt when False
        "customers": customers, "leads": leads,
        "outstanding_invoices": {"count": outstanding[0], "total": str(Decimal(outstanding[1]).quantize(Decimal("0.01"))),
                                 "currency": c.business.currency},
        "low_stock_items": low, "pending_approvals": pending,
        "subscription": entitlement_view(ent),
        "ai_usage": {**month_usage(c.db, b), "limits": limits_for(c.db, b)},
    }


@router.get("/finance/invoices")
def invoices(c: Ctx = Depends(ctx)):
    rows = c.db.scalars(select(Invoice).where(Invoice.business_id == c.business.id)
                        .order_by(Invoice.created_at.desc()).limit(200)).all()
    return [{"id": i.id, "number": i.number, "customer_id": i.customer_id, "status": i.status.value,
             "lines": i.lines, "subtotal": str(i.subtotal), "vat": str(i.vat), "total": str(i.total),
             "currency": i.currency, "created_at": i.created_at.isoformat()} for i in rows]


@router.get("/finance/invoices.csv")
def invoices_csv(c: Ctx = Depends(ctx)):
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["number", "customer_id", "status", "subtotal", "vat", "total", "currency", "created_at"])
    for i in c.db.scalars(select(Invoice).where(Invoice.business_id == c.business.id)).all():
        w.writerow([i.number, i.customer_id, i.status.value, i.subtotal, i.vat, i.total, i.currency,
                    i.created_at.isoformat()])
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=invoices.csv"})
