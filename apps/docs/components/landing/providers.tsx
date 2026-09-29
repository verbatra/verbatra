import {
  SiAnthropic,
  SiDeepl,
  SiGooglegemini,
  SiGoogletranslate,
  SiLibretranslate,
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

type KindKey =
  | "anthropic"
  | "openai"
  | "gemini"
  | "deepl"
  | "googleTranslate"
  | "openaiCompatible"
  | "libretranslate";

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
  {
    id: "libretranslate",
    kind: "libretranslate",
    name: "LibreTranslate",
    icon: <SiLibretranslate {...SI} />,
  },
];

export async function Providers(): Promise<ReactNode> {
  const t = await getTranslations("landing.providers");
  const locale = (await getLocale()) as Locale;
  const href = localizedPath(locale, "/docs/providers");

  return (
    <Section width="wide" rhythm="lg" id="providers">
      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] xl:items-center xl:gap-14">
        <div>
          <h2 className="vk-h2 max-w-[13ch]">{t("heading")}</h2>
          <p className="vk-lead mt-5 max-w-[44ch]">{t("lead")}</p>
          <p className="mt-3.5 hidden text-sm text-[color:var(--text-faint)] lg:pointer-fine:block">
            {t("hint")}
          </p>
        </div>
        <Reveal order={1} className="vk-deck" style={{ "--n": PROVIDERS.length } as CSSProperties}>
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
