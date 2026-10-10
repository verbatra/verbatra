import type { AbstractIntlMessages } from "next-intl";

export const CLIENT_MESSAGE_NAMESPACES = [
  "docs.diffPanel",
  "docs.screenshot",
  "landing.faq",
  "landing.install",
  "landing.nav.headerCta",
  "landing.nav.languageSwitcher",
  "landing.nav.version",
  "landing.showcase",
  "legal.contact.form",
] as const;

function isMessages(value: unknown): value is AbstractIntlMessages {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function copyPath(
  source: AbstractIntlMessages,
  target: AbstractIntlMessages,
  path: ReadonlyArray<string>,
): void {
  const [head, ...rest] = path;
  if (head === undefined) return;
  const value = source[head];
  if (value === undefined) return;
  if (rest.length === 0) {
    target[head] = value;
    return;
  }
  if (!isMessages(value)) return;
  const existing = target[head];
  const branch: AbstractIntlMessages = isMessages(existing) ? existing : {};
  target[head] = branch;
  copyPath(value, branch, rest);
}

export function pickClientMessages(
  messages: AbstractIntlMessages,
  namespaces: ReadonlyArray<string> = CLIENT_MESSAGE_NAMESPACES,
): AbstractIntlMessages {
  const picked: AbstractIntlMessages = {};
  for (const namespace of namespaces) copyPath(messages, picked, namespace.split("."));
  return picked;
}
