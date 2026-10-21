from sqlalchemy.orm import Session

from ..models import AuditEvent


def audit(db: Session, action: str, business_id: str | None, user_id: str | None, **detail) -> None:
    db.add(AuditEvent(action=action, business_id=business_id, user_id=user_id, detail=detail))
