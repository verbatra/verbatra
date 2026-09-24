---
"@verbatra/sdk": patch
---

Stop writing an empty target file for a new locale whose every key was withheld.

Previously a first run for a locale with no target file wrote an empty file (`{}` for JSON) even
when every translation failed the integrity check, every provider request failed, or the token
budget withheld them all.

Now no file is created in that case, so the locale keeps reporting its keys as missing and the next
run retries them. A new locale with nothing to translate is still created, and a run that keeps at
least one key writes the file as before.
