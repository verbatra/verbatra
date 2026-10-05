import process from "node:process";

const MIN_SAMPLE_MS = 5;
const DEFAULT_RUNS = 7;

/**
 * @template T
 * @param {(input: T) => unknown} work
 * @param {T} input
 * @param {number} repetitions
 * @returns {number}
 */
function cpuMs(work, input, repetitions) {
  const started = process.cpuUsage();
  for (let repetition = 0; repetition < repetitions; repetition += 1) {
    work(input);
  }
  const used = process.cpuUsage(started);
  return (used.user + used.system) / 1_000;
}

/**
 * @template T
 * @param {(input: T) => unknown} work
 * @param {T} input
 * @returns {number}
 */
function repetitionsFor(work, input) {
  let repetitions = 1;
  while (cpuMs(work, input, repetitions) < MIN_SAMPLE_MS) {
    repetitions *= 2;
  }
  return repetitions;
}

/**
 * @template T
 * @param {(input: T) => unknown} work
 * @param {T} small
 * @param {T} large
 * @param {number} [runs]
 * @returns {number}
 */
export function cpuScalingRatio(work, small, large, runs = DEFAULT_RUNS) {
  const repetitions = repetitionsFor(work, small);
  let fastestSmall = Number.POSITIVE_INFINITY;
  let fastestLarge = Number.POSITIVE_INFINITY;
  for (let run = 0; run < runs; run += 1) {
    fastestSmall = Math.min(fastestSmall, cpuMs(work, small, repetitions));
    fastestLarge = Math.min(fastestLarge, cpuMs(work, large, repetitions));
  }
  return fastestLarge / fastestSmall;
}

export const LINEAR_SCALE = 8;

export const LINEAR_MAX_RATIO = 24;
