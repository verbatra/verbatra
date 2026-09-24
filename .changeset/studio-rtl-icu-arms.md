---
"@verbatra/studio": patch
---

Lay out right-to-left text inside ICU messages in reading order and preview right-to-left edits.

Previously a whole ICU plural or select message was isolated as one left-to-right run, so right-to-left text inside its branches was laid out left to right, and editing a right-to-left value showed markup and ICU syntax out of order.

Now only the ICU syntax is isolated left to right while each branch's text follows the value's direction, the edit dialog shows a live read-only preview under the text area for right-to-left locales, and segmenting a value stays linear on adversarial input.
