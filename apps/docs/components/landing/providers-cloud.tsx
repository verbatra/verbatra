import { SiAnthropic, SiDeepl, SiGooglegemini } from "@icons-pack/react-simple-icons";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { OpenAiIcon } from "./openai-icon";
import { SectionHead } from "./section-head";
import { type SwapLogo, SwapLogoCloud } from "./swap-logo-cloud";

const ICON_SIZE = 28;

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

export async function ProvidersCloud(): Promise<ReactNode> {
  const t = await getTranslations("landing.providers");
  return (
    <section className="vk-gutter vk-w-wide vk-rhythm-sm mx-auto">
      <SectionHead align="center" maxWidth="620px" title={t("heading")} lead={t("lead")} />
      <div className="mt-12">
        <SwapLogoCloud
          logos={PROVIDERS}
          visibleCount={4}
          label={t("marqueeLabel")}
          gridClassName="grid-cols-2 md:grid-cols-4"
        />
      </div>
    </section>
  );
}
