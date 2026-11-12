"use client";

import { useTranslations } from "next-intl";
import {
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
  useId,
  useRef,
} from "react";
import {
  LATEST,
  RELEASE_LINES,
  setChoice,
  type VersionChoice,
  type VersionPackage,
} from "@/lib/docs-version";
import { useVersionChoice } from "@/lib/use-version-choice";

export type VersionPickerLayout = "header" | "sidebar";

function MoreIcon(): ReactNode {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className="vk-version-more-icon"
    >
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}

export function pickedLines(
  entries: readonly { readonly label: string; readonly choice: VersionChoice }[],
): string {
  return entries
    .filter((entry) => entry.choice !== LATEST)
    .map((entry) => `${entry.label} ${entry.choice}`)
    .join(", ");
}

export function selectChars(latest: string, lines: readonly string[]): number {
  return Math.max(latest.length, ...lines.map((line) => line.length));
}

function VersionSelect({ pkg, label }: { pkg: VersionPackage; label: string }): ReactNode {
  const t = useTranslations("docs.versionPicker");
  const id = useId();
  const choice = useVersionChoice(pkg);
  const chars = selectChars(t("latest"), RELEASE_LINES[pkg].lines);
  return (
    <div className="vk-version-field">
      <label htmlFor={id} className="vk-version-label">
        {label}
      </label>
      <select
        id={id}
        className="vk-version-select"
        style={{ "--vk-version-chars": chars } as CSSProperties}
        value={choice}
        onChange={(event) => setChoice(pkg, event.target.value)}
      >
        <option value={LATEST}>{t("latest")}</option>
        {RELEASE_LINES[pkg].lines.map((line) => (
          <option key={line} value={line}>
            {line}
          </option>
        ))}
      </select>
    </div>
  );
}

export function VersionPicker({ layout }: { layout: VersionPickerLayout }): ReactNode {
  const t = useTranslations("docs.versionPicker");
  const studioChoice = useVersionChoice("studio");
  const mcpChoice = useVersionChoice("mcp");
  const picked = pickedLines([
    { label: t("studio"), choice: studioChoice },
    { label: t("mcp"), choice: mcpChoice },
  ]);
  const more = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);
  const closeOnEscape = (event: KeyboardEvent<HTMLDetailsElement>) => {
    if (event.key !== "Escape" || !more.current?.open) return;
    event.stopPropagation();
    more.current.open = false;
    summary.current?.focus();
  };
  const closeOnLeave = (event: FocusEvent<HTMLDetailsElement>) => {
    if (layout !== "header") return;
    if (event.relatedTarget instanceof Node && more.current?.contains(event.relatedTarget)) return;
    if (more.current) more.current.open = false;
  };
  return (
    <div className="vk-version-picker" data-layout={layout}>
      <VersionSelect pkg="cli" label={t("cliSdk")} />
      <details
        ref={more}
        className="vk-version-more"
        onKeyDown={closeOnEscape}
        onBlur={closeOnLeave}
      >
        <summary
          ref={summary}
          className="vk-version-more-toggle"
          title={picked === "" ? t("more") : `${t("more")}: ${picked}`}
          data-picked={picked === "" ? undefined : ""}
        >
          <MoreIcon />
          <span className="vk-version-more-text">
            {t("more")}
            {picked === "" ? null : <span className="vk-version-picked">{`: ${picked}`}</span>}
          </span>
        </summary>
        <div className="vk-version-panel">
          <VersionSelect pkg="studio" label={t("studio")} />
          <VersionSelect pkg="mcp" label={t("mcp")} />
        </div>
      </details>
    </div>
  );
}
