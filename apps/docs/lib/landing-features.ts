export type LandingFeatureId = "extract" | "types" | "doctor" | "watch" | "handoff" | "studio";

type LandingFeature = {
  readonly id: LandingFeatureId;
  readonly command: string;
  readonly docsPath: string;
};

export const LANDING_FEATURES: ReadonlyArray<LandingFeature> = [
  { id: "extract", command: "verbatra extract", docsPath: "/docs/cli/extract" },
  { id: "types", command: "verbatra types", docsPath: "/docs/cli/types" },
  { id: "doctor", command: "verbatra doctor", docsPath: "/docs/cli/doctor" },
  { id: "watch", command: "verbatra watch", docsPath: "/docs/cli/watch" },
  { id: "handoff", command: "verbatra export", docsPath: "/docs/cli/export" },
  { id: "studio", command: "verbatra studio", docsPath: "/docs/cli/studio" },
];
