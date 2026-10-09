import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { CHECK_CLI_COMMAND } from "@/lib/check-demo";
import { GATE_REFUSAL_LINE } from "@/lib/gate-demo";
import {
  HOW_COMMANDS,
  HOW_LINE_DELAY_MS,
  HOW_OUTPUTS,
  HOW_TITLE,
  howStepCopy,
} from "@/lib/how-steps";
import { HowReplay } from "./how-replay";
import { Section } from "./section";
import { SectionHead } from "./section-head";

export async function Proof(): Promise<ReactNode> {
  const tInstall = await getTranslations("landing.install");
  const tHow = await getTranslations("landing.how");
  const tTerminal = await getTranslations("landing.terminal");

  return (
    <Section width="wide" rhythm="md" id="how">
      <SectionHead title={tHow("heading")} lead={tHow("lead")} reveal />
      <HowReplay
        terminal={{
          commands: HOW_COMMANDS,
          outputs: HOW_OUTPUTS,
          title: HOW_TITLE,
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
              text={CHECK_CLI_COMMAND}
              label={tInstall("copyCommand", { command: CHECK_CLI_COMMAND })}
              location="how"
            />
          ),
        }}
        steps={howStepCopy(tHow)}
      />
    </Section>
  );
}
