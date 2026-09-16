export function normalizeText(text: string): string {
  return text.normalize("NFC").replace(/\r\n?/g, "\n");
}
