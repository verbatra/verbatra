import { z } from "zod";
import { choiceCookie } from "@/lib/analytics-choice";
import { i18n, localizedPath } from "@/lib/i18n";
import { LEGACY_OPT_OUT_COOKIE } from "@/lib/umami-config.mjs";

export const MAX_OPT_OUT_BODY_BYTES = 256;

const optOutFormSchema = z.object({
  choice: z.enum(["full", "default", "off"]),
  lang: z.enum(i18n.languages),
});

type OptOutForm = z.infer<typeof optOutFormSchema>;

export function parseOptOutForm(body: string): OptOutForm | undefined {
  const result = optOutFormSchema.safeParse(Object.fromEntries(new URLSearchParams(body)));
  return result.success ? result.data : undefined;
}

export function choiceCookies(choice: OptOutForm["choice"]): readonly string[] {
  return [
    choiceCookie(choice),
    `${LEGACY_OPT_OUT_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`,
  ];
}

export function privacyReturnPath({ choice, lang }: OptOutForm): string {
  return `${localizedPath(lang, "/privacy")}?analytics=${choice}#analytics-${choice}`;
}
