"""Subscription status, purchase verification and Google Play RTDN webhook."""
import base64
import json

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..deps import Ctx, ctx
from ..models import Entitlement
from ..services.audit import audit
from ..services.billing import (apply_play_status, entitlement_view, get_entitlement, get_verifier,
                                token_hash)
from ..services.usage import limits_for, month_usage

router = APIRouter(prefix="/billing", tags=["billing"])


@router.get("/status")
def status(c: Ctx = Depends(ctx)):
    ent = get_entitlement(c.db, c.business.id)
    c.db.commit()
    return {**entitlement_view(ent), "usage": month_usage(c.db, c.business.id),
            "limits": limits_for(c.db, c.business.id)}


class VerifyIn(BaseModel):
    purchase_token: str = Field(min_length=8, max_length=4096)
    product_id: str


@router.post("/verify")
def verify(body: VerifyIn, c: Ctx = Depends(ctx)):
    s = get_settings()
    if body.product_id != s.play_subscription_id:
        raise HTTPException(400, "Unknown product")
    th = token_hash(body.purchase_token)
    other = c.db.scalar(select(Entitlement).where(Entitlement.purchase_token_hash == th,
                                                  Entitlement.business_id != c.business.id))
    if other:  # one purchase cannot unlock several businesses
        audit(c.db, "billing.duplicate_token", c.business.id, c.user.id)
        c.db.commit()
        raise HTTPException(409, "This purchase is already linked to another workspace")
    st = get_verifier().verify(body.purchase_token)
    if st.product_id and st.product_id != s.play_subscription_id:
        raise HTTPException(400, "Purchase is for a different product")
    ent = get_entitlement(c.db, c.business.id)
    if st.valid:
        apply_play_status(ent, st, body.purchase_token)
    audit(c.db, "billing.verified", c.business.id, c.user.id, valid=st.valid, state=st.state.value)
    c.db.commit()
    return {**entitlement_view(ent), "verified": st.valid, "needs_acknowledgement": not st.acknowledged}


@router.post("/rtdn")
async def rtdn(request: Request, db: Session = Depends(get_db)):
    """Google Play Real-time Developer Notifications via Pub/Sub push.
    Secure the push subscription with OIDC auth and restrict this route at the load balancer."""
    envelope = await request.json()
    try:
        data = json.loads(base64.b64decode(envelope["message"]["data"]))
        token = data["subscriptionNotification"]["purchaseToken"]
    except (KeyError, ValueError):
        return {"ignored": True}
    ent = db.scalar(select(Entitlement).where(Entitlement.purchase_token_hash == token_hash(token)))
    if ent:
        apply_play_status(ent, get_verifier().verify(token), token)
        audit(db, "billing.rtdn", ent.business_id, None, state=ent.state.value)
        db.commit()
    return {"ok": True}
