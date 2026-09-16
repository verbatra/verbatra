export const SLASH = 47;
export const GREATER_THAN = 62;

export function isAsciiAlpha(code: number): boolean {
  const lower = code | 32;
  return lower >= 97 && lower <= 122;
}

export function isAsciiDigit(code: number): boolean {
  return code >= 48 && code <= 57;
}

export function isHtmlSpace(code: number): boolean {
  return code === 9 || code === 10 || code === 12 || code === 13 || code === 32;
}
