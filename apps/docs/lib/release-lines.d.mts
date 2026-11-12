export type VersionPackage = "cli" | "studio" | "mcp";

export type PackageReleases = { readonly lines: ReadonlyArray<string> };

export type ReleaseLines = Readonly<Record<VersionPackage, PackageReleases>>;

export type PlacedBadge = {
  readonly package: VersionPackage;
  readonly line: string;
  readonly patch: number;
};

export declare const VERSION_PACKAGES: ReadonlyArray<VersionPackage>;
export declare const PACKAGE_LINE: Readonly<Record<string, VersionPackage>>;
export declare const VERSION_STORAGE_KEY: string;
export declare const DEFAULT_BADGE_PACKAGE: string;

export declare function parseVersion(version: string): [number, number, number];
export declare function parseLine(line: string): [number, number];
export declare function isLine(value: unknown): value is string;
export declare function lineOf(version: string): string;
export declare function compareLines(left: string, right: string): number;
export declare function nextLine(line: string): string;
export declare function changelogVersions(changelog: string): string[];
export declare function releaseLines(versions: ReadonlyArray<string>): string[];
export declare function packageReleases(changelog: string): PackageReleases;
export declare function placeableLines(releases: PackageReleases): string[];
export declare function badgeNewerThanLine(version: string, line: string): boolean;
export declare function placeBadge(
  pkg: string | undefined,
  version: string,
  releases: ReleaseLines,
): PlacedBadge | undefined;
export declare function versionPillCss(releases: ReleaseLines): string;
