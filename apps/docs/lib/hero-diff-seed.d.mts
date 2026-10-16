export interface HeroDiffEntry {
  readonly key: string;
  readonly value: string;
}

export declare const HERO_DIFF_FORMAT: "next-intl-json";

export declare const HERO_DIFF_SOURCE_LOCALE: string;

export declare const HERO_DIFF_TARGET_LOCALE: string;

export declare const HERO_DIFF_SOURCE_FILE: string;

export declare const HERO_DIFF_TARGET_FILE: string;

export declare const HERO_DIFF_SOURCE: ReadonlyArray<HeroDiffEntry>;

export declare const HERO_DIFF_TARGET_SYNCED: ReadonlyArray<HeroDiffEntry>;

export declare const HERO_DIFF_TARGET_FILLED: ReadonlyArray<HeroDiffEntry>;

export declare function heroDiffLine(entry: HeroDiffEntry): string;
