import type { ReactNode } from "react";
import { StackIcon, StackIconSprite } from "@/components/stack-icons";
import { FORMAT_DISPLAY, SUPPORTED_FORMAT_IDS } from "@/lib/landing-facts";
import { STACK_FRAMEWORKS } from "@/lib/stack-formats";
import { FormatPane, FormatPaneSizer } from "./format-pane";
import type { FormatSwitchLabels } from "./format-switch";
import { FormatSwitch } from "./islands";

const ICON_PREFIX = "vk-formats-icon";
const ICON = 16;

export function FormatsDemo({ labels }: { labels: FormatSwitchLabels }): ReactNode {
  const [initial] = SUPPORTED_FORMAT_IDS;
  return (
    <>
      <StackIconSprite prefix={ICON_PREFIX} icons={STACK_FRAMEWORKS.map((item) => item.icon)} />
      <FormatSwitch
        labels={labels}
        frameworks={STACK_FRAMEWORKS.map(({ key, name, format, icon }) => ({
          key,
          name,
          format,
          icon: (
            <StackIcon
              prefix={ICON_PREFIX}
              icon={icon}
              size={ICON}
              className="vk-formats-chip-icon"
            />
          ),
        }))}
        formats={SUPPORTED_FORMAT_IDS.map((id) => ({ id, label: FORMAT_DISPLAY[id].label }))}
        initialPane={initial ? <FormatPane id={initial} /> : null}
        sizer={<FormatPaneSizer />}
      />
    </>
  );
}
