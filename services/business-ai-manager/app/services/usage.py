"""Quotas, rate limiting and cost tracking - keeps a GBP 4.99 plan economically viable."""
import time
from collections import defaultdict, deque
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import SubscriptionState, UsageRecord
from .billing import get_entitlement

# Approximate GBP per million tokens; configure per provider/model as prices change.
PRICE_PER_MTOK = {"anthropic": (Decimal("2.40"), Decimal("12.00")), "mock": (Decimal(0), Decimal(0))}

_windows: dict[str, deque] = defaultdict(deque)  # use Redis in multi-instance production


def rate_limit(user_id: str) -> None:
    limit = get_settings().rate_limit_per_minute
    now = time.monotonic()
    q = _windows[user_id]
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many requests - please wait a minute.")
    q.append(now)


def _month_start() -> datetime:
    n = datetime.now(timezone.utc)
    return n.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def month_usage(db: Session, business_id: str) -> dict:
    row = db.execute(
        select(func.count(UsageRecord.id).filter(UsageRecord.kind == "llm_request"),
               func.coalesce(func.sum(UsageRecord.input_tokens + UsageRecord.output_tokens), 0),
               func.coalesce(func.sum(UsageRecord.bytes).filter(UsageRecord.kind == "file_upload"), 0),
               func.coalesce(func.sum(UsageRecord.est_cost_gbp), 0))
        .where(UsageRecord.business_id == business_id, UsageRecord.created_at >= _month_start())
    ).one()
    return {"llm_requests": int(row[0]), "tokens": int(row[1]), "file_bytes": int(row[2]),
            "est_cost_gbp": str(Decimal(row[3]).quantize(Decimal("0.01")))}


def limits_for(db: Session, business_id: str) -> dict:
    s = get_settings()
    ent = get_entitlement(db, business_id)
    req = s.quota_trial_llm_requests if ent.state == SubscriptionState.trial else s.quota_paid_llm_requests
    return {"llm_requests": req, "tokens": s.quota_tokens_per_month,
            "file_bytes": s.quota_file_mb_per_month * 1024 * 1024}


def check_llm_quota(db: Session, business_id: str) -> None:
    used, lim = month_usage(db, business_id), limits_for(db, business_id)
    if used["llm_requests"] >= lim["llm_requests"] or used["tokens"] >= lim["tokens"]:
        raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED,
                            "Monthly AI usage limit reached. It resets on the 1st of next month.")


def record_llm(db: Session, business_id: str, user_id: str, provider: str, tin: int, tout: int) -> None:
    pin, pout = PRICE_PER_MTOK.get(provider, PRICE_PER_MTOK["anthropic"])
    cost = (Decimal(tin) * pin + Decimal(tout) * pout) / Decimal(1_000_000)
    db.add(UsageRecord(business_id=business_id, user_id=user_id, kind="llm_request", provider=provider,
                       input_tokens=tin, output_tokens=tout, est_cost_gbp=cost))
