import {
  SiAnthropic,
  SiDeepl,
  SiGooglegemini,
  SiGoogletranslate,
  SiOllama,
} from "@icons-pack/react-simple-icons";
import type { ProviderId } from "@verbatra/sdk";
import { getLocale, getTranslations } from "next-intl/server";
import type { CSSProperties, ReactNode } from "react";
import { type Locale, localizedPath } from "@/lib/i18n";
import { OpenAiIcon } from "./openai-icon";
import { Reveal } from "./reveal";
import { Section } from "./section";

const ICON = 32;
const SI = { size: ICON, color: "currentColor", "aria-hidden": true } as const;

type KindKey = "anthropic" | "openai" | "gemini" | "deepl" | "googleTranslate" | "openaiCompatible";

type Provider = { id: ProviderId; kind: KindKey; name: string; icon: ReactNode };

const PROVIDERS: ReadonlyArray<Provider> = [
  { id: "anthropic", kind: "anthropic", name: "Anthropic", icon: <SiAnthropic {...SI} /> },
  { id: "openai", kind: "openai", name: "OpenAI", icon: <OpenAiIcon size={ICON} /> },
  { id: "gemini", kind: "gemini", name: "Gemini", icon: <SiGooglegemini {...SI} /> },
  { id: "deepl", kind: "deepl", name: "DeepL", icon: <SiDeepl {...SI} /> },
  {
    id: "google-translate",
    kind: "googleTranslate",
    name: "Google Translate",
    icon: <SiGoogletranslate {...SI} />,
  },
  {
    id: "openai-compatible",
    kind: "openaiCompatible",
    name: "OpenAI-compatible",
    icon: <SiOllama {...SI} />,
  },
];

export async function Providers(): Promise<ReactNode> {
  const t = await getTranslations("landing.providers");
  const locale = (await getLocale()) as Locale;
  const href = localizedPath(locale, "/docs/providers");

  return (
    <Section width="wide" rhythm="lg" id="providers">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] lg:items-center lg:gap-14">
        <Reveal>
          <h2
            className="max-w-[13ch] font-semibold text-fd-foreground"
            style={{
              fontFamily: "var(--font-display)",
              letterSpacing: "-0.03em",
              fontSize: "clamp(2rem, 4.2vw, 3.4rem)",
              lineHeight: 1,
              textWrap: "balance",
            }}
          >
            {t("heading")}
          </h2>
          <p className="mt-5 max-w-[44ch] text-[17px] leading-relaxed text-fd-muted-foreground">
            {t("lead")}
          </p>
          <p className="mt-3.5 text-sm text-[color:var(--text-faint)]">{t("hint")}</p>
        </Reveal>
        <Reveal order={1} className="vk-deck">
          {PROVIDERS.map((provider, index) => (
            <a
              key={provider.id}
              href={href}
              className="vk-card"
              style={{ "--i": index } as CSSProperties}
              aria-label={`${provider.name}, ${t(`kinds.${provider.kind}`)}`}
            >
              {provider.icon}
              <span className="vk-card-name">{provider.name}</span>
              <span className="vk-card-kind">{t(`kinds.${provider.kind}`)}</span>
              <span className="vk-card-id">{provider.id}</span>
            </a>
          ))}
        </Reveal>
      </div>
    </Section>
  );
}
