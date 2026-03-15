import asyncio
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, case, or_
from sqlalchemy.orm import Session

from ..authentication import oauth2
from ..database_configure import database, models
from ..serialization import (
    _serialize_chat_message,
    _serialize_chat_thread,
    _serialize_user_summary,
    _serialize_ws_conversation_cleared_event,
    _serialize_ws_friend_removed_event,
    _serialize_ws_message_deleted_for_everyone_event,
    _serialize_ws_message_deleted_for_me_event,
    _serialize_ws_message_edited_event,
    _serialize_ws_message_event,
)
from ..schema import Schemas
from ..Websocket_configure.runtime import manager

# Chat-related endpoints.
router = APIRouter(tags=["Chats"])

# Helper function to filter messages between the current user and a specific friend.
def _conversation_filter(current_user_id: int, friend_id: int):
    return or_(
        and_(
            models.chatting.sender_id == current_user_id,
            models.chatting.receiver_id == friend_id,
        ),
        and_(
            models.chatting.sender_id == friend_id,
            models.chatting.receiver_id == current_user_id,
        ),
    )

# Helper function to filter messages that are visible to the current user (not deleted for them).
def _visible_for_user_filter(current_user_id: int):
    return or_(
        and_(
            models.chatting.sender_id == current_user_id,
            models.chatting.deleted_for_sender.is_(False),
        ),
        and_(
            models.chatting.receiver_id == current_user_id,
            models.chatting.deleted_for_receiver.is_(False),
        ),
    )

# Helper function to ensure the current user has the specified friend.
def _ensure_friendship(db: Session, current_user_id: int, friend_id: int) -> None:
    friend = (
        db.query(models.Friend)
        .filter(
            models.Friend.owner_id == current_user_id,
            models.Friend.friend_id == friend_id,
        )
        .first()
    )
    if not friend:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Friend not added",
        )

# Helper function to send WebSocket events to a set of user IDs.
def _send_ws_event(user_ids: set[int], payload: dict) -> None:
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        asyncio.run(manager.send_to_users(user_ids, payload))
    else:
        loop.create_task(manager.send_to_users(user_ids, payload))


# Friend list + encrypted chat endpoints.
@router.get("/friends", response_model=list[Schemas.FriendOut])
def list_friends(db: Session = Depends(database.get_db),current_user: models.User = Depends(oauth2.get_current_user),):
    
    friends = (db.query(models.User).join(models.Friend, models.Friend.friend_id == models.User.id).filter(models.Friend.owner_id == current_user.id).order_by(models.User.username.asc()).all())
    
    return [_serialize_user_summary(friend) for friend in friends]


@router.delete("/friends/{friend_id}", response_model=Schemas.Message)
def remove_friend(
    friend_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    if friend_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot remove yourself",
        )

    friend_user = db.query(models.User).filter(models.User.id == friend_id).first()
    if not friend_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    _ensure_friendship(db, current_user.id, friend_id)

    # Friendship is stored directionally; remove both edges to fully unfriend.
    (
        db.query(models.Friend)
        .filter(
            or_(
                and_(
                    models.Friend.owner_id == current_user.id,
                    models.Friend.friend_id == friend_id,
                ),
                and_(
                    models.Friend.owner_id == friend_id,
                    models.Friend.friend_id == current_user.id,
                ),
            )
        )
        .delete(synchronize_session=False)
    )

    # Drop prior request records so users can send fresh requests later.
    (
        db.query(models.FriendRequest)
        .filter(
            or_(
                and_(
                    models.FriendRequest.sender_id == current_user.id,
                    models.FriendRequest.receiver_id == friend_id,
                ),
                and_(
                    models.FriendRequest.sender_id == friend_id,
                    models.FriendRequest.receiver_id == current_user.id,
                ),
            )
        )
        .delete(synchronize_session=False)
    )
    db.commit()

    # Realtime sync for both users so UIs can refresh lists immediately.
    _send_ws_event(
        {current_user.id, friend_id},
        _serialize_ws_friend_removed_event(current_user.id, friend_id),
    )
    return {"message": "Friend removed"}


@router.get("/chats", response_model=list[Schemas.ChatThreadOut])
def list_chats(db: Session = Depends(database.get_db),current_user: models.User = Depends(oauth2.get_current_user),):
    
    friends = (db.query(models.User).join(models.Friend, models.Friend.friend_id == models.User.id).filter(models.Friend.owner_id == current_user.id).all())
    
    if not friends:
        return []

    friend_ids = [friend.id for friend in friends]

    messages = (
        db.query(models.chatting)
        .filter(
            _visible_for_user_filter(current_user.id),
            or_(
                and_(
                    models.chatting.sender_id == current_user.id,
                    models.chatting.receiver_id.in_(friend_ids),
                ),
                and_(
                    models.chatting.receiver_id == current_user.id,
                    models.chatting.sender_id.in_(friend_ids),
                ),
            ),
        )
        .order_by(models.chatting.created_at.desc())
        .all()
    )

    last_by_friend: dict[int, models.chatting] = {}
    for message in messages:
        other_id = (
            message.receiver_id
            if message.sender_id == current_user.id
            else message.sender_id
        )
        if other_id not in last_by_friend:
            last_by_friend[other_id] = message

    sorted_friends = sorted(
        friends,
        key=lambda friend: (
            last_by_friend[friend.id].created_at
            if friend.id in last_by_friend
            else datetime.min.replace(tzinfo=timezone.utc)
        ),
        reverse=True,
    )
    return [
        _serialize_chat_thread(friend, last_by_friend.get(friend.id))
        for friend in sorted_friends
    ]


@router.get("/chats/{friend_id}/messages", response_model=list[Schemas.ChatMessageOut])
def list_messages(
    friend_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    _ensure_friendship(db, current_user.id, friend_id)

    messages = (
        db.query(models.chatting)
        .filter(
            _conversation_filter(current_user.id, friend_id),
            _visible_for_user_filter(current_user.id),
        )
        .order_by(models.chatting.created_at.asc())
        .all()
    )
    return [_serialize_chat_message(message) for message in messages]


@router.post(
    "/chats/{friend_id}/messages",
    response_model=Schemas.ChatMessageOut,
    status_code=status.HTTP_201_CREATED,
)
def send_message(
    friend_id: int,
    payload: Schemas.ChatMessageCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    # HTTP fallback for sending encrypted messages (WebSocket is preferred).
    if friend_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot message yourself",
        )

    _ensure_friendship(db, current_user.id, friend_id)

    message_ciphertext = payload.ciphertext.strip()
    message_iv = payload.iv.strip()
    if not message_ciphertext or not message_iv:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Encrypted message payload required",
        )

    new_message = models.chatting(
        sender_id=current_user.id,
        receiver_id=friend_id,
        ciphertext=message_ciphertext,
        iv=message_iv,
    )
    db.add(new_message)
    db.commit()
    db.refresh(new_message)

    _send_ws_event({current_user.id, friend_id}, _serialize_ws_message_event(new_message))
    return _serialize_chat_message(new_message)


@router.patch(
    "/chats/{friend_id}/messages/{message_id}",
    response_model=Schemas.ChatMessageOut,
)
def edit_message(
    friend_id: int,
    message_id: int,
    payload: Schemas.ChatMessageEdit,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    _ensure_friendship(db, current_user.id, friend_id)

    message = (
        db.query(models.chatting)
        .filter(
            models.chatting.id == message_id,
            _conversation_filter(current_user.id, friend_id),
        )
        .first()
    )
    if not message:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found",
        )

    if message.sender_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the sender can edit this message",
        )

    if message.is_deleted_for_everyone or message.deleted_for_sender:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot edit this message",
        )

    next_ciphertext = payload.ciphertext.strip()
    next_iv = payload.iv.strip()
    if not next_ciphertext or not next_iv:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Encrypted message payload required",
        )

    message.ciphertext = next_ciphertext
    message.iv = next_iv
    message.edited_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(message)

    _send_ws_event(
        {current_user.id, friend_id},
        _serialize_ws_message_edited_event(friend_id, message),
    )
    return _serialize_chat_message(message)


@router.delete("/chats/{friend_id}/messages/{message_id}", response_model=Schemas.Message)
def delete_message(
    friend_id: int,
    message_id: int,
    scope: Literal["me", "everyone"] = Query(default="me"),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    _ensure_friendship(db, current_user.id, friend_id)

    message = (
        db.query(models.chatting)
        .filter(
            models.chatting.id == message_id,
            _conversation_filter(current_user.id, friend_id),
        )
        .first()
    )
    if not message:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found",
        )

    if scope == "everyone":
        if message.sender_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the sender can delete for everyone",
            )
        if message.is_deleted_for_everyone:
            return {"message": "Message already deleted from everyone"}

        message.is_deleted_for_everyone = True
        message.ciphertext = ""
        message.iv = ""
        message.edited_at = None
        db.commit()

        _send_ws_event(
            {current_user.id, friend_id},
            _serialize_ws_message_deleted_for_everyone_event(friend_id, message.id),
        )
        return {"message": "Message deleted from everyone"}

    if message.sender_id == current_user.id:
        if message.deleted_for_sender:
            return {"message": "Message already deleted from your chat"}
        message.deleted_for_sender = True
    else:
        if message.deleted_for_receiver:
            return {"message": "Message already deleted from your chat"}
        message.deleted_for_receiver = True

    db.commit()
    _send_ws_event(
        {current_user.id},
        _serialize_ws_message_deleted_for_me_event(friend_id, message.id),
    )
    return {"message": "Message deleted from your chat"}


@router.delete("/chats/{friend_id}", response_model=Schemas.Message)
def delete_friend_chat(
    friend_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    _ensure_friendship(db, current_user.id, friend_id)

    (
        db.query(models.chatting)
        .filter(_conversation_filter(current_user.id, friend_id))
        .update(
            {
                models.chatting.deleted_for_sender: case(
                    (models.chatting.sender_id == current_user.id, True),
                    else_=models.chatting.deleted_for_sender,
                ),
                models.chatting.deleted_for_receiver: case(
                    (models.chatting.receiver_id == current_user.id, True),
                    else_=models.chatting.deleted_for_receiver,
                ),
            },
            synchronize_session=False,
        )
    )
    db.commit()

    _send_ws_event(
        {current_user.id},
        _serialize_ws_conversation_cleared_event(friend_id),
    )
    return {"message": "Chat deleted from your account"}
