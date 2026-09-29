import { z } from "zod";
import { httpBaseUrlSchema } from "../base-url.js";
import { localeMapConfigSchema } from "../locale-map.js";
import { requestTimeoutConfigSchema } from "../request-timeout-config.js";

export const libreTranslateConfigSchema = z
  .object({ baseUrl: httpBaseUrlSchema })
  .extend(requestTimeoutConfigSchema.shape)
  .extend(localeMapConfigSchema.shape);

export type LibreTranslateConfig = z.infer<typeof libreTranslateConfigSchema>;
