import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_user
from ..models import Business, Membership, Role, User
from ..security import create_access_token, hash_password, verify_password
from ..services.audit import audit
from ..services.billing import create_entitlement

router = APIRouter(prefix="/auth", tags=["auth"])
biz = APIRouter(prefix="/businesses", tags=["businesses"])


class Register(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    full_name: str = Field(min_length=1, max_length=200)
    preferred_language: str = Field(default="en", max_length=10)


class Login(BaseModel):
    email: EmailStr
    password: str


def _me(db: Session, u: User) -> dict:
    ms = db.scalars(select(Membership).where(Membership.user_id == u.id)).all()
    return {"id": u.id, "email": u.email, "full_name": u.full_name, "preferred_language": u.preferred_language,
            "businesses": [{"id": m.business_id, "name": db.get(Business, m.business_id).name,
                            "role": m.role.value} for m in ms]}


@router.post("/register", status_code=201)
def register(body: Register, db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    u = User(email=email, full_name=body.full_name, password_hash=hash_password(body.password),
             preferred_language=body.preferred_language)
    db.add(u)
    db.flush()
    audit(db, "user.registered", None, u.id)
    db.commit()
    return {"access_token": create_access_token(u.id), "token_type": "bearer", "user": _me(db, u)}


@router.post("/login")
def login(body: Login, db: Session = Depends(get_db)):
    u = db.scalar(select(User).where(User.email == body.email.lower()))
    if not u or not verify_password(body.password, u.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")
    audit(db, "user.login", None, u.id)
    db.commit()
    return {"access_token": create_access_token(u.id), "token_type": "bearer", "user": _me(db, u)}


@router.get("/me")
def me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _me(db, user)


class NewBusiness(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    currency: str = Field(default="GBP", min_length=3, max_length=3)


@biz.post("", status_code=201)
def create_business(body: NewBusiness, user: User = Depends(current_user), db: Session = Depends(get_db)):
    # One free trial per person: a user who already owns a business gets no second trial.
    already_owner = db.scalar(select(Membership).where(Membership.user_id == user.id,
                                                       Membership.role == Role.owner))
    b = Business(name=body.name, currency=body.currency.upper(), join_code=secrets.token_urlsafe(6)[:8].upper())
    db.add(b)
    db.flush()
    db.add(Membership(user_id=user.id, business_id=b.id, role=Role.owner))
    create_entitlement(db, b.id, trial_eligible=already_owner is None)
    audit(db, "business.created", b.id, user.id)
    db.commit()
    return {"id": b.id, "name": b.name, "join_code": b.join_code, "role": "owner"}


class JoinBusiness(BaseModel):
    join_code: str = Field(min_length=4, max_length=12)


@biz.post("/join")
def join_business(body: JoinBusiness, user: User = Depends(current_user), db: Session = Depends(get_db)):
    b = db.scalar(select(Business).where(Business.join_code == body.join_code.upper()))
    if not b:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invalid join code")
    if not db.scalar(select(Membership).where(Membership.user_id == user.id, Membership.business_id == b.id)):
        db.add(Membership(user_id=user.id, business_id=b.id, role=Role.staff))
        audit(db, "business.joined", b.id, user.id)
        db.commit()
    return {"id": b.id, "name": b.name, "role": "staff"}


class LanguageIn(BaseModel):
    preferred_language: str = Field(min_length=2, max_length=10)


@router.patch("/me")
def set_language(body: LanguageIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    user.preferred_language = body.preferred_language
    db.commit()
    return _me(db, user)


@router.delete("/me", status_code=204)
def delete_account(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Google Play requires in-app account deletion. Deletes the user and any workspace where
    they are the only member (with its business data and uploaded files). Shared workspaces are
    kept for colleagues: the user's personal conversations are deleted and their name is removed
    from shared records (author fields are set to NULL).

    Uses explicit DELETE/UPDATE statements in foreign-key order, so it behaves the same on
    PostgreSQL (which enforces foreign keys) as on SQLite."""
    import os

    from sqlalchemy import delete, update

    from ..config import get_settings
    from ..models import (ApprovalRequest, Conversation, Customer, CustomerNote, Entitlement, Invoice, Message,
                          Product, StoredFile, ToolExecution, UsageRecord)

    storage_dir = get_settings().storage_dir
    uid = user.id
    removed_keys: list[str] = []
    business_ids = db.scalars(select(Membership.business_id).where(Membership.user_id == uid)).all()
    for bid in business_ids:
        others = db.scalar(select(Membership.id).where(Membership.business_id == bid, Membership.user_id != uid))
        if others is None:
            # Sole member: remove the whole workspace, children before parents.
            keys = db.scalars(select(StoredFile.storage_key).where(StoredFile.business_id == bid)).all()
            convs = select(Conversation.id).where(Conversation.business_id == bid)
            db.execute(delete(ApprovalRequest).where(ApprovalRequest.business_id == bid))
            db.execute(delete(Message).where(Message.conversation_id.in_(convs)))
            for model in (ToolExecution, UsageRecord, CustomerNote, Invoice, StoredFile, Conversation,
                          Customer, Product, Entitlement, Membership):
                db.execute(delete(model).where(model.business_id == bid))
            db.execute(delete(Business).where(Business.id == bid))
            removed_keys.extend(keys)
        else:
            # Shared workspace: delete the user's own conversations, keep shared business records.
            mine = select(Conversation.id).where(Conversation.business_id == bid, Conversation.user_id == uid)
            db.execute(update(ApprovalRequest).where(ApprovalRequest.conversation_id.in_(mine))
                       .values(conversation_id=None))
            db.execute(delete(Message).where(Message.conversation_id.in_(mine)))
            db.execute(delete(Conversation).where(Conversation.business_id == bid, Conversation.user_id == uid))
            db.execute(delete(Membership).where(Membership.business_id == bid, Membership.user_id == uid))
    # Remove the user's name from any remaining records before deleting the user row.
    for col in (CustomerNote.author_id, ApprovalRequest.requested_by, ApprovalRequest.decided_by,
                ToolExecution.user_id, UsageRecord.user_id, StoredFile.uploaded_by):
        db.execute(update(col.class_).where(col == uid).values({col.key: None}))
    audit(db, "user.deleted", None, None, user_hash=uid[:8])
    db.execute(delete(User).where(User.id == uid))
    db.commit()
    # Remove uploaded files only after the database rows are gone.
    for key in removed_keys:
        try:
            os.remove(os.path.join(storage_dir, key))
        except OSError:
            pass
