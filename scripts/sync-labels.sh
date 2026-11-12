#!/usr/bin/env bash
set -euo pipefail

repo="${1:?usage: scripts/sync-labels.sh <owner/repo>}"

existing_labels() {
  gh label list -R "$repo" --limit 500 --json name --jq '.[].name'
}

rename_label() {
  local from="$1" to="$2" names
  names="$(existing_labels)"
  if grep -Fxq -- "$from" <<<"$names" && ! grep -Fxq -- "$to" <<<"$names"; then
    gh label edit "$from" -R "$repo" --name "$to"
  fi
}

upsert_label() {
  gh label create "$1" -R "$repo" --force --color "$2" --description "$3"
}

rename_label "bug" "type: bug"
rename_label "enhancement" "type: feature"
rename_label "documentation" "type: docs"
rename_label "question" "type: question"
rename_label "duplicate" "resolution: duplicate"
rename_label "invalid" "resolution: invalid"
rename_label "wontfix" "resolution: wontfix"

upsert_label "type: bug" d73a4a "Something does not work as documented"
upsert_label "type: feature" a2eeef "A new capability or an improvement"
upsert_label "type: docs" 0075ca "Documentation only"
upsert_label "type: performance" fbca04 "Speed, memory or token cost"
upsert_label "type: maintenance" ededed "Refactor, tests, build, CI or tooling, no user-visible change"
upsert_label "type: question" d876e3 "A question; usually moved to Discussions"
upsert_label "breaking change" b60205 "Changes released behavior; the changeset needs an Upgrade: bullet"

for scope in cli sdk studio mcp docs providers formats action skills ci; do
  upsert_label "scope: $scope" c5def5 "Touches the $scope area"
done

upsert_label "needs triage" e4e669 "Not looked at yet"
upsert_label "needs reproduction" f9d0c4 "Closes after 21 days without a reproduction"
upsert_label "needs info" f9d0c4 "Waiting on the reporter; closes after 21 days"
upsert_label "status: accepted" 0e8a16 "Confirmed and planned"
upsert_label "status: blocked" 5319e7 "Waiting on an upstream fix or a decision"
upsert_label "stale" cfd3d7 "Set by the timer before it closes"
upsert_label "resolution: duplicate" cfd3d7 "Already tracked elsewhere"
upsert_label "resolution: invalid" cfd3d7 "Not a verbatra problem"
upsert_label "resolution: wontfix" cfd3d7 "Will not be worked on"
