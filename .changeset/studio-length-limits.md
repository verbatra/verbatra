---
"@verbatra/studio": minor
---

Set, change and remove a key's length limit from the translation editor in Studio.

- **Where:** under the length line of the translation editor (the key pane and drawer on Translations, and the Review dialog). **Set limit** and **Change limit** take a whole number of characters from 1 to 9007199254740991, and **Remove limit** takes the key's entry out of `verbatra.limits.json`. The limit applies to the key in every locale.
- **Whose limit it is:** a limit from the config's `maxLength` is shown read-only and says it comes from the config, because the config wins. Studio read the config when it started, so a change to it needs a restart of Studio. A limit from `verbatra.limits.json` can be changed.
- **A file Studio cannot use:** when `verbatra.limits.json` is corrupt, too large, from a newer verbatra, not a regular file or not readable, the editor shows why and what to do, and offers no control until it is fixed. A failed save shows the error with its next step.
- **Always current:** Studio watches `verbatra.limits.json`, so a limit changed with the CLI, an editor or git shows up without a reload. A refresh never drops a limit you are typing, a draft translation or your focus.
- **Unsaved work:** a limit you are typing counts as unsaved, like a draft translation. Leaving the key, the editor or the page asks first, names the limit, and Save saves the translation and then the limit.
- **Advisory:** a limit never blocks a save or shortens a value. The length line shows the count at once, and translate runs flag a value over the limit for review.
- **Generated plural forms:** Studio sets limits only for keys in the source file, so a generated plural form gets no control. A limit written for its own key in the config or in `verbatra.limits.json` still applies.
