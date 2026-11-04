---
"@verbatra/studio": patch
---

Studio uses the verbatra site palette and the Geist typeface, and follows the system theme without a flash on load.

- **Look:** colors, corner radii, shadows, type, buttons, badges, cards and form fields now match the verbatra site, in light and dark.
- **Theme:** the stored or system theme is applied before the first paint, so a reload no longer flashes the wrong theme.
- **Badges:** Changed now uses the site amber, and Protected moved to a teal tone, so the two stay distinct.
- **Theme toggle:** one button in the top bar cycles system, light and dark with the site icons, and its name states the current mode and the next one.
- **Tooltips:** the collapsed navigation tooltips are now read by screen readers, show on keyboard focus as well as hover, and close with Escape.
- **Dialogs:** Tab and Shift+Tab stay inside an open drawer or dialog even after a click on plain text moved focus out of it.
