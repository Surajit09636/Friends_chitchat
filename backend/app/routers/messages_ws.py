from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from sqlalchemy.orm import Session

from ..authentication import oauth2
from ..database_configure import database, models
from ..serialization import _serialize_ws_message_event
from ..Websocket_configure.runtime import manager

# WebSocket router for realtime message delivery.
router = APIRouter()


@router.websocket("/ws/messages")
async def messages_socket(websocket: WebSocket):
    # Manual auth because WebSocket connections cannot use headers in browsers.
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # Validate token first (no DB needed yet).
    try:
        token_data = oauth2.verify_access_token(token,credentials_exception=Exception("Invalid token"),)
    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # Load user after token validation.
    db: Session = next(database.get_db())
    current_user = (db.query(models.User).filter(models.User.id == token_data.id).first())
    if not current_user:
        db.close()
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await manager.connect(current_user.id, websocket)

    try:
        while True:
            # Expected payload: { type: "message", friend_id, ciphertext, iv }
            payload = await websocket.receive_json()
            if not isinstance(payload, dict):
                await websocket.send_json(
                    {"type": "error", "detail": "Invalid payload"}
                )
                continue
            if payload.get("type") != "message":
                await websocket.send_json(
                    {"type": "error", "detail": "Unsupported message type"}
                )
                continue

            # Coerce friend id from JSON payload.
            try:
                friend_id = int(payload.get("friend_id"))
            except (TypeError, ValueError):
                friend_id = None
            ciphertext = payload.get("ciphertext")
            iv = payload.get("iv")
            if not isinstance(ciphertext, str):
                ciphertext = ""
            if not isinstance(iv, str):
                iv = ""
            ciphertext = ciphertext.strip()
            iv = iv.strip()

            if not friend_id or friend_id == current_user.id:
                await websocket.send_json(
                    {"type": "error", "detail": "Invalid friend id"}
                )
                continue

            if not ciphertext or not iv:
                await websocket.send_json(
                    {"type": "error", "detail": "Encrypted payload required"}
                )
                continue

            # Ensure the recipient is an added friend.
            friend = (db.query(models.Friend).filter(models.Friend.owner_id == current_user.id,models.Friend.friend_id == friend_id,).first())
            if not friend:
                await websocket.send_json(
                    {"type": "error", "detail": "Friend not added"}
                )
                continue

            # Persist the encrypted message.
            new_message = models.chatting(
                sender_id=current_user.id,
                receiver_id=friend_id,
                ciphertext=ciphertext,
                iv=iv,
            )
            db.add(new_message)
            db.commit()
            db.refresh(new_message)

            # Fan-out the message to sender and receiver if connected.
            message_payload = _serialize_ws_message_event(new_message)
            await manager.send_to_users({current_user.id, friend_id}, message_payload)
    except WebSocketDisconnect:
        manager.disconnect(current_user.id, websocket)
    finally:
        db.close()
