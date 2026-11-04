---
"@verbatra/studio": patch
---

Studio uses the verbatra site palette and the Geist typeface, and follows the system theme without a flash on load.

- **Look:** colors, corner radii, shadows, type, buttons, badges, cards and form fields now match the verbatra site, in light and dark.
- **Theme:** the stored or system theme is applied before the first paint, so a reload no longer flashes the wrong theme.
- **Badges:** Changed now uses the site amber, Protected moved to a teal tone and Missing has its own blue, so the three stay distinct from each other and from the accent.
- **Theme toggle:** one button in the header cycles system, light and dark with the site icons. Its tooltip and name state the current mode and the next one, the first click always changes the look, and the new mode is announced to screen readers.
- **Tooltips:** tooltips show on keyboard focus as well as hover and close with Escape.
- **Dialogs:** Tab and Shift+Tab stay inside an open drawer or dialog even after a click on plain text moved focus out of it.
- **Key details:** closing the entry editor with Escape puts focus back on the Edit button of the locale you edited, and the header buttons are 44px tall on small screens.
