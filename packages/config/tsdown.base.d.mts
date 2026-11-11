import type { UserConfig } from "tsdown";

export interface TsdownConfig extends UserConfig {}

export declare function createTsdownConfig(overrides?: UserConfig): TsdownConfig;
