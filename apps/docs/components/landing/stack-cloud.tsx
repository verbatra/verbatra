import {
  SiAngular,
  SiAnthropic,
  SiAstro,
  SiDeepl,
  SiFlutter,
  SiGooglegemini,
  SiNextdotjs,
  SiNodedotjs,
  SiNuxt,
  SiReact,
  SiSvelte,
  SiVuedotjs,
} from "@icons-pack/react-simple-icons";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { OpenAiIcon } from "./openai-icon";
import { Section } from "./section";
import { SectionHead } from "./section-head";
import { type SwapLogo, SwapLogoCloud } from "./swap-logo-cloud";

const ICON_SIZE = 28;

const FRAMEWORKS: ReadonlyArray<SwapLogo> = [
  {
    key: "react",
    name: "React",
    icon: <SiReact size={ICON_SIZE} color="currentColor" aria-hidden="true" />,
  },
  {
    key: "next",
    name: "Next.js",
    icon: <SiNextdotjs size={ICON_SIZE} color="currentColor" aria-hidden="true" />,
  },
  {
    key: "vue",
    name: "Vue",
    icon: <SiVuedotjs size={ICON_SIZE} color="currentColor" aria-hidden="true" />,
  },
  {
    key: "nuxt",
    name: "Nuxt",
    icon: <SiNuxt size={ICON_SIZE} color="currentColor" aria-hidden="true" />,
  },
  {
    key: "angular",
    name: "Angular",
    icon: <SiAngular size={ICON_SIZE} color="currentColor" aria-hidden="true" />,
  },
  {
    key: "node",
    name: "Node.js",
    icon: <SiNodedotjs size={ICON_SIZE} color="currentColor" aria-hidden="true" />,
  },
  {
    key: "svelte",
    name: "SvelteKit",
    icon: <SiSvelte size={ICON_SIZE} color="currentColor" aria-hidden="true" />,
  },
  {
    key: "astro",
    name: "Astro",
    icon: <SiAstro size={ICON_SIZE} color="currentColor" aria-hidden="true" />,
  },
  {
    key: "react-native",
    name: "React Native",
    icon: <SiReact size={ICON_SIZE} color="currentColor" aria-hidden="true" />,
  },
  {
    key: "flutter",
    name: "Flutter",
    icon: <SiFlutter size={ICON_SIZE} color="currentColor" aria-hidden="true" />,
  },
];

const PROVIDERS: ReadonlyArray<SwapLogo> = [
  {
    key: "anthropic",
    name: "Anthropic",
    icon: <SiAnthropic size={ICON_SIZE} color="currentColor" aria-hidden="true" />,
  },
  { key: "openai", name: "OpenAI", icon: <OpenAiIcon size={ICON_SIZE} /> },
  {
    key: "gemini",
    name: "Gemini",
    icon: <SiGooglegemini size={ICON_SIZE} color="currentColor" aria-hidden="true" />,
  },
  {
    key: "deepl",
    name: "DeepL",
    icon: <SiDeepl size={ICON_SIZE} color="currentColor" aria-hidden="true" />,
  },
];

function RowHead({ title, note }: { title: string; note: string }): ReactNode {
  return (
    <div className="flex flex-col gap-1 md:flex-row md:items-baseline md:justify-between md:gap-8">
      <h3
        className="font-semibold text-fd-foreground"
        style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-h3)" }}
      >
        {title}
      </h3>
      <p className="max-w-[56ch] text-sm leading-relaxed text-fd-muted-foreground">{note}</p>
    </div>
  );
}

export async function StackCloud(): Promise<ReactNode> {
  const t = await getTranslations("landing.stack");

  return (
    <Section width="wide" rhythm="md">
      <SectionHead title={t("heading")} lead={t("lead")} />

      <div className="mt-10 border-t border-fd-border pt-8">
        <RowHead title={t("formats.title")} note={t("formats.note")} />
        <div className="mt-8">
          <SwapLogoCloud
            logos={FRAMEWORKS}
            visibleCount={5}
            intervalMs={3000}
            label={t("formats.marqueeLabel")}
            gridClassName="grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
          />
        </div>
      </div>

      <div className="mt-10 border-t border-fd-border pt-8">
        <RowHead title={t("providers.title")} note={t("providers.note")} />
        <div className="mt-8">
          <SwapLogoCloud
            logos={PROVIDERS}
            visibleCount={4}
            label={t("providers.marqueeLabel")}
            gridClassName="grid-cols-2 sm:grid-cols-4"
          />
        </div>
      </div>
    </Section>
  );
}
