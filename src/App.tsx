import { useEffect, useState, type ComponentType } from "react";
import * as api from "./api";
import { Boards } from "./screens/Boards";
import { Board } from "./screens/Board";
import { TaskDetail } from "./screens/TaskDetail";
import { Calendar } from "./screens/Calendar";
import { Settings } from "./screens/Settings";
import { InviteAccept } from "./screens/InviteAccept";
import { BoardIcon, CalendarIcon, SettingsIcon } from "./components/Icons";
import { clearStartParam, haptic, pushBack, startInviteToken } from "./telegram";
import { useNavSlide } from "./lib/navSlide";
import { useT, type Key } from "./i18n";
import type { ID, User } from "./types";

type Tab = "boards" | "calendar" | "settings";

/* The calendar is nothing but tasks, so it goes with them: in api mode it would
   be a month grid over rows the server has never heard of. See isAvailable() in
   api/index.ts for why a feature is hidden rather than left half-working. */
const showCalendar = api.isAvailable("tasks");

/* The bar, left to right. A list rather than three hand-written buttons,
   because the slide gesture reads the tabs back off the DOM (lib/navSlide.ts)
   and the two have to agree on what is down there: with the calendar hidden the
   bar is two buttons wide, not three with a hole in it. */
const TABS: ReadonlyArray<{
  id: Tab;
  Icon: ComponentType<{ size?: number }>;
  label: Key;
}> = [
  { id: "boards", Icon: BoardIcon, label: "app.nav.boards" },
  { id: "calendar", Icon: CalendarIcon, label: "app.nav.calendar" },
  { id: "settings", Icon: SettingsIcon, label: "app.nav.settings" },
];

const tabs = TABS.filter((item) => item.id !== "calendar" || showCalendar);

/** Screens pushed on top of the current tab. A plain array is enough here -
 *  the app is three tabs deep at most, and a URL router would fight Telegram's
 *  back arrow rather than help. */
type Pushed = { name: "board"; boardId: ID } | { name: "task"; taskId: ID };

export function App() {
  const t = useT();

  // undefined only while the launch identity is being resolved - there is no
  // signed-out state to model, because Telegram identifies the user before the
  // page loads. See signIn() in api/index.ts.
  const [user, setUser] = useState<User | undefined>(undefined);
  const [tab, setTab] = useState<Tab>("boards");
  const [stack, setStack] = useState<Pushed[]>([]);
  // Read from the launch URL once, at module load - see telegram.ts. Null as
  // soon as the sheet is dismissed, so it never re-opens on a tab switch.
  const [inviteToken, setInviteToken] = useState<string | null>(startInviteToken);

  useEffect(() => {
    // signIn() already falls back to the local identity when the backend is
    // unreachable, so the only way through here is storage being unwritable.
    // Even then the app opens - every screen is readable, and the writes that
    // cannot land say so themselves.
    void api.signIn().then(setUser, (err: unknown) => {
      console.warn("[planner] could not resolve the launch identity", err);
      setUser(api.launchUser());
    });
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

  /* Hold the bar and slide along it to move between tabs, the way Instagram's
     does. switchTab() is handed over whole: a tab crossed with the finger down
     should land exactly where a tap on it would, pushed stack cleared and all. */
  const slide = useNavSlide<Tab>(switchTab);

  if (!user) return <div className="app" />;

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
      ) : tab === "calendar" && showCalendar ? (
        <Calendar onOpenTask={(taskId) => push({ name: "task", taskId })} />
      ) : (
        <Settings
          user={user}
          /* A new workspace is a change of context, so the app follows it to
             the screen that shows one. switchTab() also clears the pushed
             stack, which matters: a board pushed from the old workspace would
             otherwise still be on top of the new one. */
          onWorkspaceCreated={() => switchTab("boards")}
          onReset={() => {
            setStack([]);
            setTab("boards");
            // The wipe took the identity row with it; re-derive from Telegram.
            void api.signIn().then(setUser, () => setUser(api.launchUser()));
          }}
        />
      )}

      <nav className={slide.sliding ? "nav is-sliding" : "nav"} ref={slide.ref}>
        {tabs.map(({ id, Icon, label }) => (
          <button
            key={id}
            /* What the slide gesture matches an x position against. Kept on the
               button rather than inferred from the order, so a tab that stops
               being rendered stops being reachable by the finger too. */
            data-tab={id}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => switchTab(id)}
          >
            <Icon />
            <span className="label">{t(label)}</span>
          </button>
        ))}
      </nav>

      {inviteToken && (
        <InviteAccept
          token={inviteToken}
          onDone={() => {
            setInviteToken(null);
            clearStartParam();
          }}
        />
      )}
    </div>
  );
}
