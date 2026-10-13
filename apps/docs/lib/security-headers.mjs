export const CSP_ENFORCED = true;

const DEV_SCRIPT_SOURCES = ["'unsafe-inline'", "'unsafe-eval'"];

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function upgradesInsecureRequests(host) {
  if (!host) return true;
  try {
    return !LOOPBACK_HOSTNAMES.has(new URL(`http://${host}`).hostname);
  } catch {
    return true;
  }
}

export function contentSecurityPolicy({
  enforce,
  isDev,
  scriptHashes = [],
  upgradeInsecureRequests = true,
}) {
  const inlineScripts = isDev ? DEV_SCRIPT_SOURCES : scriptHashes;
  const directives = [
    "default-src 'self'",
    ["script-src 'self'", ...inlineScripts].join(" "),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (enforce && upgradeInsecureRequests) directives.push("upgrade-insecure-requests");
  return {
    key: enforce ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only",
    value: directives.join("; "),
  };
}

export function securityHeaders() {
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=()",
    },
  ];
}
