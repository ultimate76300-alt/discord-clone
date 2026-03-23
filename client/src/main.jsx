import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

const SB_GLOBAL = "__DISCORD_CLONE_SB__";

async function bootstrapAndRender() {
  if (import.meta.env.PROD) {
    try {
      const r = await fetch("/api/client-env.json", { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        const url = typeof j?.supabaseUrl === "string" ? j.supabaseUrl.trim() : "";
        const key = typeof j?.supabaseAnonKey === "string" ? j.supabaseAnonKey.trim() : "";
        if (url && key) {
          globalThis[SB_GLOBAL] = { url, key };
        }
      }
    } catch {
      /* réseau / pas de serveur : retomber sur invité si pas de config build */
    }
  }

  const { default: App } = await import("./App.jsx");
  createRoot(document.getElementById("root")).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

bootstrapAndRender();
