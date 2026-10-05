export const UMAMI_ORIGIN = "https://umami.kreitz-webdev.de";

export const CSP_ENFORCED = false;

export function contentSecurityPolicy({ enforce, isDev }) {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} ${UMAMI_ORIGIN}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self' ${UMAMI_ORIGIN}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (enforce) directives.push("upgrade-insecure-requests");
  return {
    key: enforce ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only",
    value: directives.join("; "),
  };
}

export function securityHeaders({ enforce = CSP_ENFORCED, isDev = false } = {}) {
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=()",
    },
    contentSecurityPolicy({ enforce, isDev }),
  ];
}
