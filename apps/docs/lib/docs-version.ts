import releases from "./release-lines.generated.json";
import {
  isLine,
  type PlacedBadge,
  placeBadge,
  type ReleaseLines,
  VERSION_PACKAGES,
  VERSION_STORAGE_KEY,
  type VersionPackage,
} from "./release-lines.mjs";
import { embed } from "./theme";

export { VERSION_PACKAGES, VERSION_STORAGE_KEY, type VersionPackage };

export const RELEASE_LINES: ReleaseLines = releases;

export const LATEST = "latest";

export type VersionChoice = typeof LATEST | string;

export function versionAttribute(pkg: VersionPackage): string {
  return `data-vk-${pkg}`;
}

export function placeAvailableFrom(pkg: string | undefined, version: string): PlacedBadge {
  const placed = placeBadge(pkg, version, RELEASE_LINES);
  if (placed === undefined) {
    throw new Error(`AvailableFrom ${pkg ?? "@verbatra/cli"} ${version} has no release line`);
  }
  return placed;
}

export function isKnownLine(pkg: VersionPackage, value: unknown): value is string {
  return isLine(value) && RELEASE_LINES[pkg].lines.includes(value);
}

export function parseStoredChoices(raw: string | null): Partial<Record<VersionPackage, string>> {
  if (raw === null) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const stored = parsed as Record<string, unknown>;
    const choices: Partial<Record<VersionPackage, string>> = {};
    for (const pkg of VERSION_PACKAGES) {
      const value = stored[pkg];
      if (isKnownLine(pkg, value)) choices[pkg] = value;
    }
    return choices;
  } catch {
    return {};
  }
}

export function readStoredChoices(): Partial<Record<VersionPackage, string>> {
  try {
    return parseStoredChoices(localStorage.getItem(VERSION_STORAGE_KEY));
  } catch {
    return {};
  }
}

export function storeChoices(choices: Partial<Record<VersionPackage, string>>): void {
  try {
    localStorage.setItem(VERSION_STORAGE_KEY, JSON.stringify(choices));
  } catch {}
}

export function currentChoice(pkg: VersionPackage): VersionChoice {
  const value = document.documentElement.getAttribute(versionAttribute(pkg));
  return isKnownLine(pkg, value) ? value : LATEST;
}

function showChoice(pkg: VersionPackage, choice: VersionChoice): void {
  const root = document.documentElement;
  if (choice === LATEST) root.removeAttribute(versionAttribute(pkg));
  else root.setAttribute(versionAttribute(pkg), choice);
}

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function syncFromStorage(): void {
  const stored = readStoredChoices();
  for (const pkg of VERSION_PACKAGES) showChoice(pkg, stored[pkg] ?? LATEST);
  notify();
}

function onStorage(event: StorageEvent): void {
  if (event.key !== VERSION_STORAGE_KEY && event.key !== null) return;
  syncFromStorage();
}

export function subscribeVersion(listener: () => void): () => void {
  if (listeners.size === 0) window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

export function chosenLatest(): VersionChoice {
  return LATEST;
}

export function setChoice(pkg: VersionPackage, choice: VersionChoice): void {
  const choices: Partial<Record<VersionPackage, string>> = {};
  for (const other of VERSION_PACKAGES) {
    const value = other === pkg ? choice : currentChoice(other);
    if (value !== LATEST) choices[other] = value;
  }
  storeChoices(choices);
  showChoice(pkg, choice);
  notify();
}

const PACKAGE_KEYS = embed(VERSION_PACKAGES);
const STORAGE_KEY = embed(VERSION_STORAGE_KEY);

export const VERSION_INIT_SCRIPT = `(function(){try{var s=JSON.parse(localStorage.getItem(${STORAGE_KEY})||"null");if(s&&typeof s==="object"){var r=document.documentElement;${PACKAGE_KEYS}.forEach(function(k){var v=s[k];if(typeof v==="string"&&/^\\d+\\.\\d+$/.test(v))r.setAttribute("data-vk-"+k,v)})}}catch(e){}})()`;
