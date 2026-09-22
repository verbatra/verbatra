import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { type Locale, localizedPath } from "@/lib/i18n";
import { CommandBox } from "./command-box";
import { NPM_CLI } from "./links";
import { Reveal } from "./reveal";

const INSTALL_COMMAND = "npm i -D @verbatra/cli";
const CLI_TOKEN = "@verbatra/cli";

const CLOSE_BACKGROUND = [
  "radial-gradient(ellipse 62% 72% at 50% 104%, color-mix(in srgb, var(--v-purple) 58%, transparent), transparent 70%)",
  "var(--surface-bg)",
].join(", ");

const CLOSE_BORDER = "color-mix(in srgb, var(--v-glow) 16%, var(--border-default))";

export async function FinalCta(): Promise<ReactNode> {
  const t = await getTranslations("landing.finalClose");
  const tInstall = await getTranslations("landing.install");
  const locale = (await getLocale()) as Locale;
  return (
    <section className="vk-pad-top-lg px-2 pb-3 md:px-3">
      <Reveal
        className="relative grid justify-items-center overflow-hidden rounded-xl border px-6 py-[92px] text-center md:px-10"
        style={{ background: CLOSE_BACKGROUND, borderColor: CLOSE_BORDER }}
      >
        <h2
          className="max-w-[15ch] font-semibold text-fd-foreground"
          style={{
            fontFamily: "var(--font-display)",
            letterSpacing: "-0.03em",
            fontSize: "var(--text-h2)",
            lineHeight: 1,
            textWrap: "balance",
          }}
        >
          {t("heading")}
        </h2>
        <div className="mt-8 flex w-full justify-center">
          <div className="w-full max-w-[28rem]">
            <CommandBox
              command={INSTALL_COMMAND}
              label={tInstall("copyAria")}
              link={{ token: CLI_TOKEN, href: NPM_CLI }}
            />
          </div>
        </div>
        <a
          href={localizedPath(locale, "/docs")}
          className="mt-6 inline-flex min-h-11 items-center font-medium text-[color:var(--accent)] underline decoration-[color:color-mix(in_srgb,var(--v-glow)_40%,transparent)] underline-offset-4 transition-colors hover:decoration-[color:var(--accent)]"
        >
          {t("docs")}
        </a>
      </Reveal>
    </section>
  );
}
