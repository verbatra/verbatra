export type LandingFeatureId = "studio" | "handoff" | "extract" | "watch" | "types" | "doctor";

type LandingFeature = { readonly id: LandingFeatureId; readonly docsPath: string };

export const LANDING_FEATURES: ReadonlyArray<LandingFeature> = [
  { id: "studio", docsPath: "/docs/cli/studio" },
  { id: "handoff", docsPath: "/docs/cli/export" },
  { id: "extract", docsPath: "/docs/cli/extract" },
  { id: "watch", docsPath: "/docs/cli/watch" },
  { id: "types", docsPath: "/docs/cli/types" },
  { id: "doctor", docsPath: "/docs/cli/doctor" },
];
