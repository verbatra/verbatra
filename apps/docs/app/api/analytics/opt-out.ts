import { z } from "zod";
import { choiceCookie, expiredLegacyOptOutCookie } from "@/lib/analytics-choice";
import { i18n, localizedPath } from "@/lib/i18n";
import { ANALYTICS_CHOICES } from "@/lib/umami-config.mjs";

export const MAX_OPT_OUT_BODY_BYTES = 256;

const optOutFormSchema = z.object({
  choice: z.enum(ANALYTICS_CHOICES),
  lang: z.enum(i18n.languages),
});

type OptOutForm = z.infer<typeof optOutFormSchema>;

export function parseOptOutForm(body: string): OptOutForm | undefined {
  const result = optOutFormSchema.safeParse(Object.fromEntries(new URLSearchParams(body)));
  return result.success ? result.data : undefined;
}

export function choiceCookies(choice: OptOutForm["choice"]): readonly string[] {
  return [choiceCookie(choice), expiredLegacyOptOutCookie()];
}

export function privacyReturnPath({ choice, lang }: OptOutForm): string {
  return `${localizedPath(lang, "/privacy")}?analytics=${choice}#analytics-${choice}`;
}
