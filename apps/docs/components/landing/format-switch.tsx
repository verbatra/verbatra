"use client";

import { type ReactNode, useState } from "react";
import { TabList, tabPanelProps } from "@/components/ui/tabs";
import { trackUmamiEvent } from "@/lib/umami";

export const FORMAT_SWITCH_ID = "formats";

export type FormatSwitchTab = { id: string; label: string; pane: ReactNode };

export type FormatSwitchFramework = {
  key: string;
  name: string;
  format: string;
  icon: ReactNode;
};

export type FormatSwitchLabels = { frameworks: string; formats: string };

export function FormatSwitch({
  formats,
  frameworks,
  labels,
}: {
  formats: ReadonlyArray<FormatSwitchTab>;
  frameworks: ReadonlyArray<FormatSwitchFramework>;
  labels: FormatSwitchLabels;
}): ReactNode {
  const [active, setActive] = useState(formats[0]?.id ?? "");
  const [framework, setFramework] = useState<string | undefined>(undefined);

  function selectFormat(id: string) {
    setFramework(undefined);
    if (id === active) return;
    setActive(id);
    trackUmamiEvent("select-tab", { tab: id, location: "formats" });
  }

  function selectFramework(chip: FormatSwitchFramework) {
    if (chip.key === framework) return;
    setFramework(chip.key);
    setActive(chip.format);
    trackUmamiEvent("select-tab", {
      tab: chip.format,
      location: "formats",
      framework: chip.key,
    });
  }

  return (
    <div className="vk-formats-switch">
      <div className="vk-formats-chips vk-edge-fade">
        <ul
          // biome-ignore lint/a11y/noRedundantRoles: Safari drops list semantics from a list-style: none list
          role="list"
          aria-label={labels.frameworks}
          className="vk-formats-chip-list"
        >
          {frameworks.map((chip) => (
            <li key={chip.key}>
              <button
                type="button"
                aria-pressed={chip.key === framework}
                className="vk-formats-chip"
                onClick={() => selectFramework(chip)}
              >
                {chip.icon}
                <span>{chip.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="vk-formats-tabs vk-edge-fade">
        <TabList
          tabs={formats.map(({ id, label }) => ({ id, label }))}
          active={active}
          onSelect={selectFormat}
          ariaLabel={labels.formats}
          variant="segmented"
          idPrefix={FORMAT_SWITCH_ID}
          className="vk-formats-tablist"
        />
      </div>
      <div className="vk-formats-panes">
        {formats.map((format) => (
          <div
            key={format.id}
            {...tabPanelProps(FORMAT_SWITCH_ID, format.id, active)}
            className="vk-formats-pane"
          >
            {format.pane}
          </div>
        ))}
      </div>
    </div>
  );
}
