import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import {
  acceptFriendRequest,
  deleteChatMessage,
  deleteFriendChat,
  declineFriendRequest,
  editChatMessage,
  getFriendRequests,
  getChatMessages,
  getChatThreads,
  removeFriend,
  searchUsers,
  sendFriendRequest,
} from "../api/authApi";
import { createMessageSocket } from "../api/ws";
import { useCrypto } from "../crypto/CryptoContext";
import "../styles/chat.css";

const formatTimestamp = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const formatDisplayName = (identifier) => {
  if (!identifier) return "";
  return identifier.includes("@") ? identifier.split("@")[0] : identifier;
};

const getInitials = (label) =>
  label
    .split(" ")
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

const getMessageDisplayText = (message) => {
  if (message?.is_deleted_for_everyone) {
    return "This message was deleted";
  }
  return message?.text || "[Encrypted message]";
};

const createNotificationId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export default function Home() {
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const {
    ready: cryptoReady,
    loading: cryptoLoading,
    error: cryptoError,
    unlockWithPassword,
    encryptForFriend,
    decryptForFriend,
  } = useCrypto();
  const [threads, setThreads] = useState([]);
  const [messages, setMessages] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [draft, setDraft] = useState("");
  const [theme, setTheme] = useState("light");
  const [chatQuery, setChatQuery] = useState("");
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [friendQuery, setFriendQuery] = useState("");
  const [friendResults, setFriendResults] = useState([]);
  const [friendError, setFriendError] = useState("");
  const [friendLoading, setFriendLoading] = useState(false);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [chatError, setChatError] = useState("");
  const [unlockPassword, setUnlockPassword] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const [socketStatus, setSocketStatus] = useState("disconnected");
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingDraft, setEditingDraft] = useState("");
  const [messageMenu, setMessageMenu] = useState(null);
  const [threadMenu, setThreadMenu] = useState(null);
  const [isActionPending, setIsActionPending] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [outgoingRequestUserIds, setOutgoingRequestUserIds] = useState([]);
  const [requestToast, setRequestToast] = useState(null);

  // Refs keep the WebSocket handlers in sync with latest state.
  const socketRef = useRef(null);
  const threadsRef = useRef([]);
  const activeIdRef = useRef(null);
  const fetchThreadsRef = useRef(async () => {});
  const fetchFriendRequestsRef = useRef(async () => {});

  const activeThread = threads.find(
    (thread) => thread.friend?.id === activeId
  );
  const activeMessages = messages ?? [];
  const displayName =
    user?.username || formatDisplayName(user?.identifier) || "";
  const notificationCount = notifications.length + incomingRequests.length;

  const addNotification = useCallback((text, type = "info") => {
    const message = text?.trim();
    if (!message) return;

    setNotifications((prev) =>
      [
        {
          id: createNotificationId(),
          text: message,
          type,
          created_at: new Date().toISOString(),
        },
        ...prev,
      ].slice(0, 60)
    );
  }, []);
  const removeNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((item) => item.id !== id));
  }, []);
  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);
  const showRequestToast = useCallback((text) => {
    const message = text?.trim();
    if (!message) return;
    setRequestToast({ id: createNotificationId(), text: message });
  }, []);
  const updateFriendResultStatus = useCallback((targetUserId, status) => {
    if (!targetUserId) return;
    setFriendResults((prev) =>
      prev.map((item) =>
        item.id === targetUserId
          ? { ...item, relationship_status: status }
          : item
      )
    );
  }, []);
  const fetchFriendRequests = useCallback(async () => {
    try {
      const res = await getFriendRequests();
      const incoming = res.data?.incoming ?? [];
      const outgoing = res.data?.outgoing ?? [];
      setIncomingRequests(incoming);
      setOutgoingRequestUserIds(
        [...new Set(
          outgoing
            .map((request) => request.receiver?.id)
            .filter((id) => Number.isInteger(id))
        )]
      );
    } catch (err) {
      // Ignore request sync errors; chat should remain usable.
    }
  }, []);
  const filteredThreads = threads.filter((thread) => {
    if (!chatQuery.trim()) return true;
    const query = chatQuery.trim().toLowerCase();
    const label =
      thread.friend?.name?.trim() || thread.friend?.username || "";
    const preview = thread.last_preview || "";
    const status = thread.friend?.username
      ? `@${thread.friend.username}`
      : "";
    return (
      label.toLowerCase().includes(query) ||
      preview.toLowerCase().includes(query) ||
      status.toLowerCase().includes(query)
    );
  });

  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    const clearMenus = () => {
      setMessageMenu(null);
      setThreadMenu(null);
    };
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      clearMenus();
      setEditingMessageId(null);
      setEditingDraft("");
    };

    window.addEventListener("click", clearMenus);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("click", clearMenus);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  useEffect(() => {
    const storedTheme = localStorage.getItem("theme");
    if (storedTheme === "dark" || storedTheme === "light") {
      setTheme(storedTheme);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!requestToast) return undefined;
    const timer = setTimeout(() => {
      setRequestToast(null);
    }, 2300);
    return () => clearTimeout(timer);
  }, [requestToast]);

  const handleIncomingMessage = useCallback(
    async (payload) => {
      if (payload.type === "error") {
        const detail = payload.detail || "Message error";
        setChatError(detail);
        addNotification(detail, "error");
        return;
      }

      if (payload.type === "friend_request_received") {
        const request = payload.request;
        if (!request?.id) return;
        setIncomingRequests((prev) => {
          const withoutExisting = prev.filter((item) => item.id !== request.id);
          return [request, ...withoutExisting].sort(
            (a, b) =>
              new Date(b.created_at || 0).getTime() -
              new Date(a.created_at || 0).getTime()
          );
        });
        updateFriendResultStatus(request.sender?.id, "incoming_request");
        return;
      }

      if (payload.type === "friend_request_sent") {
        const request = payload.request;
        const receiverId = request?.receiver?.id;
        if (receiverId) {
          setOutgoingRequestUserIds((prev) =>
            prev.includes(receiverId) ? prev : [...prev, receiverId]
          );
          updateFriendResultStatus(receiverId, "outgoing_request");
        }
        return;
      }

      if (payload.type === "friend_request_accepted_sender") {
        const request = payload.request;
        const acceptedByUsername = request?.receiver?.username || "friend";
        addNotification(
          `@${acceptedByUsername} accepted your friend request.`
        );

        const senderId = request?.sender?.id;
        const receiverId = request?.receiver?.id;
        const otherUserId = senderId === user?.id ? receiverId : senderId;
        if (otherUserId) {
          setOutgoingRequestUserIds((prev) =>
            prev.filter((id) => id !== otherUserId)
          );
          setIncomingRequests((prev) =>
            prev.filter((item) => item.sender?.id !== otherUserId)
          );
          updateFriendResultStatus(otherUserId, "friend");
        }
        await fetchFriendRequestsRef.current();
        await fetchThreadsRef.current(activeIdRef.current);
        return;
      }

      if (payload.type === "friend_request_accepted") {
        const request = payload.request;
        const senderId = request?.sender?.id;
        const receiverId = request?.receiver?.id;
        const otherUserId = senderId === user?.id ? receiverId : senderId;
        if (otherUserId) {
          setOutgoingRequestUserIds((prev) =>
            prev.filter((id) => id !== otherUserId)
          );
          setIncomingRequests((prev) =>
            prev.filter((item) => item.sender?.id !== otherUserId)
          );
          updateFriendResultStatus(otherUserId, "friend");
        }
        await fetchFriendRequestsRef.current();
        await fetchThreadsRef.current(activeIdRef.current);
        return;
      }

      if (payload.type === "friend_request_declined") {
        const request = payload.request;
        const senderId = request?.sender?.id;
        const receiverId = request?.receiver?.id;
        const otherUserId = senderId === user?.id ? receiverId : senderId;
        if (otherUserId) {
          setOutgoingRequestUserIds((prev) =>
            prev.filter((id) => id !== otherUserId)
          );
          setIncomingRequests((prev) =>
            prev.filter((item) => item.sender?.id !== otherUserId)
          );
          updateFriendResultStatus(otherUserId, "none");
        }
        addNotification("Friend request declined.");
        await fetchFriendRequestsRef.current();
        return;
      }

      if (payload.type === "friend_removed") {
        // The backend sends actor_id + friend_id; compute "the other user"
        // from the perspective of the currently signed-in user.
        const actorId = payload.actor_id;
        const removedByActorId =
          actorId === user?.id ? payload.friend_id : actorId;

        if (removedByActorId) {
          setOutgoingRequestUserIds((prev) =>
            prev.filter((id) => id !== removedByActorId)
          );
          setIncomingRequests((prev) =>
            prev.filter((item) => item.sender?.id !== removedByActorId)
          );
          updateFriendResultStatus(removedByActorId, "none");
        }

        if (actorId && actorId !== user?.id) {
          // Notify only the receiver side to avoid duplicate self-toasts.
          addNotification("A friend removed you from their contact list.");
        }

        const nextActiveId =
          activeIdRef.current === removedByActorId ? null : activeIdRef.current;
        await fetchThreadsRef.current(nextActiveId);
        await fetchFriendRequestsRef.current();
        return;
      }

      if (
        payload.type === "message_edited" ||
        payload.type === "message_deleted_for_everyone" ||
        payload.type === "message_deleted_for_me" ||
        payload.type === "conversation_cleared"
      ) {
        const notificationTextByType = {
          message_edited: "A message was edited.",
          message_deleted_for_everyone: "A message was deleted for everyone.",
          message_deleted_for_me: "A message was deleted for you.",
          conversation_cleared: "A conversation was cleared.",
        };
        addNotification(
          notificationTextByType[payload.type] || "Conversation updated."
        );
        await fetchThreadsRef.current(activeIdRef.current);
        return;
      }

      if (payload.type !== "message") return;

      const message = payload.message;
      const friendId =
        message.sender_id === user?.id
          ? message.receiver_id
          : message.sender_id;
      const thread = threadsRef.current.find(
        (item) => item.friend?.id === friendId
      );
      const friendPublicKey = thread?.friend?.public_key;

      let text = "[Encrypted message]";
      if (message.is_deleted_for_everyone) {
        text = "";
      } else if (friendPublicKey) {
        try {
          text = await decryptForFriend(
            friendId,
            friendPublicKey,
            message.ciphertext,
            message.iv
          );
        } catch (err) {
          text = "[Unable to decrypt]";
        }
      }

      const messageWithText = { ...message, text };

      if (message.sender_id !== user?.id) {
        const friendUsername = thread?.friend?.username || "unknown";
        const preview = message.is_deleted_for_everyone
          ? "This message was deleted"
          : text || "New message";
        const clippedPreview =
          preview.length > 72 ? `${preview.slice(0, 72)}...` : preview;
        addNotification(`@${friendUsername}: ${clippedPreview}`, "message");
      }

      // Append to the active thread if it matches.
      setMessages((prev) =>
        activeIdRef.current === friendId ? [...prev, messageWithText] : prev
      );

      // Update the thread list preview + ordering.
      setThreads((prev) => {
        const updated = prev.map((threadItem) =>
          threadItem.friend?.id === friendId
            ? {
                ...threadItem,
                last_message_id: message.id,
                last_message_ciphertext: message.ciphertext,
                last_message_iv: message.iv,
                last_message_version: message.crypto_version,
                last_message_deleted_for_everyone:
                  message.is_deleted_for_everyone ?? false,
                last_time: message.created_at,
                last_preview: text,
              }
            : threadItem
        );

        return updated.sort((a, b) => {
          const timeA = a.last_time ? new Date(a.last_time).getTime() : 0;
          const timeB = b.last_time ? new Date(b.last_time).getTime() : 0;
          return timeB - timeA;
        });
      });
    },
    [addNotification, decryptForFriend, updateFriendResultStatus, user?.id]
  );

  // Open a message socket after encryption keys are unlocked.
  useEffect(() => {
    if (!cryptoReady) return undefined;
    const token = localStorage.getItem("token");
    if (!token) return undefined;

    setSocketStatus("connecting");
    const socket = createMessageSocket(token);
    socketRef.current = socket;

    socket.onopen = () => setSocketStatus("connected");
    socket.onclose = () => setSocketStatus("disconnected");
    socket.onerror = () => setSocketStatus("error");
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        void handleIncomingMessage(payload);
      } catch (err) {
        setChatError("Unable to read incoming message");
        addNotification("Unable to read incoming message", "error");
      }
    };

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [addNotification, cryptoReady, handleIncomingMessage]);

  useEffect(() => {
    if (!cryptoReady) {
      setSocketStatus("disconnected");
    }
  }, [cryptoReady]);

  const fetchMessages = useCallback(
    async (friendId, friendPublicKey) => {
      if (!friendId) {
        setMessages([]);
        setLoadingMessages(false);
        return;
      }

      if (!cryptoReady) {
        setMessages([]);
        setLoadingMessages(false);
        return;
      }

      if (!friendPublicKey) {
        setChatError("Friend has not set up encryption keys yet");
        setMessages([]);
        setLoadingMessages(false);
        return;
      }

      try {
        setLoadingMessages(true);
        setChatError("");
        const res = await getChatMessages(friendId);
        const data = res.data ?? [];
        const decrypted = await Promise.all(
          data.map(async (message) => {
            if (message.is_deleted_for_everyone) {
              return { ...message, text: "" };
            }
            try {
              const text = await decryptForFriend(
                friendId,
                friendPublicKey,
                message.ciphertext,
                message.iv
              );
              return { ...message, text };
            } catch (err) {
              return { ...message, text: "[Unable to decrypt]" };
            }
          })
        );
        setMessages(decrypted);
      } catch (err) {
        setChatError("Could not load messages");
        setMessages([]);
      } finally {
        setLoadingMessages(false);
      }
    },
    [cryptoReady, decryptForFriend]
  );

  const decorateThreads = useCallback(
    async (data) => {
      // Decrypt last-message previews for the thread list.
      if (!cryptoReady) {
        return data.map((thread) => ({
          ...thread,
          last_preview: "",
        }));
      }

      return Promise.all(
        data.map(async (thread) => {
          const ciphertext = thread.last_message_ciphertext;
          const iv = thread.last_message_iv;
          const friendPublicKey = thread.friend?.public_key;
          const isDeletedForEveryone = Boolean(
            thread.last_message_deleted_for_everyone
          );

          if (isDeletedForEveryone) {
            return {
              ...thread,
              last_preview: "This message was deleted",
            };
          }

          if (!ciphertext || !iv || !friendPublicKey) {
            return {
              ...thread,
              last_preview: ciphertext ? "[Encrypted message]" : "",
            };
          }

          try {
            const text = await decryptForFriend(
              thread.friend.id,
              friendPublicKey,
              ciphertext,
              iv
            );
            return { ...thread, last_preview: text };
          } catch (err) {
            return { ...thread, last_preview: "[Unable to decrypt]" };
          }
        })
      );
    },
    [cryptoReady, decryptForFriend]
  );

  const fetchThreads = useCallback(async (nextActiveId = null) => {
    try {
      setLoadingThreads(true);
      setChatError("");
      const res = await getChatThreads();
      const data = res.data ?? [];
      const decorated = await decorateThreads(data);
      setThreads(decorated);

      let resolvedActiveId = nextActiveId;
      if (!resolvedActiveId) {
        resolvedActiveId = decorated[0]?.friend?.id ?? null;
      }

      setActiveId(resolvedActiveId);
      if (resolvedActiveId) {
        const activeThreadData = decorated.find(
          (thread) => thread.friend?.id === resolvedActiveId
        );
        await fetchMessages(
          resolvedActiveId,
          activeThreadData?.friend?.public_key
        );
      } else {
        setMessages([]);
      }
    } catch (err) {
      setChatError("Could not load chats");
      setThreads([]);
      setActiveId(null);
      setMessages([]);
    } finally {
      setLoadingThreads(false);
    }
  }, [decorateThreads, fetchMessages]);

  useEffect(() => {
    fetchThreadsRef.current = fetchThreads;
  }, [fetchThreads]);

  useEffect(() => {
    fetchFriendRequestsRef.current = fetchFriendRequests;
  }, [fetchFriendRequests]);

  useEffect(() => {
    if (cryptoReady) {
      fetchThreads();
    }
  }, [cryptoReady, fetchThreads]);

  useEffect(() => {
    fetchFriendRequests();
  }, [fetchFriendRequests]);

  useEffect(() => {
    if (!isNewChatOpen) {
      setFriendResults([]);
      setFriendError("");
      setFriendLoading(false);
      return;
    }

    const query = friendQuery.trim();
    if (query.length < 2) {
      setFriendResults([]);
      setFriendError("");
      setFriendLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setFriendLoading(true);
        setFriendError("");
        const res = await searchUsers(query);
        setFriendResults(res.data ?? []);
      } catch (err) {
        setFriendError("Could not fetch users");
      } finally {
        setFriendLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [friendQuery, isNewChatOpen]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const handleUnlock = async (event) => {
    event.preventDefault();
    if (!unlockPassword.trim()) return;
    setUnlockError("");
    const unlocked = await unlockWithPassword(unlockPassword);
    if (!unlocked) {
      setUnlockError("Unable to unlock encryption keys");
    } else {
      setUnlockPassword("");
    }
  };

  const handleSelectThread = (id) => {
    setMessageMenu(null);
    setThreadMenu(null);
    setEditingMessageId(null);
    setEditingDraft("");
    setActiveId(id);
    const selected = threads.find((thread) => thread.friend?.id === id);
    fetchMessages(id, selected?.friend?.public_key);
  };

  const handleStartChat = (friend) => {
    const existingThread = threads.find(
      (thread) => thread.friend?.id === friend.id
    );
    const effectiveStatus = existingThread
      ? "friend"
      : outgoingRequestUserIds.includes(friend.id)
      ? "outgoing_request"
      : friend.relationship_status || "none";

    if (existingThread) {
      handleSelectThread(existingThread.friend.id);
      setIsNewChatOpen(false);
      setFriendQuery("");
      setChatQuery("");
      return;
    }

    if (effectiveStatus === "friend") {
      fetchThreads(friend.id);
      return;
    }

    if (effectiveStatus === "incoming_request") {
      addNotification("Accept this friend request from notifications.");
      return;
    }

    if (effectiveStatus === "outgoing_request") {
      addNotification("Friend request already sent.");
      return;
    }

    const sendRequest = async () => {
      try {
        setFriendError("");
        await sendFriendRequest(friend.id);
        setOutgoingRequestUserIds((prev) =>
          prev.includes(friend.id) ? prev : [...prev, friend.id]
        );
        updateFriendResultStatus(friend.id, "outgoing_request");
        showRequestToast("Friend request sent");
      } catch (err) {
        const detail = err.response?.data?.detail;
        setFriendError(detail || "Could not send friend request");
      }
    };

    sendRequest();
  };

  const handleAcceptRequest = async (request) => {
    if (!request?.id) return;
    try {
      setIsActionPending(true);
      await acceptFriendRequest(request.id);
      setIncomingRequests((prev) =>
        prev.filter((item) => item.id !== request.id)
      );
      setOutgoingRequestUserIds((prev) =>
        prev.filter((id) => id !== request.sender?.id)
      );
      updateFriendResultStatus(request.sender?.id, "friend");
      addNotification(`You can now chat with @${request.sender?.username}`);
      await fetchThreads(request.sender?.id || activeIdRef.current);
      await fetchFriendRequestsRef.current();
    } catch (err) {
      const detail = err.response?.data?.detail;
      addNotification(detail || "Could not accept friend request", "error");
    } finally {
      setIsActionPending(false);
    }
  };

  const handleDeclineRequest = async (request) => {
    if (!request?.id) return;
    try {
      setIsActionPending(true);
      await declineFriendRequest(request.id);
      setIncomingRequests((prev) =>
        prev.filter((item) => item.id !== request.id)
      );
      updateFriendResultStatus(request.sender?.id, "none");
      addNotification(`Declined @${request.sender?.username}'s request`);
      await fetchFriendRequestsRef.current();
    } catch (err) {
      const detail = err.response?.data?.detail;
      addNotification(detail || "Could not decline friend request", "error");
    } finally {
      setIsActionPending(false);
    }
  };

  const handleMessageContextMenu = (event, message) => {
    event.preventDefault();
    event.stopPropagation();
    setThreadMenu(null);
    setMessageMenu({
      x: event.clientX,
      y: event.clientY,
      message,
    });
  };

  const handleThreadContextMenu = (event, thread) => {
    event.preventDefault();
    event.stopPropagation();
    setMessageMenu(null);
    setThreadMenu({
      x: event.clientX,
      y: event.clientY,
      thread,
    });
  };

  const handleStartEditMessage = (message) => {
    if (!message) return;
    if (message.sender_id !== user?.id || message.is_deleted_for_everyone) return;
    setEditingMessageId(message.id);
    setEditingDraft(message.text || "");
    setMessageMenu(null);
  };

  const handleCancelEditMessage = () => {
    setEditingMessageId(null);
    setEditingDraft("");
  };

  const handleSaveEditedMessage = async (event, message) => {
    event.preventDefault();
    const trimmed = editingDraft.trim();
    if (!trimmed || !activeThread?.friend) return;

    try {
      setIsActionPending(true);
      setChatError("");
      if (!activeThread.friend.public_key) {
        setChatError("Friend has not set up encryption keys yet");
        return;
      }

      const encrypted = await encryptForFriend(
        activeThread.friend.id,
        activeThread.friend.public_key,
        trimmed
      );
      await editChatMessage(activeThread.friend.id, message.id, {
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
      });
      handleCancelEditMessage();
      await fetchThreads(activeThread.friend.id);
    } catch (err) {
      setChatError("Could not edit message");
    } finally {
      setIsActionPending(false);
    }
  };

  const handleDeleteMessage = async (message, scope = "me") => {
    if (!activeThread?.friend) return;

    try {
      setIsActionPending(true);
      setChatError("");
      await deleteChatMessage(activeThread.friend.id, message.id, scope);
      if (editingMessageId === message.id) {
        handleCancelEditMessage();
      }
      setMessageMenu(null);
      await fetchThreads(activeThread.friend.id);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setChatError(detail || "Could not delete message");
    } finally {
      setIsActionPending(false);
    }
  };

  const handleDeleteThread = async (thread) => {
    if (!thread?.friend?.id) return;

    try {
      setIsActionPending(true);
      setChatError("");
      await deleteFriendChat(thread.friend.id);
      setThreadMenu(null);
      handleCancelEditMessage();
      await fetchThreads(activeIdRef.current || thread.friend.id);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setChatError(detail || "Could not delete chat");
    } finally {
      setIsActionPending(false);
    }
  };

  const handleRemoveFriend = async (thread) => {
    if (!thread?.friend?.id) return;

    try {
      setIsActionPending(true);
      setChatError("");
      // Removing a friend revokes chat access until a new request is accepted.
      await removeFriend(thread.friend.id);
      setThreadMenu(null);
      handleCancelEditMessage();
      updateFriendResultStatus(thread.friend.id, "none");
      showRequestToast("Friend removed");
      await fetchFriendRequestsRef.current();
      await fetchThreadsRef.current(
        activeIdRef.current === thread.friend.id ? null : activeIdRef.current
      );
    } catch (err) {
      const detail = err.response?.data?.detail;
      setChatError(detail || "Could not remove friend");
    } finally {
      setIsActionPending(false);
    }
  };

  const handleSend = (event) => {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || !activeId) return;
    const send = async () => {
      try {
        setChatError("");

        const activeFriend = activeThread?.friend;
        if (!activeFriend?.public_key) {
          setChatError("Friend has not set up encryption keys yet");
          return;
        }

        if (socketStatus !== "connected" || !socketRef.current) {
          setChatError("Message socket is disconnected");
          return;
        }

        // Encrypt locally before sending over the WebSocket.
        const encrypted = await encryptForFriend(
          activeFriend.id,
          activeFriend.public_key,
          trimmed
        );

        socketRef.current.send(
          JSON.stringify({
            type: "message",
            friend_id: activeFriend.id,
            ciphertext: encrypted.ciphertext,
            iv: encrypted.iv,
          })
        );

        setDraft("");
      } catch (err) {
        setChatError("Could not send message");
      }
    };

    send();
  };

  return (
    <div className="chat-page" data-theme={theme}>
      {requestToast && (
        <div
          key={requestToast.id}
          className="chat-toast"
          role="status"
          aria-live="polite"
        >
          {requestToast.text}
        </div>
      )}
      {!cryptoReady && (
        <div className="chat-lock" role="dialog" aria-live="polite">
          <div className="chat-lock__card">
            <h2>Unlock encrypted chats</h2>
            <p>
              Enter your password to decrypt your private key and read messages.
            </p>
            {(cryptoError || unlockError) && (
              <p className="chat-lock__error">
                {unlockError || cryptoError}
              </p>
            )}
            <form className="chat-lock__form" onSubmit={handleUnlock}>
              <input
                type="password"
                placeholder="Password"
                value={unlockPassword}
                onChange={(event) => {
                  setUnlockPassword(event.target.value);
                  if (unlockError) setUnlockError("");
                }}
                autoComplete="current-password"
                required
              />
              <button type="submit" disabled={cryptoLoading}>
                {cryptoLoading ? "Unlocking..." : "Unlock"}
              </button>
            </form>
          </div>
        </div>
      )}
      <header className="chat-topbar">
        <div className="chat-brand">
          <span className="chat-brand__dot" />
          Chitchat
        </div>
        <div className="chat-topbar__meta">
          {displayName && (
            <span className="chat-user">Signed in as {displayName}</span>
          )}
          <div className="chat-notification-menu" aria-live="polite">
            <button
              type="button"
              className="chat-notification-toggle"
              aria-label={`Notifications (${notificationCount})`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M15 18h5l-1.4-1.4A2 2 0 0 1 18 15.2V11a6 6 0 1 0-12 0v4.2a2 2 0 0 1-.6 1.4L4 18h5" />
                <path d="M9 18a3 3 0 0 0 6 0" />
              </svg>
              {notificationCount > 0 && (
                <span className="chat-notification-toggle__badge">
                  {notificationCount > 99 ? "99+" : notificationCount}
                </span>
              )}
            </button>
            <div className="chat-notification-panel" role="region" aria-label="Notifications">
              <div className="chat-notifications__header">
                <div>
                  <p className="chat-kicker">Alerts</p>
                  <h3>Notifications</h3>
                </div>
                <button
                  type="button"
                  className="chat-notifications__clear"
                  onClick={clearNotifications}
                  disabled={notifications.length === 0}
                >
                  Clear alerts
                </button>
              </div>
              <div className="chat-notifications__list">
                {incomingRequests.length === 0 && notifications.length === 0 ? (
                  <p className="chat-notifications__empty">
                    Notifications will appear here.
                  </p>
                ) : (
                  <>
                    {incomingRequests.map((request) => (
                      <article
                        key={`request-${request.id}`}
                        className="chat-notification chat-notification--request"
                      >
                        <p className="chat-notification__text">
                          <strong>@{request.sender?.username}</strong> sent you a friend request.
                        </p>
                        <div className="chat-notification__meta">
                          <span>{formatTimestamp(request.created_at)}</span>
                        </div>
                        <div className="chat-notification__actions">
                          <button
                            type="button"
                            onClick={() => handleAcceptRequest(request)}
                            disabled={isActionPending}
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            className="is-danger"
                            onClick={() => handleDeclineRequest(request)}
                            disabled={isActionPending}
                          >
                            Decline
                          </button>
                        </div>
                      </article>
                    ))}
                    {notifications.map((notification) => (
                      <article
                        key={notification.id}
                        className={`chat-notification chat-notification--${notification.type}`}
                      >
                        <p className="chat-notification__text">{notification.text}</p>
                        <div className="chat-notification__meta">
                          <span>{formatTimestamp(notification.created_at)}</span>
                          <button
                            type="button"
                            onClick={() => removeNotification(notification.id)}
                          >
                            Dismiss
                          </button>
                        </div>
                      </article>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>
          <button className="chat-ghost" type="button" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <section className="chat-shell">
        <aside className="chat-sidebar">
          <div className="chat-sidebar__header">
            <div>
              <p className="chat-kicker">Conversations</p>
              <h2>Inbox</h2>
            </div>
            <button
              className={`chat-chip${isNewChatOpen ? " is-active" : ""}`}
              type="button"
              onClick={() => setIsNewChatOpen((prev) => !prev)}
            >
              {isNewChatOpen ? "Close" : "New chat"}
            </button>
          </div>

          {isNewChatOpen && (
            <div className="chat-new">
              <div className="chat-new__header">
                <div>
                  <p className="chat-kicker">New chat</p>
                  <h3>Find friends</h3>
                </div>
                <span className="chat-new__count">
                  {friendResults.length} found
                </span>
              </div>

              <label className="chat-search">
                <span className="chat-search__label">Search friends</span>
                <input
                  type="search"
                  placeholder="Search by name, username, or email"
                  value={friendQuery}
                  onChange={(event) => setFriendQuery(event.target.value)}
                />
              </label>

              <div className="chat-friend-list">
                {friendError ? (
                  <p className="chat-empty-state">{friendError}</p>
                ) : friendLoading ? (
                  <p className="chat-empty-state">Searching...</p>
                ) : friendQuery.trim().length < 2 ? (
                  <p className="chat-empty-state">
                    Type at least 2 characters to search.
                  </p>
                ) : friendResults.length === 0 ? (
                  <p className="chat-empty-state">No users found.</p>
                ) : (
                  friendResults.map((friend) => {
                    const exists = threads.some(
                      (thread) => thread.friend?.id === friend.id
                    );
                    const relationshipStatus = exists
                      ? "friend"
                      : incomingRequests.some(
                          (request) => request.sender?.id === friend.id
                        )
                      ? "incoming_request"
                      : outgoingRequestUserIds.includes(friend.id)
                      ? "outgoing_request"
                      : friend.relationship_status || "none";
                    const label = friend.name?.trim() || friend.username;
                    const meta = friend.email
                      ? `@${friend.username} | ${friend.email}`
                      : `@${friend.username}`;
                    const actionLabel =
                      relationshipStatus === "friend"
                        ? "Open"
                        : relationshipStatus === "incoming_request"
                        ? "Pending your action"
                        : relationshipStatus === "outgoing_request"
                        ? "Requested"
                        : "Send request";
                    return (
                      <button
                        key={friend.id}
                        type="button"
                        className="chat-friend"
                        onClick={() => handleStartChat(friend)}
                      >
                        <div className="chat-friend__avatar">
                          {getInitials(label)}
                        </div>
                        <div className="chat-friend__body">
                          <span className="chat-friend__name">{label}</span>
                          <span className="chat-friend__status">{meta}</span>
                        </div>
                        <span className="chat-friend__action">{actionLabel}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          <label className="chat-search">
            <span className="chat-search__label">Search</span>
            <input
              type="search"
              placeholder="Find a chat"
              value={chatQuery}
              onChange={(event) => setChatQuery(event.target.value)}
            />
          </label>

          <div className="chat-list">
            {loadingThreads ? (
              <p className="chat-empty-state">Loading chats...</p>
            ) : threads.length === 0 && !chatQuery.trim() ? (
              <p className="chat-empty-state">
                No chats yet. Send friend requests to start.
              </p>
            ) : filteredThreads.length === 0 ? (
              <p className="chat-empty-state">No chats match that search.</p>
            ) : (
              filteredThreads.map((thread) => {
                const username = thread.friend?.username || "Friend";
                const preview =
                  thread.last_preview || "Start the conversation";
                const lastTime = thread.last_time
                  ? formatTimestamp(thread.last_time)
                  : "New";
                return (
                  <button
                    key={thread.friend.id}
                    type="button"
                    className={`chat-thread${
                      thread.friend.id === activeId ? " is-active" : ""
                    }`}
                    onClick={() => handleSelectThread(thread.friend.id)}
                    onContextMenu={(event) =>
                      handleThreadContextMenu(event, thread)
                    }
                  >
                    <div className="chat-thread__avatar">
                      {getInitials(thread.friend?.username || "Friend")}
                    </div>
                    <div className="chat-thread__body">
                      <div className="chat-thread__top">
                        <span className="chat-thread__name">{username}</span>
                        <span className="chat-thread__time">{lastTime}</span>
                      </div>
                      <p className="chat-thread__preview">{preview}</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="chat-settings">
            <p className="chat-kicker">Theme</p>
            <div className="chat-themes chat-themes--toggle">
              <button
                type="button"
                className={`chat-theme${theme === "light" ? " is-active" : ""}`}
                onClick={() => setTheme("light")}
              >
                Light
              </button>
              <button
                type="button"
                className={`chat-theme${theme === "dark" ? " is-active" : ""}`}
                onClick={() => setTheme("dark")}
              >
                Dark
              </button>
            </div>
          </div>
        </aside>

        <main className="chat-main">
          {activeThread ? (
            <>
              <div className="chat-main__header">
                <div>
                  <p className="chat-kicker">Active chat</p>
                  <h2>
                    {activeThread.friend?.name?.trim() ||
                      activeThread.friend?.username}
                  </h2>
                </div>
                <div className="chat-status">
                  <span className="chat-status__dot" />
                  @{activeThread.friend?.username}
                </div>
              </div>

              <div className="chat-messages">
                {chatError && (
                  <p className="chat-empty-state">{chatError}</p>
                )}
                {loadingMessages ? (
                  <p className="chat-empty-state">Loading messages...</p>
                ) : chatError ? null : activeMessages.length === 0 ? (
                  <p className="chat-empty-state">No messages yet.</p>
                ) : (
                  activeMessages.map((message) => {
                    const isMine = message.sender_id === user?.id;
                    const isEditing = editingMessageId === message.id;
                    return (
                      <div
                        key={message.id}
                        className={`chat-message${isMine ? " is-me" : ""}`}
                        onContextMenu={(event) =>
                          handleMessageContextMenu(event, message)
                        }
                      >
                        {!isMine && (
                          <span className="chat-message__author">
                            {activeThread.friend?.username ||
                              activeThread.friend?.name?.trim()}
                          </span>
                        )}
                        {isEditing ? (
                          <form
                            className="chat-message__edit"
                            onSubmit={(event) =>
                              handleSaveEditedMessage(event, message)
                            }
                          >
                            <input
                              type="text"
                              value={editingDraft}
                              onChange={(event) =>
                                setEditingDraft(event.target.value)
                              }
                              autoFocus
                            />
                            <div className="chat-message__edit-actions">
                              <button
                                type="submit"
                                disabled={
                                  isActionPending || !editingDraft.trim()
                                }
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={handleCancelEditMessage}
                                disabled={isActionPending}
                              >
                                Cancel
                              </button>
                            </div>
                          </form>
                        ) : (
                          <p className="chat-message__text">
                            {getMessageDisplayText(message)}
                          </p>
                        )}
                        {message.edited_at &&
                          !message.is_deleted_for_everyone &&
                          !isEditing && (
                            <span className="chat-message__edited">
                              Edited
                            </span>
                          )}
                        <span className="chat-message__time">
                          {formatTimestamp(message.created_at)}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

              <form className="chat-composer" onSubmit={handleSend}>
                <input
                  type="text"
                  placeholder="Write a message"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                />
                <button
                  type="submit"
                  disabled={
                    !draft.trim() ||
                    !cryptoReady ||
                    socketStatus !== "connected" ||
                    !activeThread?.friend?.public_key
                  }
                >
                  Send
                </button>
              </form>
            </>
          ) : (
            <div className="chat-empty">
              {chatError ? (
                <>
                  <h2>Unable to load chats</h2>
                  <p>{chatError}</p>
                </>
              ) : loadingThreads ? (
                <>
                  <h2>Loading chats...</h2>
                  <p>Fetching your conversations.</p>
                </>
              ) : (
                <>
                  <h2>No chats yet</h2>
                  <p>Send friend requests to start chatting.</p>
                  <button
                    type="button"
                    className="chat-chip"
                    onClick={() => setIsNewChatOpen(true)}
                  >
                    Find friends
                  </button>
                </>
              )}
            </div>
          )}
        </main>
      </section>

      {messageMenu?.message && (
        <div
          className="chat-context-menu"
          style={{ left: messageMenu.x, top: messageMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          {messageMenu.message.sender_id === user?.id &&
            !messageMenu.message.is_deleted_for_everyone && (
              <button
                type="button"
                onClick={() => handleStartEditMessage(messageMenu.message)}
                disabled={isActionPending}
              >
                Edit message
              </button>
            )}
          <button
            type="button"
            onClick={() => handleDeleteMessage(messageMenu.message, "me")}
            disabled={isActionPending}
          >
            Delete chat
          </button>
          {messageMenu.message.sender_id === user?.id &&
            !messageMenu.message.is_deleted_for_everyone && (
              <button
                type="button"
                className="is-danger"
                onClick={() =>
                  handleDeleteMessage(messageMenu.message, "everyone")
                }
                disabled={isActionPending}
              >
                Delete from everyone
              </button>
            )}
        </div>
      )}

      {threadMenu?.thread && (
        <div
          className="chat-context-menu"
          style={{ left: threadMenu.x, top: threadMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="is-danger"
            onClick={() => handleRemoveFriend(threadMenu.thread)}
            disabled={isActionPending}
          >
            Remove friend
          </button>
          <button
            type="button"
            className="is-danger"
            onClick={() => handleDeleteThread(threadMenu.thread)}
            disabled={isActionPending}
          >
            Delete entire chat
          </button>
        </div>
      )}
    </div>
  );
}
