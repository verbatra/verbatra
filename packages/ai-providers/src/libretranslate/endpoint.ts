export type LibreTranslatePath = "translate" | "languages";

function withoutTrailingSlashes(baseUrl: string): string {
  let end = baseUrl.length;
  while (end > 0 && baseUrl[end - 1] === "/") {
    end -= 1;
  }
  return baseUrl.slice(0, end);
}

export function libreTranslateUrl(baseUrl: string, path: LibreTranslatePath): string {
  return `${withoutTrailingSlashes(baseUrl)}/${path}`;
}
