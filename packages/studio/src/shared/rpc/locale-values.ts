import type { LocaleValues, LocaleValuesPage } from "@verbatra/sdk";
import { z } from "zod";

export const LOCALE_VALUES_METHOD = "locale.values";

export const LOCALE_VALUES_PAGE_LIMIT_DEFAULT = 200;

export const LOCALE_VALUES_PAGE_LIMIT_CAP = 1000;

export const LOCALE_VALUES_QUERY_MAX_LENGTH = 500;

export const LOCALE_VALUES_CURSOR_MAX_LENGTH = 512;

const pageShape = {
  locales: z.array(z.string().min(1)).min(1).optional(),
  keys: z.array(z.string().min(1)).min(1).max(LOCALE_VALUES_PAGE_LIMIT_CAP).optional(),
  query: z.string().min(1).max(LOCALE_VALUES_QUERY_MAX_LENGTH).optional(),
  limit: z.number().int().min(1).max(LOCALE_VALUES_PAGE_LIMIT_CAP).optional(),
  cursor: z.string().min(1).max(LOCALE_VALUES_CURSOR_MAX_LENGTH).optional(),
};

function keysOrQuery(params: { readonly keys?: unknown; readonly query?: unknown }): boolean {
  return params.keys === undefined || params.query === undefined;
}

const KEYS_OR_QUERY = { message: "Pass keys or query, not both.", path: ["query"] };

export const agentLocaleValuesParamsSchema = z
  .strictObject(pageShape)
  .refine(keysOrQuery, KEYS_OR_QUERY);

export const localeValuesParamsSchema = z
  .strictObject({ ...pageShape, paged: z.literal(true).optional() })
  .refine(keysOrQuery, KEYS_OR_QUERY)
  .refine((params) => params.paged === true || Object.keys(params).length === 0, {
    message: "Paging parameters need paged: true.",
    path: ["paged"],
  });

export type LocaleValuesParams = z.infer<typeof localeValuesParamsSchema>;

export type LocaleValuesResult = readonly LocaleValues[] | LocaleValuesPage;
