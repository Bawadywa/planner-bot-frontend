import { useState, type FormEvent } from "react";
import * as api from "../api";
import { PoweredBy } from "../components/PoweredBy";
import { hapticError } from "../telegram";
import type { User } from "../types";

interface AuthProps {
  onAuthed: (user: User) => void;
}

type Mode = "signin" | "signup";

export function Auth({ onAuthed }: AuthProps) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    setError("");
    try {
      const session =
        mode === "signup"
          ? await api.register(email, password)
          : await api.login(email, password);
      onAuthed(session.user);
    } catch (err) {
      hapticError();
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function switchMode() {
    setMode(mode === "signin" ? "signup" : "signin");
    setError("");
  }

  return (
    <div className="screen">
      <div className="auth">
        <div className="auth-brand">
          <div className="mark">P</div>
          <h1>{mode === "signin" ? "Welcome back" : "Create an account"}</h1>
          <p>
            {mode === "signin"
              ? "Sign in to your boards."
              : "One account for every board you own or join."}
          </p>
        </div>

        <form onSubmit={submit} noValidate>
          {error && <div className="error">{error}</div>}

          <label className="field">
            <div className="label">
              <span>Email</span>
            </div>
            <input
              className="input"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={254}
              required
            />
          </label>

          <label className="field">
            <div className="label">
              <span>Password</span>
              {mode === "signup" && <span className="limit">min 8</span>}
            </div>
            <input
              className="input"
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              maxLength={72}
              required
            />
          </label>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={busy || !email || !password}
          >
            {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <div className="auth-switch">
          {mode === "signin" ? "No account yet?" : "Already have an account?"}{" "}
          <button type="button" onClick={switchMode}>
            {mode === "signin" ? "Create one" : "Sign in"}
          </button>
        </div>

        <PoweredBy />
      </div>
    </div>
  );
}
