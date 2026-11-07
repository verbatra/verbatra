import type { KeyboardEvent, ReactNode } from "react";
import { useId, useRef } from "react";
import { cn } from "./lib/cn.js";

export type KeyEditorTab = "locales" | "history";

const TABS: readonly { readonly id: KeyEditorTab; readonly label: string }[] = [
  { id: "locales", label: "Locales" },
  { id: "history", label: "History" },
];

const TAB_CLASSES =
  "inline-flex min-h-9 items-center gap-2 border-b-2 border-transparent px-3 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring aria-selected:border-primary aria-selected:text-foreground max-md:min-h-11";

function nextTabIndex(key: string, index: number): number | null {
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return (index + 1) % TABS.length;
    case "ArrowLeft":
    case "ArrowUp":
      return (index + TABS.length - 1) % TABS.length;
    case "Home":
      return 0;
    case "End":
      return TABS.length - 1;
    default:
      return null;
  }
}

export interface KeyEditorTabsProps {
  readonly tab: KeyEditorTab;
  readonly unsaved: boolean;
  readonly onChange: (tab: KeyEditorTab) => void;
  readonly locales: ReactNode;
  readonly history: ReactNode;
}

export function KeyEditorTabs({
  tab,
  unsaved,
  onChange,
  locales,
  history,
}: KeyEditorTabsProps): ReactNode {
  const base = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    const next = nextTabIndex(event.key, index);
    const target = next === null ? undefined : TABS[next];
    if (target === undefined || next === null) {
      return;
    }
    event.preventDefault();
    onChange(target.id);
    buttons.current[next]?.focus();
  }

  return (
    <section className="mb-8" data-key-editor-tabs="">
      <div
        role="tablist"
        aria-label="Key details"
        className="mb-3 flex flex-wrap border-b border-border"
      >
        {TABS.map((entry, index) => (
          <button
            key={entry.id}
            ref={(node) => {
              buttons.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${entry.id}`}
            aria-selected={tab === entry.id}
            aria-controls={`${base}-panel-${entry.id}`}
            tabIndex={tab === entry.id ? 0 : -1}
            data-tab={entry.id}
            className={cn(TAB_CLASSES)}
            onClick={() => onChange(entry.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {entry.label}
            {entry.id === "locales" && unsaved ? (
              <span className="text-xs font-normal text-warning" data-tab-unsaved="">
                Unsaved
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${base}-panel-${tab}`}
        aria-labelledby={`${base}-tab-${tab}`}
        data-tab-panel={tab}
      >
        {tab === "locales" ? locales : history}
      </div>
    </section>
  );
}
