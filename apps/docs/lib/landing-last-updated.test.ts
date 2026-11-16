import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { i18n } from "./i18n";
import {
  COMPARISON_LAST_CHECKED,
  COMPARISON_ROWS,
  COMPARISON_TOOLS,
  comparisonCell,
} from "./landing-comparison";
import { LANDING_LAST_UPDATED } from "./site";

type CopyRevision = { readonly date: string; readonly hash: string };

const COPY_REVISIONS: ReadonlyArray<CopyRevision> = [
  { date: "2026-10-16", hash: "70c39bcbbb1fd32405b5c2c58a507dbe8790ec2de962d42a755753ead613b90a" },
  { date: "2026-10-17", hash: "629113669eeeee0c43172185a7e775e2e94002043ee0072ee4dfc75002aa03e9" },
  { date: "2026-10-26", hash: "86da6b689fa26ac25c89d7f2f8c27e7fa8e5f490897218736b410691d8a8dd4c" },
  { date: "2026-10-27", hash: "7f7867549139c7167fe83ba98f52bfe3fbbc854b510ba105d25fee4acdb64529" },
  { date: "2026-10-27", hash: "e1b551a807bf9177fdd187c6afc34e193929d8bf031f6fc8ce7375d87055514c" },
  { date: "2026-11-12", hash: "cdb65b9c37cbaadadeac17d4d31d79da877003481cb91f9527b313e8592d83da" },
  { date: "2026-11-12", hash: "b183c7d52df0b91df4f38af443669f2c64a845ec7bd9eeeb1f3bb04e6a21bcfa" },
  { date: "2026-11-13", hash: "f527cf8053b7f68c0dbda4dfd91ff82f10d1393fa75258e2a29d3ab76c4f8c2c" },
  { date: "2026-11-13", hash: "f190ad2202ec41ae8d259b1c82282f59e903cb58b9af1264e9790ac015077415" },
  { date: "2026-11-13", hash: "04a1415b315d9441586872ea0790abb02aea232ef82e9396b57f0ac87f1c173d" },
  { date: "2026-11-13", hash: "d7e413230f12d187a2d79db95483f9caa4b4aa06cbf97520bfcad74c10ebbcc6" },
  { date: "2026-11-14", hash: "7be0a0d421cdda682fca673bcb8d7bc7320656cb2785f0e86e6226bb80c352e0" },
  { date: "2026-11-14", hash: "a6bd7c2114cfa45cbe8b2ff3f7b361f92b8bb4a2d2591dbc658ab7bf0892e0b1" },
  { date: "2026-11-14", hash: "a0f121733165fd6f1f7920c1bb0f1bb0fc599e07d9fb8c878358a09e1e745e46" },
  { date: "2026-11-14", hash: "84fd558af3975d0c923183c6b13f9974dc38470f02d6ab5ccaaa59c88b274ba8" },
  { date: "2026-11-14", hash: "2615469acb19f18fe5a3108645e647c46a5e9fedbe4022e42499d6345c0d8cb8" },
  { date: "2026-11-14", hash: "f402a8ba481322e5362b5fd7e2d886b7c0506170362e6bac7c74ecbcf2cdeda8" },
  { date: "2026-11-14", hash: "3fb857fa98e61e89fe24402162e2ce7949e9a47025b19441514ad0e5ec1b8acc" },
  { date: "2026-11-14", hash: "707bd006b521e6dfa6af64b7922f404abcb5deb51f93bcbf8835bcaf26d580d4" },
  { date: "2026-11-14", hash: "96bbdacbc49339a452ccbf8be491dde22028f9bc342301f8c6c0e0af874a182d" },
  { date: "2026-11-14", hash: "ccd7060d6e41666f57aee1d5bd8ece9d59a67560412ef1a5f4d44e13215ce649" },
  { date: "2026-11-15", hash: "eb51f04d10b7abe1c45979e5f0d61920df4630413e225713cef9ba51984442b9" },
  { date: "2026-11-15", hash: "16fb0e38ac5ab159b0a98d4b742c7d85973f2aef4d635d8c2c68285746881c97" },
  { date: "2026-11-15", hash: "8956fafcbe8c34335175900a28132992e5b7cbb05caff59bace9a4299cfb596c" },
  { date: "2026-11-15", hash: "405fe62ac5a04a0c3ba73e1fc7405e088366a27038bbfc7b88b5af59937d924e" },
  { date: "2026-11-15", hash: "276cb90e6c3325c5e0b137b8db98b9d275b034dbb90615f7f108f7c135999878" },
  { date: "2026-11-16", hash: "21f67aacce16fb182ccbca2498afc8ea7fcf9e4b07ce5ed1784692baecb44a2d" },
  { date: "2026-11-16", hash: "692a39c7e814f109f3e7983d1f5da25f50c79655491dbe942fcbc36e0058dd0d" },
  { date: "2026-11-16", hash: "71fc8b163eb18d8f0e915ca5030ff130c85ab875f709a1df612892380b44aff9" },
  { date: "2026-11-16", hash: "c9a3a0f8a84edec7f8c540944d2fa66e8e405b6c03913061812d9e400d2d0eb4" },
  { date: "2026-11-16", hash: "5a1da777dd24e39233dc150c7472245e213d0e93af2f69643148c565076027ea" },
];

const COMPARISON_CELL_REVISIONS: ReadonlyArray<CopyRevision> = [
  { date: "2026-11-16", hash: "2621f0c00ad6c6208783caea9fb1b74992dfaec930a2d28093e2f25a2829f89a" },
  { date: "2026-11-16", hash: "c1ec0a34c5f6300281e017bf4cafc489356602cf8c6ea2ddf98ca0cae6e4d10e" },
  { date: "2026-11-16", hash: "99395573dea5431531a0f7b8f7baebc6b616e5205502a8cfe05293a4b56e8cdb" },
];

function comparisonCellHash(): string {
  const hash = createHash("sha256");
  hash.update(
    `${JSON.stringify(
      COMPARISON_ROWS.flatMap((row) =>
        COMPARISON_TOOLS.map((tool) => [row, tool, comparisonCell(row, tool)]),
      ),
    )}\n`,
  );
  for (const locale of i18n.languages) {
    const path = fileURLToPath(new URL(`../messages/${locale}.json`, import.meta.url));
    const catalog = JSON.parse(readFileSync(path, "utf8")) as {
      landing: { comparison: { rows: unknown; verdicts: unknown } };
    };
    const { rows, verdicts } = catalog.landing.comparison;
    hash.update(`${locale}\n${JSON.stringify(rows)}\n${JSON.stringify(verdicts)}\n`);
  }
  return hash.digest("hex");
}

function landingCopyHash(): string {
  const hash = createHash("sha256");
  for (const locale of i18n.languages) {
    const path = fileURLToPath(new URL(`../messages/${locale}.json`, import.meta.url));
    const catalog = JSON.parse(readFileSync(path, "utf8")) as { landing: unknown };
    hash.update(`${locale}\n${JSON.stringify(catalog.landing)}\n`);
  }
  return hash.digest("hex");
}

describe("LANDING_LAST_UPDATED", () => {
  it("is an ISO date", () => {
    expect(LANDING_LAST_UPDATED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(`${LANDING_LAST_UPDATED}T00:00:00Z`).toISOString().slice(0, 10)).toBe(
      LANDING_LAST_UPDATED,
    );
  });

  it("pins the current landing copy to LANDING_LAST_UPDATED as the newest revision", () => {
    expect(COPY_REVISIONS.at(-1)).toEqual({ date: LANDING_LAST_UPDATED, hash: landingCopyHash() });
  });
});

describe("COMPARISON_LAST_CHECKED", () => {
  it("pins the landing comparison cells, sources and row labels to the day they were last checked", () => {
    expect(COMPARISON_CELL_REVISIONS.at(-1)).toEqual({
      date: COMPARISON_LAST_CHECKED,
      hash: comparisonCellHash(),
    });
  });
});
