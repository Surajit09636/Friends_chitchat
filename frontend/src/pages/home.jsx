import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import {
  addFriend,
  getChatMessages,
  getChatThreads,
  searchUsers,
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

  // Refs keep the WebSocket handlers in sync with latest state.
  const socketRef = useRef(null);
  const threadsRef = useRef([]);
  const activeIdRef = useRef(null);

  const activeThread = threads.find(
    (thread) => thread.friend?.id === activeId
  );
  const activeMessages = messages ?? [];
  const displayName =
    user?.username || formatDisplayName(user?.identifier) || "";
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
    const storedTheme = localStorage.getItem("theme");
    if (storedTheme === "dark" || storedTheme === "light") {
      setTheme(storedTheme);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("theme", theme);
  }, [theme]);

  const handleIncomingMessage = useCallback(
    async (payload) => {
      if (payload.type === "error") {
        setChatError(payload.detail || "Message error");
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
      if (friendPublicKey) {
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
                last_message_ciphertext: message.ciphertext,
                last_message_iv: message.iv,
                last_message_version: message.crypto_version,
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
    [decryptForFriend, user?.id]
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
      }
    };

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [cryptoReady, handleIncomingMessage]);

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
    if (cryptoReady) {
      fetchThreads();
    }
  }, [cryptoReady, fetchThreads]);

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
    setActiveId(id);
    const selected = threads.find((thread) => thread.friend?.id === id);
    fetchMessages(id, selected?.friend?.public_key);
  };

  const handleStartChat = (friend) => {
    const existingThread = threads.find(
      (thread) => thread.friend?.id === friend.id
    );
    if (existingThread) {
      handleSelectThread(existingThread.friend.id);
      setIsNewChatOpen(false);
      setFriendQuery("");
      setChatQuery("");
      return;
    }

    const addAndOpen = async () => {
      try {
        setFriendError("");
        await addFriend(friend.id);
        await fetchThreads(friend.id);
        setIsNewChatOpen(false);
        setFriendQuery("");
        setChatQuery("");
      } catch (err) {
        const detail = err.response?.data?.detail;
        setFriendError(detail || "Could not add friend");
      }
    };

    addAndOpen();
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
          Chatspace
        </div>
        <div className="chat-topbar__meta">
          <span className={`chat-socket chat-socket--${socketStatus}`}>
            Realtime: {socketStatus}
          </span>
          {displayName && (
            <span className="chat-user">Signed in as {displayName}</span>
          )}
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
                    const label = friend.name?.trim() || friend.username;
                    const meta = friend.email
                      ? `@${friend.username} | ${friend.email}`
                      : `@${friend.username}`;
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
                        <span className="chat-friend__action">
                          {exists ? "Open" : "Add"}
                        </span>
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
                No chats yet. Add friends to start.
              </p>
            ) : filteredThreads.length === 0 ? (
              <p className="chat-empty-state">No chats match that search.</p>
            ) : (
              filteredThreads.map((thread) => {
                const label =
                  thread.friend?.name?.trim() || thread.friend?.username || "";
                const status = thread.friend?.username
                  ? `@${thread.friend.username}`
                  : "Friend";
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
                  >
                    <div className="chat-thread__avatar">
                      {getInitials(label)}
                    </div>
                    <div className="chat-thread__body">
                      <div className="chat-thread__top">
                        <span className="chat-thread__name">{label}</span>
                        <span className="chat-thread__time">{lastTime}</span>
                      </div>
                      <p className="chat-thread__preview">{preview}</p>
                      <span className="chat-thread__status">{status}</span>
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
                    return (
                      <div
                        key={message.id}
                        className={`chat-message${isMine ? " is-me" : ""}`}
                      >
                        {!isMine && (
                          <span className="chat-message__author">
                            {activeThread.friend?.name?.trim() ||
                              activeThread.friend?.username}
                          </span>
                        )}
                        <p className="chat-message__text">
                          {message.text || "[Encrypted message]"}
                        </p>
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
                  <p>Add friends to start chatting.</p>
                  <button
                    type="button"
                    className="chat-chip"
                    onClick={() => setIsNewChatOpen(true)}
                  >
                    Add friends
                  </button>
                </>
              )}
            </div>
          )}
        </main>
      </section>
    </div>
  );
}
