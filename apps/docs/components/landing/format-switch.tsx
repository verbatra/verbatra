"use client";

import type { SupportedFormat } from "@verbatra/sdk";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { TabList, tabPanelProps } from "@/components/ui/tabs";
import { retrying } from "@/lib/retry";
import { FormatPaneFrame } from "./format-pane-frame";

export const FORMAT_SWITCH_ID = "formats";

export type FormatSwitchTab = { id: SupportedFormat; label: string; file: string };

type PaneModule = typeof import("./format-pane");

let panes: Promise<PaneModule> | undefined;

export function loadFormatPanes(): Promise<PaneModule> {
  panes ??= retrying(() => import("./format-pane")).catch((error: unknown) => {
    panes = undefined;
    throw error;
  });
  return panes;
}

export type FormatSwitchFramework = {
  key: string;
  name: string;
  format: string;
  icon: ReactNode;
};

export type FormatSwitchLabels = { frameworks: string; formats: string };

function usePaneModule(): [PaneModule | null, boolean, () => void] {
  const [paneModule, setPaneModule] = useState<PaneModule | null>(null);
  const [failed, setFailed] = useState(false);
  const requestPanes = useCallback(() => {
    if (paneModule) return;
    setFailed(false);
    loadFormatPanes().then(setPaneModule, () => setFailed(true));
  }, [paneModule]);
  return [paneModule, failed, requestPanes];
}

export function FormatSwitch({
  formats,
  frameworks,
  labels,
  initialPane,
  sizer,
}: {
  formats: ReadonlyArray<FormatSwitchTab>;
  initialPane: ReactNode;
  sizer: ReactNode;
  frameworks: ReadonlyArray<FormatSwitchFramework>;
  labels: FormatSwitchLabels;
}): ReactNode {
  const [active, setActive] = useState<string>(formats[0]?.id ?? "");
  const [framework, setFramework] = useState<string | undefined>(undefined);
  const [paneModule, failed, requestPanes] = usePaneModule();
  const initialId = formats[0]?.id;

  const switchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = switchRef.current;
    if (!node || paneModule) return;
    node.addEventListener("pointerenter", requestPanes);
    node.addEventListener("focusin", requestPanes);
    return () => {
      node.removeEventListener("pointerenter", requestPanes);
      node.removeEventListener("focusin", requestPanes);
    };
  }, [paneModule, requestPanes]);

  function pane(format: FormatSwitchTab): ReactNode {
    if (format.id === initialId) return initialPane;
    if (paneModule) return <paneModule.FormatPane id={format.id} />;
    if (format.id !== active) return null;
    return <FormatPaneFrame id={format.id} file={format.file} busy={!failed} />;
  }

  function selectFormat(id: string) {
    requestPanes();
    setFramework(undefined);
    if (id === active) return;
    setActive(id);
  }

  function selectFramework(chip: FormatSwitchFramework) {
    requestPanes();
    if (chip.key === framework) return;
    setFramework(chip.key);
    setActive(chip.format);
  }

  return (
    <div ref={switchRef} className="vk-formats-switch">
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
        <div aria-hidden="true" inert className="vk-formats-sizer">
          {sizer}
        </div>
        {formats.map((format) => (
          <div
            key={format.id}
            {...tabPanelProps(FORMAT_SWITCH_ID, format.id, active)}
            className="vk-formats-pane"
          >
            {pane(format)}
          </div>
        ))}
      </div>
    </div>
  );
}
