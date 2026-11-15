import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { i18n } from "./i18n";
import {
  COMPARE_LAST_CHECKED,
  COMPARE_ROWS,
  COMPARE_TOOLS,
  compareCell,
  verdictMark,
} from "./landing-compare";
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
];

const COMPARE_CELL_REVISIONS: ReadonlyArray<CopyRevision> = [
  { date: "2026-10-15", hash: "902177bf643763a6041c4de579b581536e5f1f8706cf919c2985436b011403a5" },
  { date: "2026-10-15", hash: "bee5f991697639ddc4bd5ffefe029d3a89e4fae191018a4bfebab5d0643e4cf0" },
  { date: "2026-10-15", hash: "041550318b67e6bb3c515675eb0979859f0a3fd8c91c007470689d131425adf7" },
  { date: "2026-11-13", hash: "7625b217ddcbdf4d318942b503f2683905f6406813c94523b4d357dc3000803a" },
  { date: "2026-11-13", hash: "87aa29e8c91870b6b9258c1c5ef24fe144df8c5b00323fd904634ba92f69d020" },
  { date: "2026-11-13", hash: "a930464c3c847b0aa98082f909291f8e78e0cb56a42165be9dd5d8028e4b062c" },
  { date: "2026-11-13", hash: "a3c68428794e98f62778def8853c5a73c05f35a0c7a093e08ede41b6cc6eefa2" },
  { date: "2026-11-13", hash: "1482c5b53b85928e76cf8f69fb61bd676e8be04d253e5103f806f71edc5d5964" },
  { date: "2026-11-13", hash: "81e1cf5a8cb7a14c0432a29707d02b94b33b01b08be1130114ce3c67fdf4c034" },
];

function compareCellModel(): string {
  return JSON.stringify(
    COMPARE_ROWS.flatMap((row) =>
      COMPARE_TOOLS.map((tool) => {
        const cell = compareCell(row, tool);
        const urls = cell.urls.map((link) =>
          typeof link === "string" ? link : [link.page, link.anchors ?? null],
        );
        return cell.kind === "verdict"
          ? [row, tool, cell.kind, cell.verdict, verdictMark(cell.verdict), urls]
          : [row, tool, cell.kind, urls];
      }),
    ),
  );
}

function compareCellHash(): string {
  const hash = createHash("sha256");
  hash.update(`${compareCellModel()}\n`);
  for (const locale of i18n.languages) {
    const path = fileURLToPath(new URL(`../messages/${locale}.json`, import.meta.url));
    const catalog = JSON.parse(readFileSync(path, "utf8")) as {
      landing: { compare: { rows: unknown; verdicts: unknown } };
      compare: unknown;
    };
    const { rows, verdicts } = catalog.landing.compare;
    hash.update(
      `${locale}\n${JSON.stringify(rows)}\n${JSON.stringify(verdicts)}\n${JSON.stringify(catalog.compare)}\n`,
    );
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

describe("COMPARE_LAST_CHECKED", () => {
  it("pins the comparison cells and page copy to the day they were last checked", () => {
    expect(COMPARE_CELL_REVISIONS.at(-1)).toEqual({
      date: COMPARE_LAST_CHECKED,
      hash: compareCellHash(),
    });
  });
});
