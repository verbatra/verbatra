import { ProviderError } from "../errors.js";

const BCP47_LIKE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

export function assertValidGoogleTranslateLocale(locale: string, role: "source" | "target"): void {
  if (!BCP47_LIKE.test(locale)) {
    throw new ProviderError(
      "INVALID_REQUEST",
      `Google Cloud Translation does not accept "${locale}" as a ${role} locale code. Use a ` +
        `well-formed BCP-47 language code (for example, "en" or "pt-BR").`,
    );
  }
}
