import { encodeSegment } from "./showcase-flatten";

export type JsonTree = { readonly [key: string]: string | JsonTree };

export const SHOWCASE_SOURCE_FILE = "en.json";
export const SHOWCASE_TARGET_FILE = "de.json";
export const SHOWCASE_LOCK_FILE = "verbatra.lock.json";
export const SHOWCASE_TARGET_LOCALE = "de";

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

export const SHOWCASE_CHANGES: Readonly<Record<ShowcaseScenarioId, ShowcaseChange>> = {
  edit: { path: ["cart", "checkout"], value: "Go to checkout", candidate: "Weiter zur Kasse" },
  add: { path: ["account", "wishlist"], value: "Your wishlist", candidate: "Deine Wunschliste" },
  remove: { path: ["account", "orders"] },
  break: {
    path: ["cart", "total"],
    value: "Due: {{amount}}",
    candidate: "Fällig: {{betrag}}",
  },
};

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
