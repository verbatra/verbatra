---
"@verbatra/studio": minor
---

Search and replace text across your translations from the Translations page.

- **Two steps:** **Search and replace** asks for the text to find, the text to put in its place, whether case must match and which locales to search. It lists up to 1,000 matching values with the locale, a status, and the value before and after. Studio says when more matched than it lists. Nothing is written until you confirm the list.
- **What is left alone:** values a person wrote, imported or changed outside verbatra, and keys that match `pinnedKeys`, stay out unless you tick **Also change** for them in that run. The boxes start unticked every time and are never remembered. A value that would break the integrity gate, or grow past 20,000 characters, is listed with its reason and not changed.
- **A result per value:** after you apply, Studio lists what happened to each value: replaced, skipped, refused, or not changed because the value changed since the preview. A locale that could not be finished is named with its reason; when its file was already written, Studio says the new values are saved and to review the locale before you search again.
- **Literal and local:** the text is matched literally, never as a pattern, so `$&` in the replacement is inserted as typed. Studio records every replaced value as written by a person (`human`); it cannot tell who clicked, so that is a statement about this surface, not a check. No WebMCP tool is registered for it. While the key editor holds an unsaved edit, **Search and replace** first asks you to save or discard it.
