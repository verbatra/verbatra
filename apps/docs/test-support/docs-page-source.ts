import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { i18n, type Locale } from "@/lib/i18n";

const CONTENT = fileURLToPath(new URL("../content/docs", import.meta.url));

export function docsPageSource(page: string, locale: Locale): string {
  const suffix = locale === i18n.defaultLanguage ? "" : `.${locale}`;
  const slug = page.replace(/^\/docs\/?/, "");
  const wanted =
    slug === "" ? [`index${suffix}.mdx`] : [`${slug}${suffix}.mdx`, `${slug}/index${suffix}.mdx`];
  const file = readdirSync(CONTENT, { recursive: true, encoding: "utf8" }).find((entry) =>
    wanted.includes(entry.replace(/\([^)]+\)\//g, "")),
  );
  if (!file) throw new Error(`no ${wanted.join(" or ")} under ${CONTENT}`);
  return readFileSync(join(CONTENT, file), "utf8");
}
