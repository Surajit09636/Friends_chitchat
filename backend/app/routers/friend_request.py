import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..authentication import oauth2
from ..database_configure import database, models
from ..serialization import (
    _serialize_friend_request,
    _serialize_ws_friend_request_event,
)
from ..schema import Schemas
from ..Websocket_configure.runtime import manager

# Friend request workflow endpoints.
router = APIRouter(tags=["Friend Requests"])

# The following helper functions are defined to keep the main endpoint logic clean and focused on the workflow, while still ensuring we have proper serialization and real-time notifications in place.
def _send_ws_event(user_ids: set[int], payload: dict) -> None:
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        asyncio.run(manager.send_to_users(user_ids, payload))
    else:
        loop.create_task(manager.send_to_users(user_ids, payload))


def _is_friend(db: Session, owner_id: int, friend_id: int) -> bool:
    return (
        db.query(models.Friend.id)
        .filter(
            models.Friend.owner_id == owner_id,
            models.Friend.friend_id == friend_id,
        )
        .first()
        is not None
    )


def _create_friend_edge_if_missing(db: Session, owner_id: int, friend_id: int) -> None:
    if _is_friend(db, owner_id, friend_id):
        return
    db.add(models.Friend(owner_id=owner_id, friend_id=friend_id))


def _create_or_reopen_request(
    db: Session,
    sender: models.User,
    receiver: models.User,
) -> models.FriendRequest:
    if _is_friend(db, sender.id, receiver.id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You are already friends",
        )

    incoming_pending = (
        db.query(models.FriendRequest)
        .filter(
            models.FriendRequest.sender_id == receiver.id,
            models.FriendRequest.receiver_id == sender.id,
            models.FriendRequest.status == "pending",
        )
        .first()
    )
    if incoming_pending:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This user already sent you a friend request",
        )

    existing = (
        db.query(models.FriendRequest)
        .filter(
            models.FriendRequest.sender_id == sender.id,
            models.FriendRequest.receiver_id == receiver.id,
        )
        .first()
    )
    if existing:
        if existing.status == "pending":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Friend request already sent",
            )
        if existing.status == "accepted":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="You are already friends",
            )

        existing.status = "pending"
        existing.responded_at = None
        existing.created_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(existing)
        return existing

    friend_request = models.FriendRequest(
        sender_id=sender.id,
        receiver_id=receiver.id,
        status="pending",
    )
    db.add(friend_request)
    db.commit()
    db.refresh(friend_request)
    return friend_request


@router.post(
    "/friend-requests/{receiver_id}",
    response_model=Schemas.FriendRequestOut,
)
def send_friend_request(
    receiver_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    if receiver_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot send a request to yourself",
        )

    receiver = db.query(models.User).filter(models.User.id == receiver_id).first()
    if not receiver:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    friend_request = _create_or_reopen_request(db, current_user, receiver)
    request_payload = _serialize_friend_request(friend_request)

    _send_ws_event(
        {receiver.id},
        _serialize_ws_friend_request_event("friend_request_received", friend_request),
    )
    _send_ws_event(
        {current_user.id},
        _serialize_ws_friend_request_event("friend_request_sent", friend_request),
    )
    return request_payload


@router.post("/friends/{friend_id}", response_model=Schemas.Message)
def add_friend_alias(
    friend_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    # Backward-compatible alias that now sends a friend request.
    if friend_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot send a request to yourself",
        )

    receiver = db.query(models.User).filter(models.User.id == friend_id).first()
    if not receiver:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    friend_request = _create_or_reopen_request(db, current_user, receiver)
    _send_ws_event(
        {receiver.id},
        _serialize_ws_friend_request_event("friend_request_received", friend_request),
    )
    _send_ws_event(
        {current_user.id},
        _serialize_ws_friend_request_event("friend_request_sent", friend_request),
    )
    return {"message": "Friend request sent"}


@router.get("/friend-requests", response_model=Schemas.FriendRequestListOut)
def list_friend_requests(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    incoming = (
        db.query(models.FriendRequest)
        .filter(
            models.FriendRequest.receiver_id == current_user.id,
            models.FriendRequest.status == "pending",
        )
        .order_by(models.FriendRequest.created_at.desc())
        .all()
    )
    outgoing = (
        db.query(models.FriendRequest)
        .filter(
            models.FriendRequest.sender_id == current_user.id,
            models.FriendRequest.status == "pending",
        )
        .order_by(models.FriendRequest.created_at.desc())
        .all()
    )
    return {
        "incoming": [_serialize_friend_request(item) for item in incoming],
        "outgoing": [_serialize_friend_request(item) for item in outgoing],
    }


@router.post("/friend-requests/{request_id}/accept", response_model=Schemas.Message)
def accept_friend_request(
    request_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    friend_request = (
        db.query(models.FriendRequest)
        .filter(
            models.FriendRequest.id == request_id,
            models.FriendRequest.receiver_id == current_user.id,
        )
        .first()
    )
    if not friend_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Friend request not found",
        )
    if friend_request.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Friend request is no longer pending",
        )

    _create_friend_edge_if_missing(
        db,
        owner_id=friend_request.sender_id,
        friend_id=friend_request.receiver_id,
    )
    _create_friend_edge_if_missing(
        db,
        owner_id=friend_request.receiver_id,
        friend_id=friend_request.sender_id,
    )
    friend_request.status = "accepted"
    friend_request.responded_at = datetime.now(timezone.utc)

    reverse_pending = (
        db.query(models.FriendRequest)
        .filter(
            models.FriendRequest.sender_id == current_user.id,
            models.FriendRequest.receiver_id == friend_request.sender_id,
            models.FriendRequest.status == "pending",
        )
        .first()
    )
    if reverse_pending:
        reverse_pending.status = "declined"
        reverse_pending.responded_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(friend_request)

    # Notify receiver for state sync on their active sessions.
    _send_ws_event(
        {friend_request.receiver_id},
        _serialize_ws_friend_request_event("friend_request_accepted", friend_request),
    )
    # Notify sender explicitly so they see acceptance confirmation.
    _send_ws_event(
        {friend_request.sender_id},
        _serialize_ws_friend_request_event("friend_request_accepted_sender", friend_request),
    )
    return {"message": "Friend request accepted"}


@router.post("/friend-requests/{request_id}/decline", response_model=Schemas.Message)
def decline_friend_request(
    request_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    friend_request = (
        db.query(models.FriendRequest)
        .filter(
            models.FriendRequest.id == request_id,
            models.FriendRequest.receiver_id == current_user.id,
        )
        .first()
    )
    if not friend_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Friend request not found",
        )
    if friend_request.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Friend request is no longer pending",
        )

    friend_request.status = "declined"
    friend_request.responded_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(friend_request)

    _send_ws_event(
        {friend_request.sender_id, friend_request.receiver_id},
        _serialize_ws_friend_request_event("friend_request_declined", friend_request),
    )
    return {"message": "Friend request declined"}
