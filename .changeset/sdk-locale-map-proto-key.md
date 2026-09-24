---
"@verbatra/sdk": patch
---

Refuse a `__proto__` key in `provider.options.localeMap` like any other unconfigured locale.

Previously a JSON or YAML config whose `localeMap` named `__proto__` loaded cleanly, because
parsing dropped the key before the check that every key is a configured locale could see it. Config
loading now checks the keys as written and fails with `CONFIG_INVALID`, naming the key.
