export function requestHost(headers: Headers, urlHost: string): string {
  const host = headers.get("host")?.trim();
  if (host) return host;
  const forwarded = (headers.get("x-forwarded-host") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return forwarded.at(-1) ?? urlHost;
}
