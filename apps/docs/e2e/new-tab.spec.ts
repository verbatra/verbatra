import { expect, test } from "playwright/test";
import de from "../messages/de.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };
import es from "../messages/es.json" with { type: "json" };
import fr from "../messages/fr.json" with { type: "json" };
import { homeUrl, LOCALES, pageUrl } from "./support";

const NEW_TAB = {
  en: en.landing.openSource.newTab,
  de: de.landing.openSource.newTab,
  es: es.landing.openSource.newTab,
  fr: fr.landing.openSource.newTab,
} as const;

for (const locale of LOCALES) {
  for (const url of [homeUrl(locale), pageUrl(locale, "/compare")]) {
    for (const width of [375, 1440]) {
      test(`names every new-tab link on ${url} as opening a new tab at ${width}px`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(url);
        await page.locator("details").evaluateAll((items) => {
          for (const item of items) if (item instanceof HTMLDetailsElement) item.open = true;
        });
        const links = page.locator('a[target="_blank"]');
        const count = await links.count();
        expect(count).toBeGreaterThan(0);
        for (let index = 0; index < count; index += 1) {
          const link = links.nth(index);
          if (!(await link.isVisible())) continue;
          const href = (await link.getAttribute("href")) ?? "";
          await expect.soft(link, href).toHaveAccessibleName(new RegExp(literal(NEW_TAB[locale])), {
            timeout: 2000,
          });
        }
      });
    }
  }
}

function literal(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
