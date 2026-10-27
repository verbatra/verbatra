export function stripAccentTags(text: string): string {
  return text.replace(/<\/?accent>/g, "");
}
