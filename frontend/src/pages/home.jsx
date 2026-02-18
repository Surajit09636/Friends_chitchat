import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import "../styles/chat.css";

const initialThreads = [
  {
    id: "studio",
    name: "Studio Squad",
    status: "Planning sprint",
    lastMessage: "I will mock the new hero copy now.",
    lastTime: "2m",
    unread: 2,
  },
  {
    id: "saira",
    name: "Saira Patel",
    status: "Design lead",
    lastMessage: "Can you review the motion pass?",
    lastTime: "18m",
    unread: 0,
  },
  {
    id: "ops",
    name: "Ops Lounge",
    status: "Launch support",
    lastMessage: "Pager quiet so far, fingers crossed.",
    lastTime: "1h",
    unread: 3,
  },
  {
    id: "buddy",
    name: "Buddy",
    status: "Friend",
    lastMessage: "Movie night this weekend?",
    lastTime: "3h",
    unread: 0,
  },
];

const initialMessages = {
  studio: [
    {
      id: 1,
      author: "Mia",
      text: "Morning! Can we keep the hero section light and friendly?",
      time: "9:12 AM",
      mine: false,
    },
    {
      id: 2,
      author: "You",
      text: "Yep. I will draft 2 options and share by lunch.",
      time: "9:14 AM",
      mine: true,
    },
    {
      id: 3,
      author: "Mia",
      text: "Perfect. Also add a quick line about secure chats.",
      time: "9:15 AM",
      mine: false,
    },
  ],
  saira: [
    {
      id: 1,
      author: "Saira",
      text: "Can you review the motion pass?",
      time: "8:42 AM",
      mine: false,
    },
    {
      id: 2,
      author: "You",
      text: "On it. I will send notes shortly.",
      time: "8:44 AM",
      mine: true,
    },
  ],
  ops: [
    {
      id: 1,
      author: "Ravi",
      text: "Launch checklist done. Keep an eye on login errors.",
      time: "7:20 AM",
      mine: false,
    },
    {
      id: 2,
      author: "You",
      text: "Copy that. I will monitor dashboards.",
      time: "7:22 AM",
      mine: true,
    },
  ],
  buddy: [
    {
      id: 1,
      author: "Buddy",
      text: "Movie night this weekend?",
      time: "6:10 AM",
      mine: false,
    },
  ],
};

const formatNow = () =>
  new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const formatDisplayName = (identifier) => {
  if (!identifier) return "";
  return identifier.includes("@") ? identifier.split("@")[0] : identifier;
};

export default function Home() {
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const [threads, setThreads] = useState(initialThreads);
  const [messages, setMessages] = useState(initialMessages);
  const [activeId, setActiveId] = useState(initialThreads[0]?.id ?? null);
  const [draft, setDraft] = useState("");
  const [theme, setTheme] = useState("light");

  const activeThread = threads.find((thread) => thread.id === activeId);
  const activeMessages = activeId ? messages[activeId] ?? [] : [];
  const displayName =
    user?.username || formatDisplayName(user?.identifier) || "";

  useEffect(() => {
    const storedTheme = localStorage.getItem("theme");
    if (storedTheme === "dark" || storedTheme === "light") {
      setTheme(storedTheme);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("theme", theme);
  }, [theme]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const handleSelectThread = (id) => {
    setActiveId(id);
    setThreads((prev) =>
      prev.map((thread) =>
        thread.id === id ? { ...thread, unread: 0 } : thread
      )
    );
  };

  const handleSend = (event) => {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || !activeId) return;

    const newMessage = {
      id: Date.now(),
      author: "You",
      text: trimmed,
      time: formatNow(),
      mine: true,
    };

    setMessages((prev) => {
      const next = { ...prev };
      const list = prev[activeId] ?? [];
      next[activeId] = [...list, newMessage];
      return next;
    });

    setThreads((prev) =>
      prev.map((thread) =>
        thread.id === activeId
          ? { ...thread, lastMessage: trimmed, lastTime: "now", unread: 0 }
          : thread
      )
    );

    setDraft("");
  };

  return (
    <div className="chat-page" data-theme={theme}>
      <header className="chat-topbar">
        <div className="chat-brand">
          <span className="chat-brand__dot" />
          Chatspace
        </div>
        <div className="chat-topbar__meta">
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
            <button className="chat-chip" type="button">
              New chat
            </button>
          </div>

          <label className="chat-search">
            <span className="chat-search__label">Search</span>
            <input type="search" placeholder="Find a chat" />
          </label>

          <div className="chat-list">
            {threads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                className={`chat-thread${
                  thread.id === activeId ? " is-active" : ""
                }`}
                onClick={() => handleSelectThread(thread.id)}
              >
                <div className="chat-thread__avatar">
                  {thread.name
                    .split(" ")
                    .map((word) => word[0])
                    .slice(0, 2)
                    .join("")}
                </div>
                <div className="chat-thread__body">
                  <div className="chat-thread__top">
                    <span className="chat-thread__name">{thread.name}</span>
                    <span className="chat-thread__time">{thread.lastTime}</span>
                  </div>
                  <p className="chat-thread__preview">{thread.lastMessage}</p>
                  <span className="chat-thread__status">{thread.status}</span>
                </div>
                {thread.unread > 0 && (
                  <span className="chat-thread__unread">{thread.unread}</span>
                )}
              </button>
            ))}
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
                  <h2>{activeThread.name}</h2>
                </div>
                <div className="chat-status">
                  <span className="chat-status__dot" />
                  {activeThread.status}
                </div>
              </div>

              <div className="chat-messages">
                {activeMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`chat-message${
                      message.mine ? " is-me" : ""
                    }`}
                  >
                    {!message.mine && (
                      <span className="chat-message__author">
                        {message.author}
                      </span>
                    )}
                    <p className="chat-message__text">{message.text}</p>
                    <span className="chat-message__time">{message.time}</span>
                  </div>
                ))}
              </div>

              <form className="chat-composer" onSubmit={handleSend}>
                <input
                  type="text"
                  placeholder="Write a message"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                />
                <button type="submit">Send</button>
              </form>
            </>
          ) : (
            <div className="chat-empty">
              <h2>Pick a conversation</h2>
              <p>Choose a thread from the left to start chatting.</p>
            </div>
          )}
        </main>
      </section>
    </div>
  );
}
