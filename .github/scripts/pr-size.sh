#!/usr/bin/env bash
# Reviewable size: added+deleted lines in `git diff -M <base>...<head>`. Pure renames count 0,
# renames-with-edits count only the edits; lockfiles/generated output excluded; tests counted
# (and reported separately). Usage: .github/scripts/pr-size.sh origin/<base-branch> [<head>]
set -euo pipefail
base=${1:?usage: pr-size.sh <base> [<head>]}; head=${2:-HEAD}
soft=${PR_SIZE_SOFT:-1000}; hard=${PR_SIZE_HARD:-1500}
read -r total tests < <(
  git diff -M --numstat "$base...$head" -- . \
    ':(exclude,glob)**/pnpm-lock.yaml' ':(exclude,glob)**/uv.lock' \
    ':(exclude,glob)**/src/lib/paraglide/**' ':(exclude,glob)**/__snapshots__/**' \
    ':(exclude,glob)**/*.snap' ':(exclude,glob)apps/frontend/static/r/**' |
  awk -F'\t' '$1 != "-" { n = $1 + $2; total += n
      if ($3 ~ /(\.test\.|\.spec\.|__tests__\/|^e2e\/)/) tests += n }
    END { printf "%d %d\n", total, tests }')
msg="$total reviewable lines ($((total - tests)) source/docs/i18n + $tests tests); soft $soft, hard $hard"
echo "PR size: $msg"
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then echo "### PR size: $msg" >> "$GITHUB_STEP_SUMMARY"; fi
if [ "$total" -gt "$hard" ] && [ "${PR_SIZE_OVERRIDE:-false}" != "true" ]; then
  echo "::error title=PR too large::$msg. Split into a stack, or label size/override for mechanical changes."; exit 1
elif [ "$total" -gt "$soft" ]; then
  echo "::warning title=Large PR::$msg. Consider splitting."
fi
