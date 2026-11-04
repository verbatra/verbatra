import type { IconName } from "@verbatra/ui";
import type { PageId } from "../client/routes.js";

export interface NavGroup {
  readonly label: string;
  readonly pages: readonly PageId[];
}

export const NAV_GROUPS: readonly NavGroup[] = [
  { label: "Workspace", pages: ["overview", "translations", "review"] },
  { label: "Project", pages: ["glossary", "settings"] },
];

export const PAGE_LABELS: Readonly<Record<PageId, string>> = {
  overview: "Overview",
  translations: "Translations",
  review: "Review",
  glossary: "Glossary",
  settings: "Settings",
};

export const PAGE_ICONS: Readonly<Record<PageId, IconName>> = {
  overview: "activity",
  translations: "diff",
  review: "review",
  glossary: "book",
  settings: "settings",
};

export const DOCS_URL = "https://verbatra.kreitz-webdev.de";

export const GITHUB_URL = "https://github.com/verbatra/verbatra";
