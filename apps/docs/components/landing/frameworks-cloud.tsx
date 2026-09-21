import {
  SiAngular,
  SiAstro,
  SiFlutter,
  SiNextdotjs,
  SiNodedotjs,
  SiNuxt,
  SiReact,
  SiSvelte,
  SiVuedotjs,
} from "@icons-pack/react-simple-icons";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
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

export async function FrameworksCloud(): Promise<ReactNode> {
  const t = await getTranslations("landing.compat");
  return (
    <section className="vk-gutter vk-w-wide vk-rhythm-md mx-auto">
      <SectionHead align="center" maxWidth="620px" title={t("heading")} lead={t("body")} />
      <div className="mt-12">
        <SwapLogoCloud
          logos={FRAMEWORKS}
          visibleCount={6}
          intervalMs={3000}
          label={t("labelFrameworks")}
          gridClassName="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
        />
      </div>
    </section>
  );
}
