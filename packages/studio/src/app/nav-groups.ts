import type { PageId } from "../client/routes.js";

export interface NavGroup {
  readonly label: string;
  readonly pages: readonly PageId[];
}

export const NAV_GROUPS: readonly NavGroup[] = [
  { label: "Workspace", pages: ["overview", "translations", "review"] },
  { label: "Project", pages: ["glossary", "settings"] },
];
