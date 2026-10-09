#!/usr/bin/env bash
# Ownership check: verify changed files match CODEOWNERS rules.
# Blocks commits that modify files owned by the wrong agent.
#
# Usage: bash .github/scripts/ownership-check.sh
# Environment: GITHUB_SHA (commit to check), CODEOWNERS file at repo root

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CODEOWNERS="$REPO_ROOT/CODEOWNERS"

if [ ! -f "$CODEOWNERS" ]; then
  echo "ERROR: CODEOWNERS not found at $CODEOWNERS"
  exit 1
fi

# Get changed files from the commit
if [ -z "${GITHUB_SHA:-}" ]; then
  # Local: check staged files
  changed_files=$(git -C "$REPO_ROOT" diff --cached --name-only)
else
  # CI: check files changed in the commit
  changed_files=$(git -C "$REPO_ROOT" diff-tree --no-commit-id --name-only -r "$GITHUB_SHA")
fi

if [ -z "$changed_files" ]; then
  echo "No changed files to check."
  exit 0
fi

# Parse CODEOWNERS: extract path patterns and their owners
# Format: /path/ @owner
declare -A be_patterns
declare -A fe_patterns

current_section=""
while IFS= read -r line; do
  # Skip comments and empty lines
  [[ "$line" =~ ^#.*$ ]] && continue
  [[ -z "$line" ]] && continue

  # Track section headers
  if [[ "$line" =~ ^#\ BE\ owns: ]]; then
    current_section="be"
    continue
  elif [[ "$line" =~ ^#\ FE\ owns: ]]; then
    current_section="fe"
    continue
  elif [[ "$line" =~ ^# ]]; then
    current_section=""
    continue
  fi

  # Extract pattern (first field)
  pattern=$(echo "$line" | awk '{print $1}')
  [ -z "$pattern" ] && continue

  # Normalize: strip leading /
  norm="${pattern#/}"

  case "$current_section" in
    "be") be_patterns["$norm"]=1 ;;
    "fe") fe_patterns["$norm"]=1 ;;
  esac
done < "$CODEOWNERS"

# Check each changed file
errors=0
while IFS= read -r file; do
  [ -z "$file" ] && continue

  # Check if file matches any FE pattern
  for pattern in "${!fe_patterns[@]}"; do
    if [[ "$file" == "$pattern"* ]]; then
      echo "ERROR: FE-owned file changed: $file (pattern: /$pattern/)"
      echo "  -> This file is owned by the Mac agent. Commit from the Mac."
      errors=$((errors + 1))
      break
    fi
  done
done <<< "$changed_files"

if [ $errors -gt 0 ]; then
  echo ""
  echo "Ownership check FAILED: $errors file(s) violate CODEOWNERS rules."
  exit 1
fi

echo "Ownership check PASSED: all changed files respect CODEOWNERS."
exit 0
