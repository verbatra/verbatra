import type { LocaleValues } from "@verbatra/sdk";
import { z } from "zod";

export const LOCALE_VALUES_METHOD = "locale.values";

export const localeValuesParamsSchema = z.strictObject({});

export type LocaleValuesParams = z.infer<typeof localeValuesParamsSchema>;

export type LocaleValuesResult = readonly LocaleValues[];
