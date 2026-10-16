import { compareMarkdown } from "./compare-markdown";
import type { Locale } from "./i18n";
import { landingMarkdown } from "./landing-markdown";
import {
  contactMarkdown,
  imprintMarkdown,
  licensesMarkdown,
  privacyMarkdown,
} from "./legal-markdown";
import type { MarkdownPage } from "./markdown-route";

export const SITE_MARKDOWN: Readonly<Record<MarkdownPage, (locale: Locale) => Promise<string>>> = {
  "/": landingMarkdown,
  "/compare": compareMarkdown,
  "/imprint": imprintMarkdown,
  "/privacy": privacyMarkdown,
  "/licenses": licensesMarkdown,
  "/contact": contactMarkdown,
};
