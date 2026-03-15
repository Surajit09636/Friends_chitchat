from datetime import datetime

from .database_configure import models


def _serialize_datetime(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.isoformat()


def _serialize_user_summary(user: models.User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "name": user.name,
        "email": user.email,
        "public_key": user.public_key,
    }


def _serialize_user_out(user: models.User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "name": user.name,
        "created_at": _serialize_datetime(user.created_at),
        "public_key": user.public_key,
    }


def _serialize_friend_request(friend_request: models.FriendRequest) -> dict:
    return {
        "id": friend_request.id,
        "status": friend_request.status,
        "created_at": _serialize_datetime(friend_request.created_at),
        "responded_at": _serialize_datetime(friend_request.responded_at),
        "sender": _serialize_user_summary(friend_request.sender),
        "receiver": _serialize_user_summary(friend_request.receiver),
    }


def _serialize_chat_message(message: models.chatting) -> dict:
    return {
        "id": message.id,
        "sender_id": message.sender_id,
        "receiver_id": message.receiver_id,
        "ciphertext": message.ciphertext,
        "iv": message.iv,
        "crypto_version": message.crypto_version,
        "is_deleted_for_everyone": message.is_deleted_for_everyone,
        "edited_at": _serialize_datetime(message.edited_at),
        "created_at": _serialize_datetime(message.created_at),
    }


def _serialize_chat_thread(friend: models.User, last_message: models.chatting | None) -> dict:
    return {
        "friend": _serialize_user_summary(friend),
        "last_message_id": last_message.id if last_message else None,
        "last_message_ciphertext": last_message.ciphertext if last_message else None,
        "last_message_iv": last_message.iv if last_message else None,
        "last_message_version": last_message.crypto_version if last_message else None,
        "last_message_deleted_for_everyone": (
            last_message.is_deleted_for_everyone if last_message else None
        ),
        "last_time": _serialize_datetime(last_message.created_at if last_message else None),
    }


def _serialize_ws_friend_request_event(event_type: str, friend_request: models.FriendRequest) -> dict:
    return {
        "type": event_type,
        "request": _serialize_friend_request(friend_request),
    }


def _serialize_ws_message_event(message: models.chatting) -> dict:
    return {
        "type": "message",
        "message": _serialize_chat_message(message),
    }


def _serialize_ws_message_edited_event(friend_id: int, message: models.chatting) -> dict:
    return {
        "type": "message_edited",
        "friend_id": friend_id,
        "message": _serialize_chat_message(message),
    }


def _serialize_ws_friend_removed_event(actor_id: int, friend_id: int) -> dict:
    return {
        "type": "friend_removed",
        "actor_id": actor_id,
        "friend_id": friend_id,
    }


def _serialize_ws_message_deleted_for_everyone_event(friend_id: int, message_id: int) -> dict:
    return {
        "type": "message_deleted_for_everyone",
        "friend_id": friend_id,
        "message_id": message_id,
    }


def _serialize_ws_message_deleted_for_me_event(friend_id: int, message_id: int) -> dict:
    return {
        "type": "message_deleted_for_me",
        "friend_id": friend_id,
        "message_id": message_id,
    }


def _serialize_ws_conversation_cleared_event(friend_id: int) -> dict:
    return {
        "type": "conversation_cleared",
        "friend_id": friend_id,
    }
