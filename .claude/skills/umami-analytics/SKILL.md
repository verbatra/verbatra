---
name: umami-analytics
description: 'Self-hosted Umami analytics configuration and verification for the verbatra docs site (apps/docs). Use when updating the Umami script tag, website ID, or tracker attributes in apps/docs/app/[lang]/layout.tsx, or when adding data-umami-event tracking to docs UI elements.'
license: MIT
metadata:
  author: verbatra
  version: '1.0'
  source: 'internal'
user-invocable: false
---

# Umami Analytics (apps/docs)

## Overview

apps/docs embeds a single self-hosted Umami tracker in the root layout
(apps/docs/app/[lang]/layout.tsx). It sets no cookies, but it is not free of personal
data: the Umami server derives a pseudonymous session hash and an approximate location
from the visitor's IP address and user agent. The privacy page describes exactly what it
reads and processes in legal.privacy.s4 (apps/docs/messages/*.json) and renders the
opt-out control there. This skill covers the one file that
holds the embed, verifying a website ID or host change, and the pattern for adding
new tracked events.

**When to use:** rotating or changing the Umami data-website-id or script host,
adding data-umami-event tracking to a new docs UI element, verifying the tracker
loads correctly after a change.

**When NOT to use:** general Next.js Script component questions unrelated to Umami,
GDPR/privacy-policy wording changes (that is prose content in messages/*.json, not
this skill's concern).

## Key Concepts

- **Self-hosted host** - the tracker script and API both live at
  https://umami.kreitz-webdev.de (script.js). No data-host-url override is needed
  because the script is already served from the self-hosted domain, not
  cloud.umami.is.
- **Website ID** - a UUID identifying one tracked site in the Umami instance. Lives
  only as a literal string in the Script component's data-website-id prop; there is
  no env var or config file for it.
- **Script strategy** - next/script's afterInteractive strategy is correct for
  Umami: it loads after hydration, so it never blocks the first paint or
  interactivity, and Umami has no reason to load before interactive (unlike, say, a
  consent-gating script).
- **Counted host and hashes** - data-domains is the production host (SITE_HOST from
  lib/site.ts), so localhost and preview deployments send nothing, and
  data-exclude-hash="true" keeps TOC anchors from splitting one page into many URLs.
  app/[lang]/layout.test.tsx pins both.
- **Do Not Track** - the Script carries data-do-not-track="true", so the tracker sends
  nothing when the browser signals Do Not Track. Keep it; the privacy page promises it
  and app/[lang]/layout.test.tsx fails without it.
- **Opt-out** - the tracker sends nothing while localStorage holds the key
  umami.disabled with any non-empty value. components/analytics-opt-out.tsx sets and clears it
  through the helpers in lib/umami.ts; do not write the key anywhere else.
- **Automatic SPA tracking** - Umami's tracker watches pushState/replaceState/popstate
  and sends a pageview on every client-side route change automatically. Do not add a
  manual umami.track() call on route change; that produces duplicate pageviews.
- **Event tracking** - two mechanisms, both real Umami APIs:
  - Declarative: data-umami-event="name" plus data-umami-event-key="value" attributes
    on a plain `<a>` or `<button>`. All values become strings.
  - Programmatic: trackUmamiEvent(name, data) from lib/umami.ts inside an event
    handler, for dynamic or typed values (string, number, boolean). Event names are
    capped at 50 characters.
- **Internal links are programmatic only** - the tracker calls preventDefault on a
  same-tab `<a data-umami-event>` and navigates by setting location.href after the
  request, which turns a next/link client navigation into a full reload and delays a
  plain one. Track an internal link with TrackedLink or TrackedAnchor (plain `<a>`,
  for files such as /llms.txt) from components/ui/tracked-link.tsx, or
  `<Button href track>`; both count a click and a middle-click. Declarative
  attributes stay on external `target="_blank"` links and on buttons.
  components/umami-events.test.tsx fails on data-umami-event on a Link, LinkItem or
  Button href (literal or through a spread helper) and on any rendered same-tab
  internal anchor that carries one.
- **Naming** - verb-object kebab-case names (copy-, select-, click-, open-, run-,
  reset-, install-, toggle-), and the page area goes in a `location` property, never
  in the name. outbound-link and locale-switch keep their established names, so their
  dashboard series stay continuous.

## Event catalogue

| Event | Properties | Where (location values) |
| --- | --- | --- |
| outbound-link | target, location | hero (site-messages, version, license), header (github, sent from onClick; version, the landing version pill), loop (skills-repo), control (evidence), faq (releases), footer (footer links, contributor, github, npm) |
| click-cta | location, target | header, hero, marquee, formats, loop, final-cta, docs-home (tabs, path, feature and stack cards), docs-page (stack cards) |
| copy-command | command, location | how, loop, start-here, docs-page (CommandLine) |
| copy-install-command | command, manager ("npm"), location | hero, final-cta |
| copy-ai-prompt | location | hero, start-here, docs-home |
| copy-code | location | docs-page (MDX code block copy button) |
| copy-page-markdown | location | docs-page |
| open-page-options | location | docs-page (only when the popover opens) |
| select-tab | tab, location, framework (a framework chip only) | hero, formats |
| run-scenario | scenario, location, break (drop, rename or add; the break scenario only), retry (true on a retry only) | showcase |
| reset-showcase | location | showcase |
| open-faq | question (item key, never the text), location | faq |
| toggle-marquee | state, location | marquee |
| install-mcp | client, location | docs-page |
| locale-switch | from, to (only when they differ) | language menu |

A new event or property also updates legal.privacy.s4 in all four locales when it
adds an interaction category the text does not name yet.

## Quick Reference

| Task                              | Location                                                    |
| ---------------------------------- | ------------------------------------------------------------ |
| Change the website ID or host      | apps/docs/app/[lang]/layout.tsx, the Script component        |
| Update preconnect/dns-prefetch     | apps/docs/app/[lang]/layout.tsx, the two <link> tags in head  |
| Add a declarative click event      | data-umami-event="..." on a plain `<a>` or `<button>` (never on a Link) |
| Add a dynamic/typed event          | trackUmamiEvent("name", { ... }) inside the onClick handler   |
| Track an internal link             | TrackedLink, TrackedAnchor or `<Button href track={{ name, data }}>` |
| Verify the tracker loaded          | open the deployed page, check Network for a script.js request to the self-hosted host, then check the Umami dashboard's Realtime view for a session |
| Privacy policy wording for Umami   | apps/docs/messages/{en,de,es,fr}.json, legal.privacy.s4 (update all four locales together, per docs.md) |

## Common Mistakes

| Mistake                                                        | Correct Pattern                                                             |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Using strategy="beforeInteractive" for the Umami script          | Use "afterInteractive"; analytics scripts never need to block hydration    |
| Manually calling umami.track() on every route change              | Umami's tracker already auto-tracks SPA navigations; don't duplicate it    |
| Editing the website ID in an env var or config file                | It is a literal prop value in layout.tsx; there is no env var for it       |
| Adding a data-host-url override                                    | Not needed; the script is already served from the self-hosted domain      |
| Updating the English privacy-policy Umami paragraph only            | Update de.json, es.json, fr.json in the same change (docs.md rule)         |
| Assuming Umami auto-tracks outbound link clicks                     | It does not; add data-umami-event="outbound-link" with target and location to each external <a> tag |
| data-umami-event on a next/link                                      | It forces a full reload; use TrackedLink's track prop instead             |
| Putting the page area in the event name                              | Use one verb-object name and a location property                          |
