"""Request context: authenticated user + the business (tenant) they are acting in."""
from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import get_db
from .models import Business, Membership, Role, User
from .security import decode_access_token

_bearer = HTTPBearer(auto_error=False)
ROLE_RANK = {Role.staff: 1, Role.manager: 2, Role.owner: 3}


def current_user(creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
                 db: Session = Depends(get_db)) -> User:
    if not creds:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    user_id = decode_access_token(creds.credentials)
    user = db.get(User, user_id) if user_id else None
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    return user


@dataclass
class Ctx:
    user: User
    business: Business
    role: Role
    db: Session

    def require(self, minimum: Role) -> None:
        if ROLE_RANK[self.role] < ROLE_RANK[minimum]:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Requires {minimum.value} role")


def ctx(x_business_id: str = Header(..., alias="X-Business-Id"),
        user: User = Depends(current_user), db: Session = Depends(get_db)) -> Ctx:
    m = db.scalar(select(Membership).where(Membership.user_id == user.id,
                                           Membership.business_id == x_business_id))
    if not m:
        # Same response whether the business exists or not: no tenant enumeration.
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No access to this business")
    return Ctx(user=user, business=db.get(Business, x_business_id), role=m.role, db=db)
