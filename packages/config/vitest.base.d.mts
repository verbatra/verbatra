import type { ViteUserConfig } from "vitest/config";

export interface CreateVitestConfigOptions {
  testInclude?: string[];
  coverageInclude?: string[];
  coverageExclude?: string[];
  testTimeout?: number;
}

export declare function createVitestConfig(options?: CreateVitestConfigOptions): ViteUserConfig;
