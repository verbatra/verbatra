export type LibreTranslatePath = "translate" | "languages";

export function libreTranslateUrl(baseUrl: string, path: LibreTranslatePath): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path}`;
}
