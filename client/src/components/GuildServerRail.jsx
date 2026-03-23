import { BrandMark } from "./BrandMark";
import { isValidBrandPresetKey } from "../lib/guildBrandPresets";

function initialForName(name) {
  const t = (name || "").trim();
  if (!t) return "?";
  const c = t[0];
  return c.toLocaleUpperCase(undefined);
}

export function GuildServerRail({
  activeGuildId = null,
  privateGuilds = [],
  guildTablesMissing = false,
  onSelectPublicLobby,
  onSelectPrivateGuild,
  onOpenCreateGuild,
}) {
  const railBtn =
    "relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl text-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-discord-accent";

  return (
    <aside
      className="flex min-h-0 w-[72px] shrink-0 flex-col items-center gap-2 border-r border-discord-border bg-[#1e1f22] py-2"
      aria-label="Espaces"
    >
      <button
        type="button"
        title="Lobby public"
        onClick={() => onSelectPublicLobby?.()}
        className={`${railBtn} ${
          activeGuildId == null
            ? "rounded-2xl bg-discord-accent text-white"
            : "bg-discord-sidebar text-xl hover:rounded-xl hover:bg-discord-accent hover:text-white"
        }`}
      >
        🌐
      </button>

      <div className="h-0.5 w-8 rounded-full bg-discord-border" aria-hidden />

      <div className="scroll-discord flex min-h-0 w-full flex-1 flex-col items-center gap-2 overflow-y-auto px-0 py-0">
        {privateGuilds.map((g) => {
          const active = activeGuildId === g.id;
          return (
            <button
              key={g.id}
              type="button"
              title={g.name}
              onClick={() => onSelectPrivateGuild?.(g.id)}
              className={`${railBtn} text-sm font-semibold ${
                active
                  ? "rounded-2xl bg-discord-accent text-white ring-0"
                  : "bg-discord-sidebar text-discord-text hover:rounded-xl hover:bg-discord-accent hover:text-white"
              }`}
            >
              {g.iconUrl ? (
                <img src={g.iconUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : g.iconBrandKey && isValidBrandPresetKey(g.iconBrandKey) ? (
                <BrandMark variant={g.iconBrandKey} className="h-8 w-8" title={g.name} />
              ) : (
                <span className="relative z-[1]">{initialForName(g.name)}</span>
              )}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        title={guildTablesMissing ? "Tables guild non installées" : "Créer un serveur privé"}
        disabled={guildTablesMissing}
        onClick={() => onOpenCreateGuild?.()}
        className={`${railBtn} border-2 border-dashed border-discord-border text-xl font-light text-discord-green hover:border-discord-green hover:bg-discord-green/15 disabled:cursor-not-allowed disabled:opacity-40`}
      >
        +
      </button>
    </aside>
  );
}
