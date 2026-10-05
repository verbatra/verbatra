import type { ApproveLocaleResult, MachineClassOrigin } from "@verbatra/sdk";
import { z } from "zod";

export const REVIEW_APPROVE_LOCALE_METHOD = "review.approveLocale";

export const REVIEWABLE_ORIGINS = [
  "machine",
  "memory",
  "fuzzy",
  "agent",
] as const satisfies readonly MachineClassOrigin[];

export const reviewApproveLocaleParamsSchema = z.strictObject({
  locale: z.string().min(1),
  origins: z.array(z.enum(REVIEWABLE_ORIGINS)).min(1).max(REVIEWABLE_ORIGINS.length).optional(),
});

export type ReviewApproveLocaleParams = z.infer<typeof reviewApproveLocaleParamsSchema>;

export type ReviewApproveLocaleResult = ApproveLocaleResult;
