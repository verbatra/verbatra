---
"@verbatra/sdk": patch
---

Keep a third-party adapter's own error message out of the `ADAPTER_FAILED` message.

Previously the `ADAPTER_FAILED` message quoted the plugin's error, which for a parser can quote the
file being read, against the `AdapterError` contract that a message never carries file contents.

Now the message names only the format and the method that failed, and the plugin's error stays
available as the `cause`.
