export interface TmxLimits {
  readonly maxInputBytes: number;
  readonly maxUnitCount: number;
  readonly maxSegmentLength: number;
  readonly maxLanguagesPerUnit: number;
}

export const DEFAULT_TMX_LIMITS: TmxLimits = {
  maxInputBytes: 32 * 1024 * 1024,
  maxUnitCount: 200_000,
  maxSegmentLength: 64 * 1024,
  maxLanguagesPerUnit: 64,
};
