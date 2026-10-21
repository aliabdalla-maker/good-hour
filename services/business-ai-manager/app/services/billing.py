"""Trial + Google Play subscription entitlement.

Commercial model (see docs/BILLING.md):
* 30-day app-level free trial per business, no payment method needed, ads may show.
* Then Google Play subscription GBP 4.99/month (product `sme_ai_manager_monthly`). Configure
  NO Play free-trial offer on that product so users never get an unexpected first charge.
* The server, never the device, decides entitlement. Purchase tokens are verified with the
  Google Play Developer API (purchases.subscriptionsv2.get) and kept fresh via RTDN.
"""
import hashlib
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import Entitlement, SubscriptionState


def _utc(d: datetime | None) -> datetime | None:
    if d is None:
        return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def create_entitlement(db: Session, business_id: str, trial_eligible: bool) -> Entitlement:
    now = datetime.now(timezone.utc)
    days = get_settings().trial_days if trial_eligible else 0
    ent = Entitlement(business_id=business_id, trial_started_at=now, trial_ends_at=now + timedelta(days=days),
                      state=SubscriptionState.trial if trial_eligible else SubscriptionState.expired)
    db.add(ent)
    return ent


def get_entitlement(db: Session, business_id: str) -> Entitlement:
    ent = db.scalar(select(Entitlement).where(Entitlement.business_id == business_id))
    if ent is None:
        ent = create_entitlement(db, business_id, trial_eligible=False)
        db.flush()
    _refresh_time_based_state(ent)
    return ent


def _refresh_time_based_state(ent: Entitlement) -> None:
    now = datetime.now(timezone.utc)
    if ent.state == SubscriptionState.trial and _utc(ent.trial_ends_at) <= now:
        ent.state = SubscriptionState.expired
    if ent.state in (SubscriptionState.active, SubscriptionState.cancelled, SubscriptionState.grace) \
            and ent.paid_until and _utc(ent.paid_until) <= now:
        ent.state = SubscriptionState.expired


def has_access(ent: Entitlement) -> bool:
    return ent.state in (SubscriptionState.trial, SubscriptionState.active,
                         SubscriptionState.grace, SubscriptionState.cancelled)


def entitlement_view(ent: Entitlement) -> dict:
    s = get_settings()
    now = datetime.now(timezone.utc)
    trial_end = _utc(ent.trial_ends_at)
    return {
        "state": ent.state.value,
        "has_access": has_access(ent),
        "show_ads": ent.state == SubscriptionState.trial,
        "trial_ends_at": trial_end.isoformat(),
        "trial_days_left": max(0, (trial_end - now).days) if ent.state == SubscriptionState.trial else 0,
        "paid_until": _utc(ent.paid_until).isoformat() if ent.paid_until else None,
        "auto_renewing": ent.auto_renewing,
        "price_display": f"£{s.subscription_price_gbp}/month after the one-month free trial",
        "product_id": s.play_subscription_id,
    }


# ---------------- Google Play verification ----------------
@dataclass
class PlayStatus:
    valid: bool
    state: SubscriptionState
    expiry: datetime | None
    auto_renewing: bool
    product_id: str | None
    acknowledged: bool = True


class PlayVerifier:
    def verify(self, purchase_token: str) -> PlayStatus:  # pragma: no cover - interface
        raise NotImplementedError


_STATE_MAP = {
    "SUBSCRIPTION_STATE_ACTIVE": SubscriptionState.active,
    "SUBSCRIPTION_STATE_IN_GRACE_PERIOD": SubscriptionState.grace,
    "SUBSCRIPTION_STATE_CANCELED": SubscriptionState.cancelled,
    "SUBSCRIPTION_STATE_ON_HOLD": SubscriptionState.expired,
    "SUBSCRIPTION_STATE_PAUSED": SubscriptionState.expired,
    "SUBSCRIPTION_STATE_EXPIRED": SubscriptionState.expired,
    "SUBSCRIPTION_STATE_PENDING": SubscriptionState.expired,
}


class GooglePlayVerifier(PlayVerifier):
    """Uses the Android Publisher API v3 with a service account linked in Play Console."""

    def __init__(self, service_account_file: str, package_name: str):
        from google.oauth2 import service_account  # type: ignore
        from googleapiclient.discovery import build  # type: ignore
        creds = service_account.Credentials.from_service_account_file(
            service_account_file, scopes=["https://www.googleapis.com/auth/androidpublisher"])
        self._api = build("androidpublisher", "v3", credentials=creds, cache_discovery=False)
        self._pkg = package_name

    def verify(self, purchase_token: str) -> PlayStatus:
        r = self._api.purchases().subscriptionsv2().get(packageName=self._pkg, token=purchase_token).execute()
        item = (r.get("lineItems") or [{}])[0]
        expiry = item.get("expiryTime")
        exp = datetime.fromisoformat(expiry.replace("Z", "+00:00")) if expiry else None
        state = _STATE_MAP.get(r.get("subscriptionState", ""), SubscriptionState.expired)
        return PlayStatus(valid=state != SubscriptionState.expired, state=state, expiry=exp,
                          auto_renewing=bool(item.get("autoRenewingPlan", {}).get("autoRenewEnabled")),
                          product_id=item.get("productId"),
                          acknowledged=r.get("acknowledgementState") == "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED")


class DevFakeVerifier(PlayVerifier):
    """Development only: tokens beginning 'test-active' / 'test-expired'. Refused in production."""

    def verify(self, purchase_token: str) -> PlayStatus:
        now = datetime.now(timezone.utc)
        if purchase_token.startswith("test-active"):
            return PlayStatus(True, SubscriptionState.active, now + timedelta(days=30), True,
                              get_settings().play_subscription_id)
        return PlayStatus(False, SubscriptionState.expired, None, False, None)


def get_verifier() -> PlayVerifier:
    s = get_settings()
    if s.google_service_account_json:
        return GooglePlayVerifier(s.google_service_account_json, s.play_package_name)
    if s.environment == "production":
        raise RuntimeError("GOOGLE_SERVICE_ACCOUNT_JSON must be configured in production")
    return DevFakeVerifier()


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def apply_play_status(ent: Entitlement, status: PlayStatus, token: str) -> None:
    ent.state = status.state
    ent.paid_until = status.expiry
    ent.auto_renewing = status.auto_renewing
    ent.purchase_token_hash = token_hash(token)
    ent.updated_at = datetime.now(timezone.utc)
