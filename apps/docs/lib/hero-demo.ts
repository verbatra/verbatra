export const CHECK_OUT_OF_SYNC = "out of sync (run verbatra translate to update)";
export const CHECK_IN_SYNC = "all locales in sync";

export const HERO_DEMO_COMMANDS: ReadonlyArray<string> = [
  "verbatra check",
  "verbatra translate",
  "verbatra check",
];

export const HERO_DEMO_OUTPUTS: Readonly<Record<number, ReadonlyArray<string>>> = {
  0: [
    "  de: 1 missing, 1 stale, 6 up-to-date (out of sync)",
    "  es: 1 missing, 1 stale, 6 up-to-date (out of sync)",
    "  fr: 1 missing, 1 stale, 6 up-to-date (out of sync)",
    CHECK_OUT_OF_SYNC,
  ],
  1: [
    "  de: 2 translated, 6 unchanged, 187 tokens (164 in, 23 out)",
    "  es: 2 translated, 6 unchanged, 191 tokens (165 in, 26 out)",
    "  fr: 2 translated, 6 unchanged, 193 tokens (166 in, 27 out)",
    "  total: 571 tokens (495 in, 76 out)",
    "3 succeeded, 0 partial, 0 failed",
  ],
  2: [
    "  de: 0 missing, 0 stale, 8 up-to-date (in sync)",
    "  es: 0 missing, 0 stale, 8 up-to-date (in sync)",
    "  fr: 0 missing, 0 stale, 8 up-to-date (in sync)",
    CHECK_IN_SYNC,
  ],
};

export const HERO_DEMO_HIGHLIGHT = CHECK_IN_SYNC;
