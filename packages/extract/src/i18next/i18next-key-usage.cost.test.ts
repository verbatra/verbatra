// biome-ignore-all lint/suspicious/noTemplateCurlyInString: the fixtures are source text under test, not templates
import { describe, expect, it, vi } from "vitest";
import type { FileExtraction } from "../extractor.js";
import { createI18nextExtractor } from "./i18next-extractor.js";

const counter = vi.hoisted(() => ({ reads: 0 }));

vi.mock("../scan/tokenize.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../scan/tokenize.js")>();
  return {
    ...original,
    advance: (...args: Parameters<typeof original.advance>) => {
      counter.reads += 1;
      return original.advance(...args);
    },
    charAt: (...args: Parameters<typeof original.charAt>) => {
      counter.reads += 1;
      return original.charAt(...args);
    },
  };
});

vi.mock("../scan/markup-source.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../scan/markup-source.js")>();
  return {
    ...original,
    tokenizeMarkupSource: (...args: Parameters<typeof original.tokenizeMarkupSource>) => {
      const scan = original.tokenizeMarkupSource(...args);
      const tokens = new Proxy([...scan.tokens], {
        get(target, property, receiver) {
          if (typeof property === "string" && /^\d+$/.test(property)) {
            counter.reads += 1;
          }
          return Reflect.get(target, property, receiver);
        },
      });
      return { ...scan, tokens };
    },
  };
});

const COMPONENT = [
  "export function Card() {",
  '  const { t } = useTranslation("common", { keyPrefix: "card" });',
  "  return (",
  '    <section className="card" title="it\'s here" aria-label=\'We "care"\'>',
  "      <h2>We're glad you're here. Don't worry, it's fine.</h2>",
  '      <Trans i18nKey="card.body" t={t}>Hello <b>{name}</b>, you\'ve got mail</Trans>',
  '      <Translation>{(tr) => <p>{tr("card.render")}</p>}</Translation>',
  '      <button type="button" onClick={() => save(t(`card.${mode}`))}>',
  '        {t("card.save", "Save")}',
  "      </button>",
  '      {items.map((item) => <Row key={item.id} label={t("card.row")} {...item} />)}',
  "    </section>",
  "  );",
  "}",
  "",
].join("\n");

const extractor = createI18nextExtractor();

function scan(components: number): { readonly reads: number; readonly result: FileExtraction } {
  counter.reads = 0;
  const result = extractor.extract({ path: "app.tsx", content: COMPONENT.repeat(components) });
  return { reads: counter.reads, result };
}

describe("i18next key usage: cost on a JSX-heavy file", () => {
  it("reads a bounded number of tokens and characters per character of a 200k-character file", () => {
    const components = Math.ceil(100_000 / COMPONENT.length);
    const half = scan(components);
    const full = scan(components * 2);
    const length = COMPONENT.length * components * 2;

    expect(length).toBeGreaterThanOrEqual(200_000);
    expect(full.result.truncated).toBeUndefined();
    expect(full.result.usage?.unresolved).toEqual([]);
    expect(full.result.usage?.references.length).toBeGreaterThan(components);
    expect(full.reads).toBeLessThan(length * 100);
    expect(full.reads).toBeLessThan(half.reads * 2.2);
  });
}, 60_000);
