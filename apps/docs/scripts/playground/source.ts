import type { AllowedLanguage } from "./limits.ts";

export interface SourceItem {
  readonly id: string;
  readonly text: string;
  readonly sameAllowed?: boolean;
}

export const PLAYGROUND_SOURCE: readonly SourceItem[] = [
  { id: "save", text: "Save changes" },
  { id: "signIn", text: "Sign in" },
  { id: "welcomeBack", text: "Welcome back, {name}!" },
  { id: "invited", text: "{name} invited you to {project}" },
  { id: "cartEmpty", text: "Your cart is empty." },
  { id: "deleteFile", text: "Delete this file?" },
  { id: "dontShow", text: "Don't show this again" },
  { id: "settings", text: "Settings" },
  { id: "onlyChanged", text: "Only changed keys get translated." },
  { id: "brand", text: "Verbatra", sameAllowed: true },
  { id: "checkoutTitle", text: "Review and checkout" },
  { id: "checkoutPay", text: "Pay and place order" },
];

export const PLAYGROUND_LANGUAGES: readonly AllowedLanguage[] = ["de", "es", "fr", "ja"];
