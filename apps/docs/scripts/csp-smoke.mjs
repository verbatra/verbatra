import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? "http://localhost:3000";

const PAGES = [
  { path: "/", html: true, analytics: true },
  { path: "/de", html: true, analytics: true },
  { path: "/docs", html: true, analytics: true, search: true },
  { path: "/docs/quickstart", html: true, analytics: true },
  { path: "/fr/docs/quickstart", html: true, analytics: true },
  { path: "/docs/quickstart/react", html: true, analytics: true },
  { path: "/de/docs/quickstart/flutter", html: true, analytics: true },
  { path: "/docs/sdk/run", html: true, analytics: true },
  { path: "/contact", html: true, analytics: true },
  { path: "/de/imprint", html: true, analytics: true },
  { path: "/privacy", html: true, analytics: true },
  { path: "/docs/does-not-exist", html: true, analytics: false },
  { path: "/docs/quickstart.md", html: false, analytics: false },
  { path: "/es/docs/quickstart/nextjs.md", html: false, analytics: false },
  { path: "/llms.txt", html: false, analytics: false },
];

const COLLECT_VIOLATIONS = () => {
  window.__cspViolations = [];
  document.addEventListener("securitypolicyviolation", (event) => {
    window.__cspViolations.push(`${event.violatedDirective} ${event.blockedURI}`);
  });
};

const STEP_TIMEOUT_MS = 10_000;
const STATIC_ASSET = "/_next/static/";
const CSP_HEADER = "content-security-policy";

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

async function holds(page, predicate) {
  try {
    await page.waitForFunction(predicate, undefined, { timeout: STEP_TIMEOUT_MS });
    return true;
  } catch {
    return false;
  }
}

const HYDRATED = () =>
  Object.keys(document.body ?? {}).some((key) => key.startsWith("__reactFiber$"));

const ANALYTICS_RUNNING = () => typeof window.umami === "object" && window.umami !== null;

function policyProblems(headers) {
  const policies = headers.filter(({ name }) => name.toLowerCase() === CSP_HEADER);
  if (policies.length !== 1) return [`${policies.length} ${CSP_HEADER} headers, expected 1`];
  const scriptSrc =
    policies[0].value.split("; ").find((directive) => directive.startsWith("script-src ")) ?? "";
  const problems = [];
  if (!scriptSrc.includes("'sha256-")) problems.push("script-src carries no sha256 hash");
  if (scriptSrc.includes("'unsafe-inline'")) problems.push("script-src allows unsafe-inline");
  return problems;
}

function watchStaticAssets(page) {
  const failures = [];
  page.on("response", (response) => {
    if (response.url().includes(STATIC_ASSET) && response.status() >= 400) {
      failures.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on("requestfailed", (request) => {
    if (request.url().includes(STATIC_ASSET)) {
      failures.push(`${request.failure()?.errorText ?? "failed"} ${request.url()}`);
    }
  });
  return failures;
}

async function visit(context, { path, html, analytics, search = false }) {
  const page = await context.newPage();
  const consoleViolations = [];
  page.on("console", (message) => {
    if (/content security policy/i.test(message.text())) consoleViolations.push(message.text());
  });
  const staticFailures = watchStaticAssets(page);
  const response = await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle" });
  const headerProblems = html && response ? policyProblems(await response.headersArray()) : [];
  const hydrated = html ? await holds(page, HYDRATED) : null;
  const analyticsRan = analytics ? await holds(page, ANALYTICS_RUNNING) : null;
  const searched = search ? await searchWorks(page) : null;
  const pageViolations = await page.evaluate(() => window.__cspViolations ?? []);
  const result = {
    path,
    violations: [...new Set([...pageViolations, ...consoleViolations])],
    staticFailures,
    headerProblems,
    hydrated,
    analytics: analyticsRan,
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

function failedChecks({
  violations,
  staticFailures,
  headerProblems,
  hydrated,
  analytics,
  searched,
}) {
  return [
    ...violations.map((violation) => `CSP violation: ${violation}`),
    ...staticFailures.map((failure) => `static asset failed: ${failure}`),
    ...headerProblems.map((problem) => `header: ${problem}`),
    ...(hydrated === false ? ["did not hydrate"] : []),
    ...(analytics === false ? ["analytics did not run"] : []),
    ...(searched === false ? ["search did not answer"] : []),
  ];
}

let failures = 0;
for (const result of results) {
  const { path, violations, staticFailures, hydrated, analytics, searched } = result;
  console.log(
    `${path}: ${violations.length} CSP violations, ${staticFailures.length} failed static assets, hydration ${note(hydrated, "ok", "MISSING")}, analytics ${note(analytics, "running", "NOT running")}, search ${note(searched, "works", "BROKEN")}`,
  );
  const checks = failedChecks(result);
  for (const check of checks) console.log(`  ${check}`);
  if (checks.length > 0) failures += 1;
}

console.log(failures === 0 ? "csp-smoke: passed" : `csp-smoke: ${failures} pages failed`);
process.exit(failures === 0 ? 0 : 1);
