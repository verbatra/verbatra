import { encodeSegment } from "./showcase-flatten";

export type JsonTree = { readonly [key: string]: string | JsonTree };

export const SHOWCASE_SOURCE_FILE = "en.json";
export const SHOWCASE_TARGET_FILE = "de.json";
export const SHOWCASE_LOCK_FILE = "verbatra.lock.json";
export const SHOWCASE_TARGET_LOCALE = "de";
export const SHOWCASE_PLACEHOLDER = "{{amount}}";

export const SHOWCASE_SOURCE: JsonTree = {
  cart: {
    total: "Total: {{amount}}",
    checkout: "Check out",
  },
  account: {
    signIn: "Sign in",
    orders: "Your orders",
  },
};

export const SHOWCASE_TARGET: JsonTree = {
  cart: {
    total: "Summe: {{amount}}",
    checkout: "Zur Kasse",
  },
  account: {
    signIn: "Anmelden",
    orders: "Deine Bestellungen",
  },
};

export const SHOWCASE_SCENARIOS = ["edit", "add", "remove", "break"] as const;

export type ShowcaseScenarioId = (typeof SHOWCASE_SCENARIOS)[number];

export type ShowcaseChange = {
  readonly path: readonly [string, string];
  readonly value?: string;
  readonly candidate?: string;
};

export const SHOWCASE_BREAKS = ["drop", "rename", "add"] as const;

export type ShowcaseBreakId = (typeof SHOWCASE_BREAKS)[number];

export const DEFAULT_SHOWCASE_BREAK: ShowcaseBreakId = "rename";

export const SHOWCASE_BREAK_REPLIES: Readonly<
  Record<ShowcaseBreakId, { readonly candidate: string; readonly token: string }>
> = {
  drop: { candidate: "Fällig: sofort", token: SHOWCASE_PLACEHOLDER },
  rename: { candidate: "Fällig: {{betrag}}", token: "{{betrag}}" },
  add: { candidate: "Fällig: {{amount}} zzgl. {{tax}}", token: "{{tax}}" },
};

export const SHOWCASE_CHANGES: Readonly<Record<ShowcaseScenarioId, ShowcaseChange>> = {
  edit: { path: ["cart", "checkout"], value: "Go to checkout", candidate: "Weiter zur Kasse" },
  add: { path: ["account", "wishlist"], value: "Your wishlist", candidate: "Deine Wunschliste" },
  remove: { path: ["account", "orders"] },
  break: {
    path: ["cart", "total"],
    value: "Due: {{amount}}",
    candidate: SHOWCASE_BREAK_REPLIES[DEFAULT_SHOWCASE_BREAK].candidate,
  },
};

export function showcaseChange(
  id: ShowcaseScenarioId,
  reply: ShowcaseBreakId = DEFAULT_SHOWCASE_BREAK,
): ShowcaseChange {
  const change = SHOWCASE_CHANGES[id];
  if (id !== "break") return change;
  return { ...change, candidate: SHOWCASE_BREAK_REPLIES[reply].candidate };
}

function withLeaf(tree: JsonTree, path: ShowcaseChange["path"], value?: string): JsonTree {
  const [group, leaf] = path;
  const branch = tree[group];
  const entries = Object.entries(typeof branch === "object" ? branch : {});
  const kept = entries.filter(([key]) => key !== leaf);
  const exists = kept.length !== entries.length;
  const next =
    value === undefined
      ? kept
      : exists
        ? entries.map(([key, current]) => [key, key === leaf ? value : current] as const)
        : [...entries, [leaf, value] as const];
  return { ...tree, [group]: Object.fromEntries(next) };
}

export function applyShowcaseChange(tree: JsonTree, change: ShowcaseChange): JsonTree {
  return withLeaf(tree, change.path, change.value);
}

export function showcaseKey(path: ShowcaseChange["path"]): string {
  return path.map(encodeSegment).join(".");
}
