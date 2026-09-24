---
"@verbatra/studio": patch
---

Remove an unused `Not Implemented` response body constant from the Studio server.

Previously the server module declared it although no route ever answered with it.

Now it is gone. No response, route, or exported type changes.
