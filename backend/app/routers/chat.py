from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from ..authentication import oauth2
from ..database_configure import database, models
from ..schema import Schemas

# Chat-related endpoints.
router = APIRouter(tags=["Chats"])


@router.post("/friends/{friend_id}", response_model=Schemas.FriendOut, status_code=status.HTTP_201_CREATED)
def add_friend(
    friend_id: int,
    db: Session = Depends(database.get_db),current_user: models.User = Depends(oauth2.get_current_user),):
    if friend_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,detail="You cannot add yourself",)

    friend = db.query(models.User).filter(models.User.id == friend_id).first()
    if not friend:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,detail="User not found",)

    existing = (
        db.query(models.Friend).filter(models.Friend.owner_id == current_user.id,models.Friend.friend_id == friend_id,).first())
    if existing:
        return friend

    new_friend = models.Friend(owner_id=current_user.id, friend_id=friend_id)
    db.add(new_friend)
    db.commit()
    return friend


@router.get("/friends", response_model=list[Schemas.FriendOut])
def list_friends(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    friends = (
        db.query(models.User)
        .join(models.Friend, models.Friend.friend_id == models.User.id)
        .filter(models.Friend.owner_id == current_user.id)
        .order_by(models.User.username.asc())
        .all()
    )
    return friends


@router.get("/chats", response_model=list[Schemas.ChatThreadOut])
def list_chats(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    friends = (
        db.query(models.User)
        .join(models.Friend, models.Friend.friend_id == models.User.id)
        .filter(models.Friend.owner_id == current_user.id)
        .all()
    )
    if not friends:
        return []

    friend_ids = [friend.id for friend in friends]

    messages = (
        db.query(models.chatting)
        .filter(
            or_(
                and_(
                    models.chatting.sender_id == current_user.id,
                    models.chatting.receiver_id.in_(friend_ids),
                ),
                and_(
                    models.chatting.receiver_id == current_user.id,
                    models.chatting.sender_id.in_(friend_ids),
                ),
            )
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

    threads: list[Schemas.ChatThreadOut] = []
    for friend in friends:
        last = last_by_friend.get(friend.id)
        threads.append(
            Schemas.ChatThreadOut(
                friend=friend,
                last_message_ciphertext=last.ciphertext if last else None,
                last_message_iv=last.iv if last else None,
                last_message_version=last.crypto_version if last else None,
                last_time=last.created_at if last else None,
            )
        )

    threads.sort(
        key=lambda thread: thread.last_time
        or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )
    return threads


@router.get("/chats/{friend_id}/messages", response_model=list[Schemas.ChatMessageOut])
def list_messages(
    friend_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    friend = (
        db.query(models.Friend)
        .filter(
            models.Friend.owner_id == current_user.id,
            models.Friend.friend_id == friend_id,
        )
        .first()
    )
    if not friend:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Friend not added",
        )

    messages = (
        db.query(models.chatting)
        .filter(
            or_(
                and_(
                    models.chatting.sender_id == current_user.id,
                    models.chatting.receiver_id == friend_id,
                ),
                and_(
                    models.chatting.sender_id == friend_id,
                    models.chatting.receiver_id == current_user.id,
                ),
            )
        )
        .order_by(models.chatting.created_at.asc())
        .all()
    )
    return messages


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

    friend = (
        db.query(models.Friend)
        .filter(
            models.Friend.owner_id == current_user.id,
            models.Friend.friend_id == friend_id,
        )
        .first()
    )
    if not friend:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Friend not added",
        )

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
    return new_message
