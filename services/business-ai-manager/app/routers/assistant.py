from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from ..agent.orchestrator import execute, run_agent
from ..agent.tools import REGISTRY, can_execute
from ..deps import Ctx, ctx
from ..llm.base import LLMError
from ..llm.gateway import get_provider
from ..models import ApprovalRequest, ApprovalStatus, Conversation, Message
from ..services.audit import audit
from ..services.billing import get_entitlement, has_access
from ..services.usage import check_llm_quota, rate_limit

router = APIRouter(prefix="/assistant", tags=["assistant"])
approvals = APIRouter(prefix="/approvals", tags=["approvals"])


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    conversation_id: str | None = None


@router.post("/chat")
def chat(body: ChatIn, c: Ctx = Depends(ctx)):
    rate_limit(c.user.id)
    if not has_access(get_entitlement(c.db, c.business.id)):
        raise HTTPException(402, "Your free trial has ended. Subscribe for £4.99/month to keep using the AI assistant.")
    check_llm_quota(c.db, c.business.id)
    if body.conversation_id:
        conv = c.db.get(Conversation, body.conversation_id)
        if not conv or conv.business_id != c.business.id or conv.user_id != c.user.id:
            raise HTTPException(404, "Conversation not found")
    else:
        conv = Conversation(business_id=c.business.id, user_id=c.user.id, title=body.message[:60])
        c.db.add(conv)
        c.db.flush()
    try:
        provider = get_provider()
    except LLMError as e:
        raise HTTPException(503, str(e))
    out = run_agent(c, provider, conv.id, body.message)
    return {"conversation_id": conv.id, **out}


@router.get("/conversations")
def conversations(c: Ctx = Depends(ctx)):
    rows = c.db.scalars(select(Conversation).where(Conversation.business_id == c.business.id,
                                                   Conversation.user_id == c.user.id)
                        .order_by(Conversation.created_at.desc()).limit(50)).all()
    return [{"id": r.id, "title": r.title, "created_at": r.created_at.isoformat()} for r in rows]


@router.get("/conversations/{cid}")
def conversation(cid: str, c: Ctx = Depends(ctx)):
    conv = c.db.get(Conversation, cid)
    if not conv or conv.business_id != c.business.id or conv.user_id != c.user.id:
        raise HTTPException(404, "Conversation not found")
    msgs = c.db.scalars(select(Message).where(Message.conversation_id == cid).order_by(Message.created_at)).all()
    return [{"role": m.role, "content": m.content, "created_at": m.created_at.isoformat()} for m in msgs]


def _view(a: ApprovalRequest) -> dict:
    return {"id": a.id, "tool": a.tool_name, "arguments": a.arguments, "summary": a.summary,
            "status": a.status.value, "result": a.result, "created_at": a.created_at.isoformat()}


@approvals.get("")
def list_approvals(status: str = "pending", c: Ctx = Depends(ctx)):
    rows = c.db.scalars(select(ApprovalRequest).where(ApprovalRequest.business_id == c.business.id,
                                                      ApprovalRequest.status == ApprovalStatus(status))
                        .order_by(ApprovalRequest.created_at.desc()).limit(100)).all()
    return [_view(a) for a in rows]


class Decision(BaseModel):
    approve: bool


@approvals.post("/{aid}/decision")
def decide(aid: str, body: Decision, c: Ctx = Depends(ctx)):
    a = c.db.get(ApprovalRequest, aid)
    if not a or a.business_id != c.business.id:
        raise HTTPException(404, "Approval not found")
    if a.status != ApprovalStatus.pending:
        raise HTTPException(409, f"Already {a.status.value}")
    tool = REGISTRY[a.tool_name]
    if not can_execute(tool, c.role):
        raise HTTPException(403, f"Your role cannot approve {a.tool_name}")
    a.decided_by, a.decided_at = c.user.id, datetime.now(timezone.utc)
    if not body.approve:
        a.status = ApprovalStatus.rejected
        audit(c.db, "approval.rejected", c.business.id, c.user.id, approval_id=aid)
        c.db.commit()
        return _view(a)
    a.status = ApprovalStatus.approved
    result = execute(c, a.tool_name, a.arguments)
    a.result = result
    a.status = ApprovalStatus.executed if result.get("ok") else ApprovalStatus.failed
    audit(c.db, "approval.executed", c.business.id, c.user.id, approval_id=aid, ok=bool(result.get("ok")))
    c.db.commit()
    return _view(a)
