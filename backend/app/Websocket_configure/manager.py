from collections import defaultdict
from typing import Any, DefaultDict, Set

from fastapi import WebSocket

# In-memory connection registry (per-process).
# For multi-worker deployments, replace with a shared pub/sub layer.


class ConnectionManager:
    # Tracks active WebSocket connections per user id.
    def __init__(self) -> None:
        self._connections: DefaultDict[int, Set[WebSocket]] = defaultdict(set)

    async def connect(self, user_id: int, websocket: WebSocket) -> None:
        # Accept the connection and register it for the user.
        await websocket.accept()
        self._connections[user_id].add(websocket)

    def disconnect(self, user_id: int, websocket: WebSocket) -> None:
        # Remove a WebSocket from the registry.
        if user_id in self._connections:
            self._connections[user_id].discard(websocket)
            if not self._connections[user_id]:
                self._connections.pop(user_id, None)

    async def send_to_user(self, user_id: int, payload: dict[str, Any]) -> None:
        # Send a JSON payload to all sockets for a user (best-effort).
        sockets = list(self._connections.get(user_id, set()))
        for socket in sockets:
            try:
                await socket.send_json(payload)
            except Exception:
                # If sending fails, drop the connection.
                self.disconnect(user_id, socket)

    async def send_to_users(self, user_ids: set[int], payload: dict[str, Any]) -> None:
        # Fan-out a JSON payload to multiple users.
        for user_id in user_ids:
            await self.send_to_user(user_id, payload)
