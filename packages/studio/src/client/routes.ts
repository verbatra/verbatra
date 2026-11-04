import { KEY_STATUSES, type KeyStatus } from "./key-status-filter.js";

export const PAGE_IDS = ["overview", "translations", "review", "glossary", "settings"] as const;

export type PageId = (typeof PAGE_IDS)[number];

export const DEFAULT_PAGE: PageId = "translations";

const PAGE_ALIASES: ReadonlyMap<string, PageId> = new Map<string, PageId>([
  ["activity", "overview"],
]);

export interface RouteParams {
  readonly locale?: string;
  readonly statuses?: readonly KeyStatus[];
  readonly key?: string;
}

export interface Route {
  readonly page: PageId;
  readonly params: RouteParams;
}

export interface RouteParamsInput {
  readonly locale?: string | undefined;
  readonly statuses?: Iterable<KeyStatus> | undefined;
  readonly key?: string | null | undefined;
}

const PAGE_PARAMS: Readonly<Record<PageId, readonly (keyof RouteParams)[]>> = {
  overview: [],
  translations: ["locale", "statuses", "key"],
  review: ["locale"],
  glossary: [],
  settings: [],
};

function isPageId(value: string): value is PageId {
  return (PAGE_IDS as readonly string[]).includes(value);
}

function isKeyStatus(value: string): value is KeyStatus {
  return (KEY_STATUSES as readonly string[]).includes(value);
}

function splitHash(hash: string): { readonly name: string; readonly query: string } {
  const body = hash.replace(/^#\/?/, "");
  const separator = body.indexOf("?");
  return separator === -1
    ? { name: body, query: "" }
    : { name: body.slice(0, separator), query: body.slice(separator + 1) };
}

function resolvePage(name: string): PageId | undefined {
  if (isPageId(name)) {
    return name;
  }
  return PAGE_ALIASES.get(name);
}

function orderedStatuses(statuses: Iterable<KeyStatus>): readonly KeyStatus[] {
  const held = new Set(statuses);
  return KEY_STATUSES.filter((status) => held.has(status));
}

export function routeParams(input: RouteParamsInput): RouteParams {
  const statuses = orderedStatuses(input.statuses ?? []);
  return {
    ...(input.locale !== undefined && input.locale !== "" ? { locale: input.locale } : {}),
    ...(statuses.length > 0 ? { statuses } : {}),
    ...(input.key !== undefined && input.key !== null && input.key !== ""
      ? { key: input.key }
      : {}),
  };
}

function paramsForPage(page: PageId, search: URLSearchParams): RouteParams {
  const allowed = PAGE_PARAMS[page];
  const statuses = search
    .getAll("status")
    .flatMap((value) => value.split(","))
    .filter(isKeyStatus);
  return routeParams({
    locale: allowed.includes("locale") ? (search.get("locale") ?? undefined) : undefined,
    statuses: allowed.includes("statuses") ? statuses : undefined,
    key: allowed.includes("key") ? search.get("key") : undefined,
  });
}

export function parseRoute(hash: string): Route {
  const { name, query } = splitHash(hash);
  const page = resolvePage(name);
  if (page === undefined) {
    return { page: DEFAULT_PAGE, params: {} };
  }
  return { page, params: paramsForPage(page, new URLSearchParams(query)) };
}

export function routeHash(route: Route): string {
  const search = new URLSearchParams();
  const allowed = PAGE_PARAMS[route.page];
  if (allowed.includes("locale") && route.params.locale !== undefined) {
    search.set("locale", route.params.locale);
  }
  if (allowed.includes("statuses")) {
    for (const status of route.params.statuses ?? []) {
      search.append("status", status);
    }
  }
  if (allowed.includes("key") && route.params.key !== undefined) {
    search.set("key", route.params.key);
  }
  const query = search.toString();
  return query === "" ? `#/${route.page}` : `#/${route.page}?${query}`;
}

export function canonicalPageHash(hash: string): string | null {
  const { name } = splitHash(hash);
  if (name === "" || isPageId(name)) {
    return null;
  }
  return routeHash(parseRoute(hash));
}

export function pageHash(page: PageId): string {
  return `#/${page}`;
}
