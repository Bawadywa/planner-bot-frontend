import { useEffect, useState } from "react";
import * as api from "./api";
import { Auth } from "./screens/Auth";
import { Boards } from "./screens/Boards";
import { Board } from "./screens/Board";
import { TaskDetail } from "./screens/TaskDetail";
import { Calendar } from "./screens/Calendar";
import { Settings } from "./screens/Settings";
import { BoardIcon, CalendarIcon, SettingsIcon } from "./components/Icons";
import { haptic, pushBack } from "./telegram";
import type { ID, User } from "./types";

type Tab = "boards" | "calendar" | "settings";

/** Screens pushed on top of the current tab. A plain array is enough here -
 *  the app is three tabs deep at most, and a URL router would fight Telegram's
 *  back arrow rather than help. */
type Pushed = { name: "board"; boardId: ID } | { name: "task"; taskId: ID };

export function App() {
  // undefined = still checking, null = signed out
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>("boards");
  const [stack, setStack] = useState<Pushed[]>([]);

  useEffect(() => {
    void api.me().then((u) => setUser(u ?? null));
  }, []);

  // Telegram's back arrow pops the stack whenever something is pushed. Sheets
  // register on top of this, so they close first.
  useEffect(() => {
    if (stack.length === 0) return;
    return pushBack(() => setStack((s) => s.slice(0, -1)));
  }, [stack.length]);

  const pop = () => setStack((s) => s.slice(0, -1));
  const push = (screen: Pushed) => setStack((s) => [...s, screen]);

  function switchTab(next: Tab) {
    haptic();
    setStack([]); // leaving a tab abandons whatever was pushed inside it
    setTab(next);
  }

  if (user === undefined) return <div className="app" />;

  if (!user) {
    return (
      <div className="app">
        <Auth onAuthed={setUser} />
      </div>
    );
  }

  const top = stack[stack.length - 1];

  return (
    <div className="app">
      {top?.name === "board" ? (
        <Board
          boardId={top.boardId}
          onBack={pop}
          onOpenTask={(taskId) => push({ name: "task", taskId })}
        />
      ) : top?.name === "task" ? (
        <TaskDetail taskId={top.taskId} onBack={pop} />
      ) : tab === "boards" ? (
        <Boards onOpenBoard={(boardId) => push({ name: "board", boardId })} />
      ) : tab === "calendar" ? (
        <Calendar onOpenTask={(taskId) => push({ name: "task", taskId })} />
      ) : (
        <Settings
          user={user}
          onSignOut={() => {
            setStack([]);
            setTab("boards");
            setUser(null);
          }}
        />
      )}

      <nav className="nav">
        <button
          aria-current={tab === "boards" ? "page" : undefined}
          onClick={() => switchTab("boards")}
        >
          <BoardIcon />
          <span className="label">Taskboard</span>
        </button>
        <button
          aria-current={tab === "calendar" ? "page" : undefined}
          onClick={() => switchTab("calendar")}
        >
          <CalendarIcon />
          <span className="label">Calendar</span>
        </button>
        <button
          aria-current={tab === "settings" ? "page" : undefined}
          onClick={() => switchTab("settings")}
        >
          <SettingsIcon />
          <span className="label">Settings</span>
        </button>
      </nav>
    </div>
  );
}
