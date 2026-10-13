---
name: umami-analytics
description: 'Server-side Umami pageview counting for the verbatra docs site (apps/docs). Use when changing which requests count as a pageview, the Umami host or website ID, the opt-out (cookie, /api/analytics, the privacy page form), or when someone proposes adding a client-side tracker or event tracking back.'
license: MIT
metadata:
  author: verbatra
  version: '2.0'
  source: 'internal'
user-invocable: false
---

# Umami Analytics (apps/docs)

## Overview

apps/docs runs no analytics script in the browser and records no events. The proxy
(apps/docs/proxy.ts) counts a pageview on the server and posts it to the self-hosted Umami
API after the response is sent (`event.waitUntil`). Nothing is written to the visitor's device
for analytics; the only cookie is the opt-out cookie, set when the visitor asks for it and read
only to honour that objection. The privacy page describes this in legal.privacy.s4 and s5
(apps/docs/messages/*.json) and renders the opt-out forms in section 4.

**When to use:** changing the counting rules, the Umami origin or website ID, the opt-out
cookie or route, or the privacy wording that describes them.

**When NOT to use:** general proxy or CSP work unrelated to pageviews.

## Key Concepts

- **One module** - apps/docs/lib/server-pageview.ts (server-only) holds UMAMI_ORIGIN,
  UMAMI_WEBSITE_ID, the opt-out cookie name and every rule. Neither the origin nor the ID
  appears in client code or in the Content-Security-Policy.
- **What counts** - `countedPageview` returns an event only for a GET with
  `Sec-Fetch-Dest: document` and `Sec-Fetch-Mode: navigate`, no `prefetch` in `Sec-Purpose`
  or `Purpose`, a 200 response without `Location`, not the `.md` markdown variant, a served
  pathname listed in the CSP hash manifest (`.next/csp-script-hashes.json`) other than
  `/_not-found` and `/_global-error`, on the production host (`SITE_HOST`, read by
  `lib/request-host.ts` from `Host`, which nginx sets, and only without it from the last
  `X-Forwarded-Host` value), with a non-empty user agent that is not an obvious tool
  or crawler. Local runs, csp-smoke and health checks never count.
- **Refusals** - `Sec-GPC: 1`, `DNT: 1` or the cookie `verbatra_analytics_optout=1` stop the
  pageview before anything is built.
- **Payload** - `{ type: "event", payload: { website, hostname, url, referrer, language, ip,
  userAgent } }`: the path without query or fragment, the Referer without query, the first
  Accept-Language tag (dropped above 35 characters; a referrer is dropped above 500), and the
  right-most public address in `X-Forwarded-For` (nginx is the only hop; private, loopback,
  CGNAT, link-local, multicast, documentation, benchmark and NAT64 ranges skipped, hex-form
  IPv4-mapped IPv6 normalised), else a public `X-Real-IP`, else no `ip`. Umami 3.3.1 accepts
  `payload.ip` and `payload.userAgent`, so no Umami setting is needed.
- **Sending** - `sendPageview` POSTs `${UMAMI_ORIGIN}/api/send` with the visitor's user agent
  as `User-Agent` and `AbortSignal.timeout(1500)`. It never rejects and never logs.
- **Opt-out** - apps/docs/app/api/analytics/route.ts takes a form POST
  (`application/x-www-form-urlencoded`, `choice=off|on`, `lang`), checks the full Origin and
  refuses `Sec-Fetch-Site: cross-site` like the contact route, sets or clears the HttpOnly,
  Secure, SameSite=Lax cookie (one year) and answers 303 to
  `/privacy?analytics=<choice>#analytics-<choice>` for the default locale (no prefix) and
  `/<lang>/privacy?analytics=<choice>#analytics-<choice>` for the others. The locale is
  validated with zod, so the target is built from an allowlist.
  components/analytics-opt-out.tsx renders two plain forms; the confirmation shows through
  `:target`, so it works without JavaScript.
- **Accepted limits** - only full page loads count: client-side navigations and prefetched
  pages never reach the proxy as document requests. No titles, screen sizes or events.

## Common Mistakes

| Mistake | Correct Pattern |
| --- | --- |
| Adding the Umami script or a client beacon back | It reads and sends device data, which brings back the § 25 TDDDG consent question; keep counting on the server |
| Adding custom events or data-umami-event attributes | There is no client tracker; events were dropped on purpose |
| Counting in a route handler or page | Count only in proxy.ts through `countedPageview`, so prefetch and RSC rules stay in one place |
| Logging a failed send | `sendPageview` stays silent: no IP, user agent or error text in logs |
| Adding the Umami origin to the CSP | The browser never talks to Umami; csp-smoke fails on any third-party request |
| Changing the counted data without the policy | Update legal.privacy.s4 in all four locales and verbatra.lock.json in the same change |
| Adding a cookie, localStorage or sessionStorage write (including a fumadocs `persist` or `groupId`) without the policy | Name the key, when it is written and that it is never sent in legal.privacy.s5 in all four locales, and pin it in privacy/page.test.tsx |

## Tests

lib/server-pageview.test.ts (every skip rule, IP extraction, payload, silent failures),
proxy.pageview.test.ts (waitUntil exactly once for a document navigation, never otherwise),
app/api/analytics/route.test.ts (cookie, 303 target, invalid locale, foreign origin), and
scripts/csp-smoke.mjs (no request to any other origin) after a build.
