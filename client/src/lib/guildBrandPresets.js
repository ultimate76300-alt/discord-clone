/** Clés persistées en base (`guilds.icon_brand_key`). */
export const GUILD_BRAND_PRESET_KEYS = [
  "site",
  "violet",
  "coral",
  "emerald",
  "amber",
  "sky",
  "rose",
  "mono",
];

/** Classes Tailwind par variante (géométrie identique au favicon). */
export const GUILD_BRAND_PRESETS = {
  site: {
    label: "Officiel",
    core: "fill-discord-accent",
    o1: "stroke-discord-accent",
    o2: "stroke-[#53b4ff]",
    o3: "stroke-discord-green",
  },
  violet: {
    label: "Violet",
    core: "fill-violet-400",
    o1: "stroke-violet-400",
    o2: "stroke-fuchsia-400",
    o3: "stroke-indigo-400",
  },
  coral: {
    label: "Corail",
    core: "fill-rose-400",
    o1: "stroke-rose-400",
    o2: "stroke-orange-400",
    o3: "stroke-pink-400",
  },
  emerald: {
    label: "Émeraude",
    core: "fill-emerald-400",
    o1: "stroke-emerald-400",
    o2: "stroke-teal-400",
    o3: "stroke-lime-400",
  },
  amber: {
    label: "Ambre",
    core: "fill-amber-400",
    o1: "stroke-amber-400",
    o2: "stroke-orange-400",
    o3: "stroke-yellow-400",
  },
  sky: {
    label: "Ciel",
    core: "fill-sky-400",
    o1: "stroke-sky-400",
    o2: "stroke-cyan-400",
    o3: "stroke-blue-500",
  },
  rose: {
    label: "Rose",
    core: "fill-pink-400",
    o1: "stroke-pink-400",
    o2: "stroke-rose-300",
    o3: "stroke-fuchsia-500",
  },
  mono: {
    label: "Neutre",
    core: "fill-zinc-300",
    o1: "stroke-zinc-400",
    o2: "stroke-zinc-500",
    o3: "stroke-zinc-600",
  },
};

export function isValidBrandPresetKey(key) {
  return typeof key === "string" && key in GUILD_BRAND_PRESETS;
}
