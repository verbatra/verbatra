export declare function cpuScalingRatio<T>(
  work: (input: T) => unknown,
  small: T,
  large: T,
  runs?: number,
): number;

export declare const LINEAR_SCALE: number;

export declare const LINEAR_MAX_RATIO: number;
