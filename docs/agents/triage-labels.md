# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the strings
this repo uses.

The issue tracker is local markdown (see `issue-tracker.md`), so these are values of the `Status:`
line in an issue file, not GitHub labels. Three of them reuse the names of this repo's existing
GitHub labels so the vocabulary stays the same in both places. The skills create no GitHub labels.

| Label in mattpocock/skills | String in our tracker | Meaning                                  |
| -------------------------- | --------------------- | ---------------------------------------- |
| `needs-triage`             | `needs triage`        | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs info`          | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`     | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`     | Requires human implementation            |
| `wontfix`                  | `resolution: wontfix` | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), write the corresponding
string from this table, for example `Status: ready-for-agent`.
