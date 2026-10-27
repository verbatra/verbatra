import type { AllowedLanguage } from "./limits.ts";

export interface SourceItem {
  readonly id: string;
  readonly text: string;
  readonly sameAllowed?: boolean;
}

export const PLAYGROUND_SOURCE: readonly SourceItem[] = [
  { id: "save", text: "Save changes" },
  { id: "signIn", text: "Sign in" },
  { id: "welcome", text: "Welcome back, {name}!" },
  { id: "messages", text: "You have {count} new messages" },
  { id: "cartEmpty", text: "Your cart is empty." },
  { id: "deleteFile", text: "Delete this file?" },
  { id: "dontShow", text: "Don't show this again" },
  { id: "settings", text: "Settings" },
  { id: "onlyChanged", text: "Only changed keys get translated." },
  { id: "brand", text: "Verbatra", sameAllowed: true },
];

export const PLAYGROUND_LANGUAGES: readonly AllowedLanguage[] = ["de", "es", "fr", "ja"];
