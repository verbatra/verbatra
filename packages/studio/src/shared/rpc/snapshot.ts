import type { FormatId, ProviderId } from "@verbatra/sdk";
import { z } from "zod";
import type { GlossaryIndicator } from "./glossary.js";

export const PROJECT_SNAPSHOT_METHOD = "project.snapshot";

export const projectSnapshotParamsSchema = z.strictObject({});

export type ProjectSnapshotParams = z.infer<typeof projectSnapshotParamsSchema>;

export type SpendWithheldReason = "flag" | "policy";

export interface StudioRateLimit {
  readonly windowMs: number;
  readonly max: number;
}

export interface StudioRateLimits {
  readonly retranslate: StudioRateLimit;
  readonly reviewDecision: StudioRateLimit;
}

export interface StudioCapabilities {
  readonly spend: boolean;
  readonly spendWithheld?: SpendWithheldReason;
  readonly writeToDisk: boolean;
  readonly limits?: StudioRateLimits;
}

export interface ProjectSnapshotResult {
  readonly sourceLocale: string;
  readonly targetLocales: readonly string[];
  readonly format: FormatId;
  readonly files: { readonly pattern: string };
  readonly provider: { readonly id: ProviderId };
  readonly configSource: string;
  readonly glossary: GlossaryIndicator;
  readonly capabilities: StudioCapabilities;
  readonly exposeAgentTools: boolean;
  readonly prune?: boolean;
  readonly generatePlurals?: boolean;
  readonly maxBatchSize?: number;
  readonly tone?: "formal" | "informal" | "neutral";
}
