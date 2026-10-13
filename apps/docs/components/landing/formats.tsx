import type { ReactNode } from "react";
import { FORMAT_SAMPLES } from "@/lib/format-samples";
import { FORMAT_DISPLAY, SUPPORTED_FORMAT_IDS } from "@/lib/landing-facts";
import { STACK_FRAMEWORKS } from "@/lib/stack-formats";
import { FormatPane, FormatPaneSizer } from "./format-pane";
import type { FormatSwitchLabels } from "./format-switch";
import { FormatSwitch } from "./islands";

export function FormatsDemo({ labels }: { labels: FormatSwitchLabels }): ReactNode {
  const [initial] = SUPPORTED_FORMAT_IDS;
  return (
    <FormatSwitch
      labels={labels}
      frameworks={STACK_FRAMEWORKS.map(({ key, name, format }) => ({ key, name, format }))}
      formats={SUPPORTED_FORMAT_IDS.map((id) => ({
        id,
        label: FORMAT_DISPLAY[id].label,
        file: FORMAT_SAMPLES[id].file,
      }))}
      initialPane={initial ? <FormatPane id={initial} /> : null}
      sizer={<FormatPaneSizer />}
    />
  );
}
