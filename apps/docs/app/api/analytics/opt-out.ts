import { z } from "zod";
import { i18n, localizedPath } from "@/lib/i18n";
import { ANALYTICS_OPT_OUT_COOKIE } from "@/lib/server-pageview";

export const MAX_OPT_OUT_BODY_BYTES = 256;

const ONE_YEAR_SECONDS = 31_536_000;

const COOKIE_ATTRIBUTES = "HttpOnly; Secure; SameSite=Lax; Path=/";

const optOutFormSchema = z.object({
  choice: z.enum(["off", "on"]),
  lang: z.enum(i18n.languages),
});

type OptOutForm = z.infer<typeof optOutFormSchema>;

export function parseOptOutForm(body: string): OptOutForm | undefined {
  const result = optOutFormSchema.safeParse(Object.fromEntries(new URLSearchParams(body)));
  return result.success ? result.data : undefined;
}

export function optOutCookie(choice: OptOutForm["choice"]): string {
  return choice === "off"
    ? `${ANALYTICS_OPT_OUT_COOKIE}=1; ${COOKIE_ATTRIBUTES}; Max-Age=${ONE_YEAR_SECONDS}`
    : `${ANALYTICS_OPT_OUT_COOKIE}=; ${COOKIE_ATTRIBUTES}; Max-Age=0`;
}

export function privacyReturnPath({ choice, lang }: OptOutForm): string {
  return `${localizedPath(lang, "/privacy")}?analytics=${choice}#analytics-${choice}`;
}
