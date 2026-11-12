"use client";

import { useTranslations } from "next-intl";
import { type FocusEvent, type KeyboardEvent, type ReactNode, useId, useRef } from "react";
import { LATEST, RELEASE_LINES, setChoice, type VersionPackage } from "@/lib/docs-version";
import { useVersionChoice } from "@/lib/use-version-choice";

export type VersionPickerLayout = "header" | "sidebar";

function ChevronIcon(): ReactNode {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="vk-version-chevron"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function VersionSelect({ pkg, label }: { pkg: VersionPackage; label: string }): ReactNode {
  const t = useTranslations("docs.versionPicker");
  const id = useId();
  const choice = useVersionChoice(pkg);
  return (
    <div className="vk-version-field">
      <label htmlFor={id} className="vk-version-label">
        {label}
      </label>
      <select
        id={id}
        className="vk-version-select"
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
        <summary ref={summary} className="vk-version-more-toggle" title={t("more")}>
          <ChevronIcon />
          <span className="vk-version-more-text">{t("more")}</span>
        </summary>
        <div className="vk-version-panel">
          <VersionSelect pkg="studio" label={t("studio")} />
          <VersionSelect pkg="mcp" label={t("mcp")} />
        </div>
      </details>
    </div>
  );
}
