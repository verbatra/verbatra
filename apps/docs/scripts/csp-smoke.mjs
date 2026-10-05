import { chromium } from "playwright";
import { UMAMI_ORIGIN } from "../lib/security-headers.mjs";

const baseUrl = process.argv[2] ?? "http://localhost:3000";

const PAGES = [
  { path: "/", analytics: true },
  { path: "/de", analytics: true },
  { path: "/docs", analytics: true, search: true },
  { path: "/docs/quickstart", analytics: true },
  { path: "/fr/docs/quickstart", analytics: true },
  { path: "/docs/sdk/run", analytics: true },
  { path: "/contact", analytics: true },
  { path: "/de/imprint", analytics: true },
  { path: "/privacy", analytics: true },
  { path: "/docs/does-not-exist", analytics: false },
  { path: "/docs/quickstart.md", analytics: false },
  { path: "/llms.txt", analytics: false },
];

const COLLECT_VIOLATIONS = () => {
  window.__cspViolations = [];
  document.addEventListener("securitypolicyviolation", (event) => {
    window.__cspViolations.push(`${event.violatedDirective} ${event.blockedURI}`);
  });
};

const STEP_TIMEOUT_MS = 10_000;

async function searchWorks(page) {
  const searched = page
    .waitForResponse((response) => response.url().includes("/api/search"), {
      timeout: STEP_TIMEOUT_MS,
    })
    .then((response) => response.ok())
    .catch(() => false);
  try {
    await page.locator("button[data-search-full]").first().click({ timeout: STEP_TIMEOUT_MS });
    await page
      .locator('[role="dialog"] input')
      .first()
      .fill("provider", { timeout: STEP_TIMEOUT_MS });
  } catch {
    return false;
  }
  return searched;
}

async function visit(context, { path, analytics, search = false }) {
  const page = await context.newPage();
  const consoleViolations = [];
  page.on("console", (message) => {
    if (/content security policy/i.test(message.text())) consoleViolations.push(message.text());
  });
  const analyticsLoaded = analytics
    ? page
        .waitForResponse((response) => response.url().startsWith(`${UMAMI_ORIGIN}/script.js`), {
          timeout: STEP_TIMEOUT_MS,
        })
        .then((response) => response.ok())
        .catch(() => false)
    : Promise.resolve(null);
  await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle" });
  const searched = search ? await searchWorks(page) : null;
  const pageViolations = await page.evaluate(() => window.__cspViolations ?? []);
  const result = {
    path,
    violations: [...new Set([...pageViolations, ...consoleViolations])],
    analytics: await analyticsLoaded,
    searched,
  };
  await page.close();
  return result;
}

const browser = await chromium.launch();
const context = await browser.newContext();
await context.addInitScript(COLLECT_VIOLATIONS);
const results = [];
for (const target of PAGES) results.push(await visit(context, target));
await browser.close();

function note(value, passed, failed) {
  if (value === null) return "n/a";
  return value ? passed : failed;
}

for (const { path, violations, analytics, searched } of results) {
  console.log(
    `${path}: ${violations.length} CSP violations, analytics ${note(analytics, "loaded", "NOT loaded")}, search ${note(searched, "works", "BROKEN")}`,
  );
  for (const violation of violations) console.log(`  ${violation}`);
}

const failed = results.filter(
  ({ violations, analytics, searched }) =>
    violations.length > 0 || analytics === false || searched === false,
);
process.exit(failed.length === 0 ? 0 : 1);
