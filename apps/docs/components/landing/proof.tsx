import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { GATE_CLI_COMMAND, GATE_REFUSAL_LINE } from "@/lib/gate-demo";
import { HOW_COMMANDS, HOW_LINE_DELAY_MS, HOW_OUTPUTS } from "@/lib/how-steps";
import { HOW_STEP_KEYS, sectionNumber } from "@/lib/landing-sections";
import { HowReplay } from "./how-replay";
import { Section } from "./section";
import { SectionHead } from "./section-head";

export async function Proof(): Promise<ReactNode> {
  const tInstall = await getTranslations("landing.install");
  const tHow = await getTranslations("landing.how");
  const tTerminal = await getTranslations("landing.terminal");

  return (
    <Section width="wide" rhythm="md" id="how">
      <SectionHead
        title={tHow("heading")}
        step={{ number: sectionNumber("how"), label: tHow("eyebrow") }}
        reveal
      />
      <HowReplay
        terminal={{
          commands: HOW_COMMANDS,
          outputs: HOW_OUTPUTS,
          title: GATE_CLI_COMMAND,
          sessionLabel: tTerminal("sessionLabel"),
          loop: false,
          typingSpeed: 32,
          lineDelay: HOW_LINE_DELAY_MS,
          initialDelay: 700,
          highlight: GATE_REFUSAL_LINE,
          fitContent: true,
          wrap: true,
          headerAction: (
            <CopyButton
              text={GATE_CLI_COMMAND}
              label={tInstall("copyCommand", { command: GATE_CLI_COMMAND })}
              location="how"
            />
          ),
        }}
        steps={HOW_STEP_KEYS.map((key) => ({
          key,
          title: tHow(`steps.${key}.title`),
          body: tHow(`steps.${key}.body`),
        }))}
      />
    </Section>
  );
}
