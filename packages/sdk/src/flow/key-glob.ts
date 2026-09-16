export interface GlobMeter {
  steps: number;
}

const WILDCARD = "*";

export function matchesKeyGlob(pattern: string, key: string, meter?: GlobMeter): boolean {
  let patternAt = 0;
  let keyAt = 0;
  let starAt = -1;
  let starKeyAt = 0;
  while (keyAt < key.length) {
    if (meter !== undefined) {
      meter.steps += 1;
    }
    const expected = pattern[patternAt];
    if (expected === WILDCARD) {
      starAt = patternAt;
      starKeyAt = keyAt;
      patternAt += 1;
    } else if (expected !== undefined && expected === key[keyAt]) {
      patternAt += 1;
      keyAt += 1;
    } else if (starAt === -1) {
      return false;
    } else {
      patternAt = starAt + 1;
      starKeyAt += 1;
      keyAt = starKeyAt;
    }
  }
  while (pattern[patternAt] === WILDCARD) {
    patternAt += 1;
  }
  return patternAt === pattern.length;
}
