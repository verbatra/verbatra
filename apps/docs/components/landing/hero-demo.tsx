"use client";

import Image from "next/image";
import { type ReactNode, useState } from "react";
import { TabList, tabId, tabPanelId } from "@/components/ui/tabs";
import { HERO_DEMO_COMMANDS, HERO_DEMO_HIGHLIGHT, HERO_DEMO_OUTPUTS } from "@/lib/hero-demo";
import { cn } from "@/lib/utils";
import { Terminal } from "./terminal";

const DEMO_ID = "hero-demo";
const PANELS = ["cli", "studio"] as const;
type Panel = (typeof PANELS)[number];

const STUDIO_SHOT = {
  src: "/screenshots/studio-translations-dark.webp",
  width: 2880,
  height: 2360,
};

const TAB_CLASS = "rounded-md px-2.5 py-1 font-mono text-xs transition-colors";

export type HeroDemoLabels = {
  tablist: string;
  cli: string;
  studio: string;
  studioAlt: string;
  session: string;
  captionCli: string;
  captionStudio: string;
};

function panelProps(panel: Panel, active: Panel) {
  const hidden = panel !== active;
  return {
    id: tabPanelId(DEMO_ID, panel),
    role: "tabpanel",
    "aria-labelledby": tabId(DEMO_ID, panel),
    inert: hidden,
    tabIndex: hidden ? -1 : 0,
  } as const;
}

export function HeroDemo({ labels }: { labels: HeroDemoLabels }): ReactNode {
  const [active, setActive] = useState<Panel>("cli");
  const [studioSeen, setStudioSeen] = useState(false);

  function select(id: string) {
    const panel = id as Panel;
    setActive(panel);
    if (panel === "studio") setStudioSeen(true);
  }

  return (
    <figure className="not-prose m-0">
      <div
        className="overflow-hidden rounded-xl border border-fd-border text-left"
        style={{ background: "var(--v-void)", boxShadow: "var(--shadow-panel)" }}
      >
        <div className="flex items-center gap-3 border-b border-fd-border px-2 py-1.5">
          <TabList
            tabs={PANELS.map((id) => ({ id, label: labels[id] }))}
            active={active}
            onSelect={select}
            ariaLabel={labels.tablist}
            className="flex gap-1"
            tabClassName={TAB_CLASS}
            variant="pill"
            idPrefix={DEMO_ID}
          />
        </div>
        <div className="relative grid">
          <div
            {...panelProps("cli", active)}
            className={cn("col-start-1 row-start-1 min-w-0", active !== "cli" && "invisible")}
          >
            <Terminal
              commands={HERO_DEMO_COMMANDS}
              outputs={HERO_DEMO_OUTPUTS}
              sessionLabel={labels.session}
              highlight={HERO_DEMO_HIGHLIGHT}
              loop={false}
              typingSpeed={38}
              initialDelay={450}
              delayBetweenCommands={700}
              fitContent
              bare
            />
          </div>
          <div
            {...panelProps("studio", active)}
            className={cn("absolute inset-0 overflow-hidden", active !== "studio" && "invisible")}
          >
            {studioSeen ? (
              <Image
                src={STUDIO_SHOT.src}
                alt={labels.studioAlt}
                width={STUDIO_SHOT.width}
                height={STUDIO_SHOT.height}
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="h-full w-full object-cover object-left-top"
              />
            ) : null}
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-[13px] leading-relaxed text-[color:var(--text-faint)]">
        {active === "cli" ? labels.captionCli : labels.captionStudio}
      </figcaption>
    </figure>
  );
}
