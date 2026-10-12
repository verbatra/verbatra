export const LIVE_COUNT_SLOT = "{count}";

export function fillCount(template: string, count: string): string {
  return template.replace(LIVE_COUNT_SLOT, count);
}
