import type { LocaleGitDiffResult, LocaleGitStatusResult } from "@verbatra/sdk";
import { z } from "zod";

export const GIT_STATUS_METHOD = "git.status";
export const GIT_LOCALE_DIFF_METHOD = "git.localeDiff";

export const gitStatusParamsSchema = z.strictObject({});

export const gitLocaleDiffParamsSchema = z.strictObject({
  locale: z.string().min(1).max(128),
});

export type GitStatusParams = z.infer<typeof gitStatusParamsSchema>;
export type GitLocaleDiffParams = z.infer<typeof gitLocaleDiffParamsSchema>;

export type GitStatusResult = LocaleGitStatusResult;
export type GitLocaleDiffResult = LocaleGitDiffResult;
