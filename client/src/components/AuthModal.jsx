import { useState } from "react";
import { supabase } from "../lib/supabase";
import { AVATAR_COLORS, AVATAR_EMOJIS } from "../lib/identity";
import { randomAvatarMeta } from "../lib/authProfile";

export function AuthModal() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatar, setAvatar] = useState(() => randomAvatarMeta());
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setInfo("");
    if (!supabase) return;
    // #region agent log
    fetch("http://127.0.0.1:7417/ingest/f928b117-4eb1-4e9d-bfda-60aee881559e", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "4bd8e4" },
      body: JSON.stringify({
        sessionId: "4bd8e4",
        runId: "site-empty-slow",
        hypothesisId: "H1",
        location: "client/src/components/AuthModal.jsx:handleLogin:start",
        message: "Login started",
        data: { hasEmail: Boolean(email.trim()), passwordLen: password.length },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      // #region agent log
      fetch("http://127.0.0.1:7417/ingest/f928b117-4eb1-4e9d-bfda-60aee881559e", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "4bd8e4" },
        body: JSON.stringify({
          sessionId: "4bd8e4",
          runId: "site-empty-slow",
          hypothesisId: "H1",
          location: "client/src/components/AuthModal.jsx:handleLogin:result",
          message: "Login result",
          data: {
            hasError: Boolean(err),
            errorMessage: err?.message || null,
            errorCode: err?.code || null,
            errorStatus: err?.status || null,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      if (err) setError(err.message || "Connexion impossible.");
    } catch (e) {
      setError(e?.message || "Erreur réseau pendant la connexion.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setError("");
    setInfo("");
    const name = displayName.trim().slice(0, 32);
    if (!name) {
      setError("Indiquez un pseudo.");
      return;
    }
    if (!supabase) return;
    setLoading(true);
    try {
      const { data, error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            display_name: name,
            avatar_color: avatar.avatar_color,
            avatar_emoji: avatar.avatar_emoji,
          },
        },
      });
      if (err) {
        setError(err.message);
        return;
      }
      if (data.user && !data.session) {
        setInfo("Vérifiez votre boîte mail pour confirmer votre compte.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm">
      <div
        className="w-full max-w-md rounded-xl border border-discord-border bg-discord-sidebar p-6 shadow-2xl shadow-black/50"
        role="dialog"
        aria-labelledby="auth-title"
      >
        <h1 id="auth-title" className="text-xl font-semibold text-discord-text">
          {mode === "login" ? "Connexion" : "Créer un compte"}
        </h1>
        <p className="mt-1 text-sm text-discord-muted">
          Compte Supabase — même identité sur tous vos appareils.
        </p>

        <div className="mt-4 flex gap-2 rounded bg-discord-input p-1">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setError("");
              setInfo("");
            }}
            className={`flex-1 rounded py-2 text-sm font-medium transition ${
              mode === "login"
                ? "bg-discord-hover text-discord-text ring-1 ring-discord-border"
                : "text-discord-muted hover:text-discord-text"
            }`}
          >
            Connexion
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("register");
              setError("");
              setInfo("");
            }}
            className={`flex-1 rounded py-2 text-sm font-medium transition ${
              mode === "register"
                ? "bg-discord-hover text-discord-text ring-1 ring-discord-border"
                : "text-discord-muted hover:text-discord-text"
            }`}
          >
            Inscription
          </button>
        </div>

        {mode === "login" ? (
          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-discord-muted">
                E-mail
              </label>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded bg-discord-bg px-3 py-2 text-discord-text outline-none ring-discord-accent focus:ring-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-discord-muted">
                Mot de passe
              </label>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded bg-discord-bg px-3 py-2 text-discord-text outline-none ring-discord-accent focus:ring-2"
              />
            </div>
            {error ? <p className="text-sm text-red-400">{error}</p> : null}
            {info ? <p className="text-sm text-discord-green">{info}</p> : null}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded bg-discord-accent py-2.5 text-sm font-medium text-white transition hover:bg-discord-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? "…" : "Se connecter"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="mt-6 space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-discord-muted">
                Pseudo (sans @)
              </label>
              <input
                autoFocus
                maxLength={32}
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="utilisateur"
                className="w-full rounded bg-discord-bg px-3 py-2 text-discord-text outline-none ring-discord-accent focus:ring-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-discord-muted">
                E-mail
              </label>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded bg-discord-bg px-3 py-2 text-discord-text outline-none ring-discord-accent focus:ring-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-discord-muted">
                Mot de passe
              </label>
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded bg-discord-bg px-3 py-2 text-discord-text outline-none ring-discord-accent focus:ring-2"
              />
            </div>
            <div>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-discord-muted">
                Couleur
              </span>
              <div className="flex flex-wrap gap-2">
                {AVATAR_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    title={c}
                    onClick={() => setAvatar((a) => ({ ...a, avatar_color: c }))}
                    className={`h-9 w-9 rounded-full ring-2 ring-offset-2 ring-offset-discord-sidebar transition ${
                      avatar.avatar_color === c ? "ring-discord-accent" : "ring-transparent hover:ring-discord-border"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <div>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-discord-muted">
                Emoji
              </span>
              <div className="flex flex-wrap gap-2">
                {AVATAR_EMOJIS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => setAvatar((a) => ({ ...a, avatar_emoji: em }))}
                    className={`rounded-lg border px-2 py-1 text-xl transition ${
                      avatar.avatar_emoji === em
                        ? "border-discord-accent bg-discord-hover"
                        : "border-transparent bg-discord-input hover:bg-discord-hover"
                    }`}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>
            {error ? <p className="text-sm text-red-400">{error}</p> : null}
            {info ? <p className="text-sm text-discord-green">{info}</p> : null}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded bg-discord-accent py-2.5 text-sm font-medium text-white transition hover:bg-discord-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? "…" : "S'inscrire"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
