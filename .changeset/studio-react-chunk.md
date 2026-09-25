---
"@verbatra/studio": patch
---

Split the dashboard's React runtime into its own script file.

Previously the dashboard shipped as one 509 kB script, over the size the build warns about. React
and React DOM now load from a second same-origin file that the page preloads, so no script is
over 500 kB and the dashboard still runs under its `script-src 'self'` policy.
