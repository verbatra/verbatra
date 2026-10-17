import { isValidElement, type ReactElement } from "react";

const LAZY = Symbol.for("react.lazy");

type Seen = WeakMap<object, WeakSet<object>>;
type LazyWrapper = { $$typeof: symbol; _payload: unknown };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isLazy(value: object): value is LazyWrapper {
  return (value as Partial<LazyWrapper>).$$typeof === LAZY;
}

function resolvedValue(payload: unknown): { value: unknown } | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  const chunk = payload as {
    status?: unknown;
    value?: unknown;
    _status?: unknown;
    _result?: unknown;
  };
  if (chunk.status === "fulfilled") return { value: chunk.value };
  if (chunk._status === 1) return { value: chunk._result };
  return undefined;
}

function alreadyCompared(seen: Seen, next: object, previous: object): boolean {
  const partners = seen.get(next);
  if (partners?.has(previous)) return true;
  if (partners) partners.add(previous);
  else seen.set(next, new WeakSet([previous]));
  return false;
}

function sameLazy(next: LazyWrapper, previous: LazyWrapper, seen: Seen): boolean {
  const resolvedNext = resolvedValue(next._payload);
  const resolvedPrevious = resolvedValue(previous._payload);
  if (resolvedNext === undefined || resolvedPrevious === undefined) {
    return Object.is(next._payload, previous._payload);
  }
  return compare(resolvedNext.value, resolvedPrevious.value, seen);
}

function sameElement(next: ReactElement, previous: ReactElement, seen: Seen): boolean {
  return (
    next.key === previous.key &&
    compare(next.type, previous.type, seen) &&
    compare(next.props, previous.props, seen)
  );
}

function sameItems(next: unknown[], previous: unknown[], seen: Seen): boolean {
  return (
    next.length === previous.length &&
    next.every((item, index) => compare(item, previous[index], seen))
  );
}

function sameEntries(
  next: Record<string, unknown>,
  previous: Record<string, unknown>,
  seen: Seen,
): boolean {
  const keys = Object.keys(next);
  return (
    keys.length === Object.keys(previous).length &&
    keys.every((key) => Object.hasOwn(previous, key) && compare(next[key], previous[key], seen))
  );
}

function compareObjects(next: object, previous: object, seen: Seen): boolean {
  if (alreadyCompared(seen, next, previous)) return true;
  if (isLazy(next) && isLazy(previous)) return sameLazy(next, previous, seen);
  if (isValidElement(next) && isValidElement(previous)) return sameElement(next, previous, seen);
  if (Array.isArray(next) && Array.isArray(previous)) return sameItems(next, previous, seen);
  return isPlainObject(next) && isPlainObject(previous) && sameEntries(next, previous, seen);
}

function compare(next: unknown, previous: unknown, seen: Seen): boolean {
  if (Object.is(next, previous)) return true;
  if (typeof next !== "object" || next === null) return false;
  if (typeof previous !== "object" || previous === null) return false;
  return compareObjects(next, previous, seen);
}

export function sameValue(next: unknown, previous: unknown): boolean {
  return compare(next, previous, new WeakMap());
}
