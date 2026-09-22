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

const ICON_SIZE = 18;

type Logo = { key: string; name: string; icon: ReactNode };

const FRAMEWORKS: ReadonlyArray<Logo> = [
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

const PROVIDERS: ReadonlyArray<Logo> = [
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

function LogoRow({
  label,
  listLabel,
  logos,
}: {
  label: string;
  listLabel: string;
  logos: ReadonlyArray<Logo>;
}): ReactNode {
  return (
    <div className="grid gap-x-6 gap-y-3 sm:grid-cols-[10.5rem_1fr] sm:items-center">
      <span className="font-mono text-xs lowercase tracking-[0.12em] text-[color:var(--text-faint)]">
        {label}
      </span>
      <ul aria-label={listLabel} className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {logos.map((logo) => (
          <li
            key={logo.key}
            className="inline-flex items-center gap-2 text-[13px] font-medium text-fd-muted-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            <span className="text-[color:var(--accent)]">{logo.icon}</span>
            {logo.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

export async function StackStrip(): Promise<ReactNode> {
  const t = await getTranslations("landing.stack");
  return (
    <section aria-label={t("label")} className="border-b border-fd-border">
      <div className="vk-gutter vk-w-wide mx-auto grid gap-5 py-6">
        <LogoRow
          label={t("formats.label")}
          listLabel={t("formats.marqueeLabel")}
          logos={FRAMEWORKS}
        />
        <LogoRow
          label={t("providers.label")}
          listLabel={t("providers.marqueeLabel")}
          logos={PROVIDERS}
        />
      </div>
    </section>
  );
}
