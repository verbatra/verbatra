"use client";

import { type ReactNode, useState } from "react";
import { TabList, tabPanelProps } from "@/components/ui/tabs";
import { useHydrated } from "@/lib/use-hydrated";

type FlowTab = { readonly id: string; readonly label: string };

export function FlowTabs({
  idPrefix,
  labelledBy,
  tabs,
  panels,
}: {
  idPrefix: string;
  labelledBy: string;
  tabs: ReadonlyArray<FlowTab>;
  panels: ReadonlyArray<ReactNode>;
}): ReactNode {
  const hydrated = useHydrated();
  const [active, setActive] = useState(tabs[0]?.id ?? "");

  return (
    <div className="vk-flow-tabs">
      <TabList
        tabs={tabs}
        active={active}
        onSelect={setActive}
        ariaLabelledBy={labelledBy}
        variant="segmented"
        idPrefix={idPrefix}
        className="vk-flow-tabs-list"
      />
      {tabs.map((tab, index) => {
        const panel = tabPanelProps(idPrefix, tab.id, active);
        return (
          <div
            key={tab.id}
            {...panel}
            inert={hydrated && panel.inert}
            className="vk-flow-tabs-panel"
          >
            {panels[index]}
          </div>
        );
      })}
    </div>
  );
}
