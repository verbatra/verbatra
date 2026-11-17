---
name: umami-analytics
description: 'Umami analytics for the verbatra docs site (apps/docs): the server-side pageview count, the consent-gated client tracker and session recorder, the choice cookie and its three states, the consent prompt and privacy switch, click events, the CSP origin, and the privacy wording that describes them. Use when changing what is counted or recorded, the Umami host or website ID, the choice cookie, /api/analytics, the loader, an event, or the privacy page.'
license: MIT
metadata:
  author: verbatra
  version: '3.0'
  source: 'internal'
---

# Umami Analytics (apps/docs)

## Overview

Two tiers, one switch.

- **Tier 0, server count (default).** The proxy (apps/docs/proxy.ts) counts a pageview on the
  server and posts it to the self-hosted Umami API after the response is sent
  (`event.waitUntil`). Nothing is read from or written to the visitor's device for it. Legal
  basis Art. 6(1)(f) GDPR.
- **Tier 1, extended analytics (opt-in).** After an explicit Allow, a first-party loader injects
  Umami's `script.js` (client pageviews, soft navigations, click events) and `recorder.js`
  (session replay and heatmaps). Legal basis Art. 6(1)(a) GDPR with section 25(1) TDDDG.
- **Off.** `Sec-GPC`, `DNT`, the choice `off` or the legacy opt-out cookie: nothing is counted
  and nothing is loaded.

The reason for the split: the stock tracker reads device data with JavaScript (screen size) and
the recorder captures behaviour continuously, so both need consent in Germany, while the
server count reads only what the browser sends anyway. The recorder also ignores
`umami.disabled`, DNT and GPC, so no opt-out of the tracker alone can stop it: the only safe
design is a loader that injects neither script until consent. This is a technical risk
assessment, not legal advice.

**When to use:** changing the counting rules, the Umami origin or website ID, the choice cookie
or route, the loader, an event, the prompt, or the privacy wording that describes them.

**When NOT to use:** general proxy or CSP work unrelated to analytics.

## Key Concepts

- **Shared constants** - apps/docs/lib/umami-config.mjs (no `server-only`, so client code and
  security headers import it): `UMAMI_ORIGIN`, `UMAMI_WEBSITE_ID`, `UMAMI_SCRIPT_URL`,
  `UMAMI_RECORDER_URL`, `ANALYTICS_CHOICE_COOKIE`, `LEGACY_OPT_OUT_COOKIE`,
  `ANALYTICS_CHOICES`, `CHOICE_COOKIE_MAX_AGE_SECONDS` (one year, shared by the cookie string and its test). `lib/server-pageview.ts` re-exports the origin and website ID.
- **Choice cookie** - `verbatra_analytics` with the value `full`, `default` or `off`; absent
  means undecided; anything else is undecided. Secure, SameSite=Lax, Path=/, one year, NOT
  HttpOnly (the loader and the prompt read it in the browser; page HTML is prerendered, so the
  server cannot decide). `default` is "No thanks" and keeps the Tier 0 count. Parsing and the
  `Set-Cookie` string live in lib/analytics-choice.ts (`readChoiceCookie`, `hasLegacyOptOut`,
  `choiceCookie`, `expiredLegacyOptOutCookie`, `hasPrivacySignal`).
- **Legacy cookie** - `verbatra_analytics_optout=1` is HttpOnly, so only the server sees it. The
  proxy still honours it for counting and, when it is present without the choice cookie,
  appends `Set-Cookie: verbatra_analytics=off` and always expires the legacy cookie
  (`withChoiceMigration`). An explicit choice on
  /api/analytics clears it.
- **Server count rules** - `countedPageview` (lib/server-pageview.ts) returns an event only for a
  GET with `Sec-Fetch-Dest: document` and `Sec-Fetch-Mode: navigate`, no `prefetch` in
  `Sec-Purpose` or `Purpose`, a 200 response without `Location`, not the `.md` variant, a served
  pathname listed in the CSP hash manifest other than `/_not-found` and `/_global-error`, on the
  production host (`SITE_HOST`), with a non-empty user agent that is not an obvious tool or
  crawler. Local runs, csp-smoke and health checks never count.
- **Refusals** - `Sec-GPC: 1`, `DNT: 1`, the choice `off` or the legacy cookie stop the count
  (`isTrackingRefused`). The choice `full` also skips it, because the client tracker counts that
  visitor: one count per visit, never both. One extra server count on the page where consent is
  given is accepted. There is no server fallback for a visitor whose tracker is blocked.
- **Payload (server)** - `{ type: "event", payload: { website, hostname, url, referrer,
  language, ip, userAgent } }`: path plus only the five UTM parameters (`pageviewUrl` in
  lib/pageview-url.ts, shared with the client sanitiser), Referer without query, first
  Accept-Language tag, right-most public `X-Forwarded-For` address.
  `sendPageview` never rejects and never logs.
- **Loader** - components/analytics-loader.tsx (client, renders null, mounted in the locale
  layout). In an effect it injects, only when the choice is `full` and there is no GPC or DNT
  signal (lib/analytics-client.ts), `script.js` with `data-website-id`,
  `data-exclude-hash="true"`, `data-before-send="verbatraUmamiBeforeSend"` and
  `data-domains` set to the site hostname (the real script refuses to send on any other
  hostname, so a local run counts nothing), then `recorder.js` with only `data-website-id`. Both
  carry ids and are injected once. It listens for the same-tab event `verbatra:analytics-choice`:
  `full` injects without a reload, anything else reloads when the scripts are present (scripts
  cannot be unloaded). It re-checks the same rule on `pageshow` (back-forward cache
  restore) and when the tab becomes visible, so a withdrawal made in another tab or before a restore
  also reloads. It reads and writes no storage. There is no `next/script`, no inline
  code and no manifest hash change; external scripts are never hashed.
- **Sanitiser** - lib/analytics-sanitize.ts, exposed as `window.verbatraUmamiBeforeSend`: drops
  `screen`, rebuilds `url` as path plus the five UTM parameters (255 cap), strips query and hash
  from `referrer`, and drops a relative or unparsable `referrer` to `""` (internal referrers
  carry no value here, external ones keep origin and path). It covers `script.js` only. The
  recorder has no such hook and sends the full `location.href` with every replay and heatmap
  event, query and fragment included; `rr-block` hides DOM content, not the address. The policy
  says so (legal.privacy.s4.extended), and no URL is rewritten to hide it, so keep query
  strings out of internal links (the only query on the site is the privacy page `?analytics=`
  redirect).
- **CSP** - lib/security-headers.mjs adds `UMAMI_ORIGIN` to `script-src` and `connect-src`
  statically, in production and development. `img-src`, `frame-ancestors` (`'none'`) and
  `X-Frame-Options: DENY` are unchanged, so the Umami heatmap preview shows a blank canvas by
  decision. The choice is enforced by the loader and its tests, not by the CSP.
- **Consent prompt** - components/analytics-prompt.tsx: a non-blocking fixed region (bottom
  corner, no layout shift, about 30 percent of a 320x640 screen at most, buttons 44px), rendered
  only after hydration when there is no choice and no GPC or DNT signal, with equal-weight Allow
  and No thanks and a link to `/privacy#analytics`. It sits first in the body (early focus
  order) in the locale layout. While it shows it sets `data-analytics-prompt` and
  `--analytics-prompt-clearance` on `<html>`; app/global.css uses them for bottom padding and
  scroll padding (no focused element sits behind it) and hides the back-to-top button. Escape
  hides it for the page view and stores nothing. It posts to /api/analytics with `fetch`
  (`redirect: "manual"`), checks that the cookie arrived, hides and dispatches the choice event,
  or shows `analyticsPrompt.error` when the choice could not be saved. Strings: `analyticsPrompt.*`.
- **Privacy switch** - components/analytics-opt-out.tsx renders three plain forms (Allow
  extended analytics, Count page views only, Opt out) in section 4 of the policy; they work
  without JavaScript. After hydration it reads the cookie and marks the stored choice with
  `aria-pressed` and one status line (id `analytics-<choice>`), replacing the three `:target`
  fallbacks. app/api/analytics/route.ts takes the form POST (`choice=full|default|off`,
  `lang`), checks the Origin like the contact route, sets the choice cookie, clears the legacy
  one, and answers 303 to `/privacy?analytics=<choice>#analytics-<choice>` (locale prefixed
  except for English). The confirmation shows through `:target`. A footer link "Analytics
  settings" (`LEGAL_PAGE_LINKS` in components/landing/links.ts) reaches it from every page, so
  withdrawal is as easy as consent.
- **Events** - lib/analytics-events.ts has `trackEvent(name, data)`, a typed no-op that never
  throws or logs while the tracker is absent (`window.umami.track`). Click events are reported
  by one delegated listener (components/analytics-click-events.tsx,
  lib/analytics-click-events.ts) from markup, so Next `Link` soft navigation is never touched:

  | Event | Properties | Marked by |
  | --- | --- | --- |
  | `copy_code` | `surface`: code-block, command-row, ai-prompt, page-markdown | `data-copy-surface` on the copy button (or its actions region) |
  | `cta_click` | `id`: hero-quickstart, hero-compare; `locale` | `data-cta` |
  | `outbound_click` | `target`: github, npm, mcp-registry, other; `from`: header, footer, landing, docs, legal | any `<a target="_blank">` to another origin |

  Property values are allowlisted constants, never link text, queries, code or form values.
  `data-umami-event` is not used: on an anchor without `_blank` the real tracker calls
  `preventDefault()` and navigates itself, which breaks `Link`.
- **Replay masking** - the Umami dashboard sets mask level `moderate` (all inputs masked). Markup
  carries `rr-block` on the contact form, the opt-out panel and the consent prompt. The recorder
  runs on every route otherwise (legal pages included); a soft navigation cannot un-record a
  page, which is why those three blocks are in markup.
- **Not used on purpose** - `umami.identify()`, `data-distinct-id`, `data-performance`,
  `data-errors`, `data-tag`, reading `umami.disabled`.
- **Kill switch** - turning replay and heatmaps off in the Umami website settings stops
  recording without a deploy (the recorder fetches its config first).
- **Retention** - the policy promises replays and heatmaps 30 days and page view and event rows
  13 months (legal.privacy.s4.retention). Both periods depend on the owner enforcing them on the
  Umami server (replay retention, and scheduled deletion of older rows if the self-hosted version
  has no retention setting); the site code cannot delete anything.
- **Accepted limits** - the tiers measure different things: Tier 0 counts document loads only,
  Tier 1 counts soft navigations too, so the two series are not comparable. Visitors with a
  blocker on Tier 1 are not counted at all.

## Common Mistakes

| Mistake | Correct Pattern |
| --- | --- |
| Loading `script.js` or `recorder.js` anywhere but the loader, or before the choice is `full` | The loader is the only injector; the stock tracker sends `screen` and the recorder ignores DNT, GPC and `umami.disabled` |
| Putting `data-umami-event` on an internal anchor | Mark the element for the delegated listener; the real tracker breaks `Link` otherwise |
| Free text, queries, code or form values in an event | Allowlisted constants only; add the value to the typed lists in lib/analytics-events.ts |
| Counting in a route handler or page | Count only in proxy.ts through `countedPageview`, so prefetch and RSC rules stay in one place |
| Server counting for a `full` visitor | `countedPageview` must skip it, or one visit counts twice |
| Making the choice cookie HttpOnly | The loader and prompt read it in the browser; the policy says why it is readable |
| Adding another cookie, localStorage or sessionStorage write (including a fumadocs `persist` or `groupId`) | Name it, say when it is written and that it is never sent in legal.privacy.s5 in every locale, and pin it in privacy/page.test.tsx |
| Widening the CSP beyond the Umami origin, or loosening `frame-ancestors` | The heatmap blank canvas is accepted; any other origin fails csp-smoke |
| Putting a query string on an internal link | The recorder sends `location.href` unsanitised |
| Logging a failed send | `sendPageview` and `trackEvent` stay silent: no IP, user agent or error text |
| Changing what is counted or recorded without the policy | Update legal.privacy.s2, s4, s5, s6 and the objection section in every locale and verbatra.lock.json in the same change, through `verbatra export` and `verbatra import`, never `pnpm i18n` for hand-maintained legal text |
| Pinning a replay sample rate or percentage in the policy | Say "a sample of sessions"; the rate lives in the Umami dashboard |

## Tests

lib/server-pageview.test.ts, proxy.pageview.test.ts, proxy.cookies.test.ts (migration),
lib/analytics-choice.test.ts, lib/analytics-client.test.ts, lib/analytics-sanitize.test.ts,
components/analytics-loader.test.tsx, components/analytics-prompt.test.tsx,
components/analytics-opt-out.test.tsx, lib/analytics-events.test.ts,
lib/analytics-click-events.test.ts, components/analytics-click-events.test.tsx,
app/api/analytics/route.test.ts, lib/security-headers.test.ts and proxy.csp.test.ts (Umami origin
in exactly `script-src` and `connect-src`), lib/inline-script-hashes.test.ts, the privacy page
tests under app/[lang]/(legal)/, and e2e/analytics.spec.ts. The e2e and scripts/csp-smoke.mjs
answer the Umami origin with the stubs in scripts/umami-stub.mjs and never reach the real host.

Before a deploy, run csp-smoke once by hand against the real `script.js` and `recorder.js`
downloaded to an untracked path (the recorder contains a blob worker string), and put the result
in the PR description.
