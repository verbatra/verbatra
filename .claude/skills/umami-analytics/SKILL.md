---
name: umami-analytics
description: 'Umami analytics for the verbatra docs site (apps/docs): the server-side pageview count, the first-party relay /api/e, the closed event taxonomy, the client reporter, the refusal and objection rules, the CSP, and the privacy wording that describes them. Use when changing what is counted, the Umami host or website ID, an event, the relay, the reporter, or the privacy page.'
license: MIT
metadata:
  author: verbatra
  version: '4.0'
  source: 'internal'
---

# Umami Analytics (apps/docs)

## Overview

One model, no consent surface. Everything reaches the self-hosted Umami (`/api/send`) from our
own server; the browser never talks to Umami and never loads an analytics script.

- **Server pageviews.** The proxy (apps/docs/proxy.ts) counts a document navigation from request
  headers and posts it after the response (`event.waitUntil`).
- **Server events.** `not_found` and `markdown_view` from the proxy (lib/server-events.ts),
  `contact_submit` and `search_run` from their route handlers, all through `emitUmamiEvent`
  (lib/umami-event.ts).
- **Relayed client events.** A tiny first-party reporter in the browser posts an allowlisted event
  to `/api/e` (app/api/e/route.ts, relay.ts); the server validates it and forwards it exactly like
  a server event, with the IP and user agent of that request.
- **No cookies, no storage, no replay, no heatmaps, no performance data.** Legal basis Art. 6(1)(f)
  GDPR; nothing is stored on or read from the device except the current page path. This is a
  technical risk assessment, not legal advice. The residual risk is that first-party JavaScript
  events need no consent (medium confidence); stopping at server events only is the fallback.

**When to use:** changing what is counted, the Umami origin or website ID, an event, the relay,
the reporter, the objection handling, or the privacy wording about them.

**When NOT to use:** general proxy or CSP work unrelated to analytics.

## Key Concepts

- **Shared constants** - lib/umami-config.mjs (no `server-only`): `UMAMI_ORIGIN`,
  `UMAMI_WEBSITE_ID`, `ANALYTICS_CHOICE_COOKIE`, `LEGACY_OPT_OUT_COOKIE`.
- **Sender** - lib/umami-send.ts `sendToUmami`: `type: "event"` with `website`, `hostname`, `url`,
  `userAgent`, optional `name`, `data`, `referrer`, `language`, `ip`; 1500 ms timeout; never
  rejects, never logs. A message without `name` is a pageview in Umami, any `name` makes a custom
  event. Session stitching works because pageviews and events share `ip` + user agent + the
  monthly salt; the app never sends `id`.
- **Server count rules** - `countedPageview` (lib/server-pageview.ts): GET with
  `Sec-Fetch-Dest: document` and `Sec-Fetch-Mode: navigate`, no prefetch purpose, a 200 without
  `Location`, not the `.md` variant, a served path in the CSP hash manifest other than the error
  routes, the production host (`SITE_HOST`), a non-empty non-crawler user agent. Local runs,
  csp-smoke and health checks never count.
- **Refusal** - `isTrackingRefused` is the one rule, shared by the proxy count, server events and
  the relay: `Sec-GPC: 1`, `DNT: 1`, the cookie `verbatra_analytics=off` or the legacy cookie
  `verbatra_analytics_optout=1` (`hasObjectionCookie`, lib/analytics-choice.ts). A refusal drops
  the event silently on the server. The browser reads none of these signals. Cookies with the
  values `full` or `default` are inert. Nothing sets a cookie any more; the two honoured cookies
  are kept readable until 2027-11-17 (the latest expiry of a one-year cookie set on 2026-11-17),
  then remove `hasObjectionCookie`, the two constants and their tests in a follow-up.
- **Relay** - app/api/e/route.ts always answers 204 and never echoes or logs. relay.ts requires
  same-origin proof (`Sec-Fetch-Site: same-origin` or a matching `Origin`), a public client IP, an
  in-memory per-IP fixed window of 60 per minute plus a global cap (lib/relay-rate-limit.ts, no
  Arcjet: it would send every IP to a third party), a 1 KiB body, a zod schema over the closed
  taxonomy (lib/relay-events.ts, strict objects), a path that is a real page route
  (`servedPathOf` maps the public URL to the served one so stats do not split), the bot filter, and
  the refusal rule.
- **Reporter** - lib/analytics-report.ts: `report(name, props)` and `reportPageview(path)` post
  `{ e, p?, u }` with `navigator.sendBeacon` (Blob `application/json`), falling back to
  `fetch` with `keepalive` and `credentials: "omit"`; they never throw. The body carries the event
  name, allowlisted properties and the bare path only. components/analytics-reporter.tsx (renders
  null, mounted in the locale layout) owns one delegated click listener and a `usePathname` effect:
  the first render and a re-render on the same path report nothing (the document load is the
  server's), each later pathname change reports one bare `pageview`. Hash and query changes keep
  the pathname, so they report nothing; a bfcache restore remounts nothing and reports nothing.
- **Never read in the browser** - cookies, storage, `screen`, `navigator.language`, user agent,
  `document.referrer`, `document.title`, GPC, DNT. lib/analytics-report.test.ts fails if the
  reporter touches any of them.

### Event taxonomy

Names and enum values live once in lib/analytics-events.ts and are imported by the reporter, the
click mapping and the relay schema. Properties are closed enums only, never free text, queries,
code or form values.

| Event | Properties | Origin |
| --- | --- | --- |
| (pageview) | none, sent without a name | proxy for document loads; reporter for soft navigations |
| `copy_code` | `surface`: code-block, command-row, ai-prompt, page-markdown | `data-copy-surface` on the button or its region |
| `cta_click` | `id`: hero-quickstart, hero-compare | `data-cta` |
| `outbound_click` | `dest`: github, npm, mcp-registry, other | any `<a target="_blank">` to another origin |
| `search_open` | none | open transition in components/focus-restoring-search-dialog.tsx |
| `mcp_install_click` | none | `data-mcp-install` on components/mcp-install-link.tsx |
| `locale_switch` | `to`: a code from lib/locales.ts | `data-locale-switch` on the language options |
| `contact_submit` | `result`: ok, invalid, rate_limited, error | server, app/api/contact/route.ts |
| `search_run` | `results`: none, some | server, app/api/search/route.ts |
| `not_found` | `area`: docs, other | server, the proxy |
| `markdown_view` | `via`: suffix, accept | server, the proxy |

### How to add an event

1. Add the name, its enum values and its property type to lib/analytics-events.ts (client) or
   lib/server-events.ts (server).
2. Client events: add a `withProperties` or `bare` entry to the schema in lib/relay-events.ts and a
   case to lib/analytics-click-events.ts, marked by a `data-*` attribute on the element, or call
   `report` from a handler. Server events: call `emitUmamiEvent` after the outcome is known.
3. Write the test first: the mapping in lib/analytics-click-events.test.ts, the schema in
   lib/relay-events.test.ts, a real-component marker test, and a case in e2e/analytics.spec.ts.
4. Say it in the policy (legal.privacy.s4.events) in every locale through `verbatra export` and
   `verbatra import`.

### Why the design is what it is

The stock Umami script reads `screen` and storage and the recorder captures behaviour, which in
Germany needs consent; a consent prompt was removed on purpose. The reporter reads nothing from the
device, the browser contacts only the site, and the server forwards. So: never add
`script.js`, `recorder.js`, `data-umami-*` (the real tracker calls `preventDefault` on anchors and
breaks Next `Link`), `umami.identify()`, `data-distinct-id`, a cookie, a localStorage or
sessionStorage write for analytics, or a way for the browser to reach another origin.

### CSP

lib/security-headers.mjs allows no origin but `'self'` in any directive; lib/security-headers.test.ts
and proxy.csp.test.ts fail on an analytics origin. `connect-src 'self'` is what lets the beacon
reach `/api/e`. csp-smoke fails on any request to another origin and checks that a soft
navigation reaches `/api/e` with a 204.

### Objection (Art. 21)

GPC and DNT are treated as an objection and honoured silently by the server. Otherwise the person
e-mails (privacy section 9). Because records are pseudonymous we may need the IP and user agent
(Art. 11(2) GDPR); the IP is added to the ignore list of the Umami server (`hasBlockedIp` answers
403 for it, relayed events included). Umami does not persist the raw IP (`createSession` and
`saveEvent` take no ip field); the owner's reverse-proxy and web-server access logs sit outside
this code and must stay short.

### Retention

The policy promises 13 months for page view and event rows and nothing else
(legal.privacy.s4.retention). The owner enforces it on the Umami server; the site code cannot
delete anything. Replay and heatmaps are off in the dashboard and their data deleted.

## Common Mistakes

| Mistake | Correct Pattern |
| --- | --- |
| Loading any Umami script, or opening a connection from the browser to Umami | The browser posts to `/api/e` only; the server forwards |
| Sending a `name` for a soft-navigation pageview | Omit it: a named event is a custom event, not a pageview |
| Reading a device or signal value in the reporter | Send the event, its allowlisted properties and the path only; the server applies GPC and DNT |
| Free text, queries, code or form values in an event | Closed enums in lib/analytics-events.ts, enforced by the strict relay schema |
| Counting in a page or an action | Count in proxy.ts through `countedPageview` or a route handler through `emitUmamiEvent` |
| Logging a failed send or a dropped relay request | `sendToUmami` and the relay stay silent: no IP, user agent or error text |
| Adding a cookie or a storage write | Name it in legal.privacy.s5 in every locale and pin it in privacy/page.test.tsx |
| Changing what is counted without the policy | Update legal.privacy.s2, s4, s5, s6 and the objection section in every locale and verbatra.lock.json in the same change, through `verbatra export` and `verbatra import`; remove keys with `verbatra translate --dry-run --prune` then `--prune`; never `pnpm i18n` for hand-maintained legal text |
| Writing a claim the tests retired (an optional extended tier, a consent prompt, replay or heatmap retention) | app/[lang]/(legal)/retired-legal-claims.test.tsx lists them in every locale |

## Tests

lib/analytics-report.test.ts, lib/analytics-click-events.test.ts, components/analytics-reporter.test.tsx,
lib/relay-events.test.ts, lib/relay-rate-limit.test.ts, app/api/e/route.test.ts, lib/umami-send.test.ts,
lib/umami-event.test.ts, lib/server-events.test.ts, lib/server-pageview.test.ts,
proxy.pageview.test.ts, proxy.cookies.test.ts, lib/analytics-choice.test.ts,
lib/security-headers.test.ts, proxy.csp.test.ts, the privacy page tests and retired claims under
app/[lang]/(legal)/, and e2e/analytics.spec.ts. The e2e intercepts `/api/e` with `page.route` and
never reaches the real host; scripts/csp-smoke.mjs fails on any request to another origin.
