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
(apps/docs/app/[lang]/layout.tsx). It is cookieless, collects no personal data, and
needs no consent banner (see apps/docs/messages/en.json, legal.privacy.s5/s6 for the
GDPR basis already documented on /privacy). This skill covers the one file that
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
- **Automatic SPA tracking** - Umami's tracker watches pushState/replaceState/popstate
  and sends a pageview on every client-side route change automatically. Do not add a
  manual umami.track() call on route change; that produces duplicate pageviews.
- **Event tracking** - two mechanisms, both real Umami APIs:
  - Declarative: data-umami-event="name" plus data-umami-event-key="value" attributes
    on any element. All values become strings.
  - Programmatic: window.umami.track(name, data) inside an event handler, for
    dynamic or typed values. Event names are capped at 50 characters.

## Quick Reference

| Task                              | Location                                                    |
| ---------------------------------- | ------------------------------------------------------------ |
| Change the website ID or host      | apps/docs/app/[lang]/layout.tsx, the Script component        |
| Update preconnect/dns-prefetch     | apps/docs/app/[lang]/layout.tsx, the two <link> tags in head  |
| Add a declarative click event      | data-umami-event="..." on the target element's JSX           |
| Add a dynamic/typed event          | window.umami?.track("name", { ... }) inside the onClick handler |
| Verify the tracker loaded          | open the deployed page, check Network for a script.js request to the self-hosted host, then check the Umami dashboard's Realtime view for a session |
| Privacy policy wording for Umami   | apps/docs/messages/{en,de,es,fr}.json, legal.privacy.s5.body (update all four locales together, per docs.md) |

## Common Mistakes

| Mistake                                                        | Correct Pattern                                                             |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Using strategy="beforeInteractive" for the Umami script          | Use "afterInteractive"; analytics scripts never need to block hydration    |
| Manually calling umami.track() on every route change              | Umami's tracker already auto-tracks SPA navigations; don't duplicate it    |
| Editing the website ID in an env var or config file                | It is a literal prop value in layout.tsx; there is no env var for it       |
| Adding a data-host-url override                                    | Not needed; the script is already served from the self-hosted domain      |
| Updating the English privacy-policy Umami paragraph only            | Update de.json, es.json, fr.json in the same change (docs.md rule)         |
| Assuming Umami auto-tracks outbound link clicks                     | It does not; add data-umami-event manually to each external <a> tag       |
