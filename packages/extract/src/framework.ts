import { z } from "zod";

export const SOURCE_FRAMEWORKS = ["i18next"] as const;

export type SourceFramework = (typeof SOURCE_FRAMEWORKS)[number];

export const sourceFrameworkSchema = z.enum(SOURCE_FRAMEWORKS);
