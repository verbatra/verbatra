export const HERO_DIFF_FORMAT = "next-intl-json";

export const HERO_DIFF_SOURCE_LOCALE = "en";

export const HERO_DIFF_TARGET_LOCALE = "de";

export const HERO_DIFF_SOURCE_FILE = "messages/en.json";

export const HERO_DIFF_TARGET_FILE = "messages/de.json";

export const HERO_DIFF_SOURCE = [
  { key: "nav.home", value: "Home" },
  { key: "cart.total", value: "Total: {amount}" },
  { key: "checkout.title", value: "Checkout" },
  { key: "checkout.pay", value: "Pay {amount}" },
];

export const HERO_DIFF_TARGET_SYNCED = [
  { key: "nav.home", value: "Startseite" },
  { key: "cart.total", value: "Summe: {amount}" },
];

export const HERO_DIFF_TARGET_FILLED = [
  { key: "checkout.title", value: "Kasse" },
  { key: "checkout.pay", value: "{amount} bezahlen" },
];

export function heroDiffLine(entry) {
  const leaf = entry.key.split(".").at(-1);
  return `${JSON.stringify(leaf)}: ${JSON.stringify(entry.value)}`;
}
