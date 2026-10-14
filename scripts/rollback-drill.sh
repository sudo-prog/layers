#!/usr/bin/env bash
# rollback-drill.sh — Simulate a rollback for LAYERS Stage 2.5 launch readiness.
#
# This script does NOT perform a real rollback in production. It verifies that
# the project CAN be rolled back by:
#   1. Creating a temporary git tag at the current HEAD (simulating "current release")
#   2. Checking out the previous tag (simulating "rollback target")
#   3. Running the build and test suite against the old version
#   4. Reporting pass/fail for each step
#
# Usage:
#   chmod +x scripts/rollback-drill.sh
#   ./scripts/rollback-drill.sh [previous-tag]
#
# If no tag is provided, the script lists available tags and exits.
#
# Exit codes:
#   0 — All checks passed (rollback would succeed)
#   1 — One or more checks failed
#   2 — Pre-flight error (no tags, build failure, etc.)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info()  { echo -e "${BLUE}[INFO]${NC}  $1"; }
log_ok()    { echo -e "${GREEN}[PASS]${NC}  $1"; }
log_fail()  { echo -e "${RED}[FAIL]${NC}  $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }

# Counters
CHECKS_PASSED=0
CHECKS_FAILED=0

pass() { log_ok "$1"; CHECKS_PASSED=$((CHECKS_PASSED + 1)); }
fail() { log_fail "$1"; CHECKS_FAILED=$((CHECKS_FAILED + 1)); }

# ─── Pre-flight ──────────────────────────────────────────────────────────────

echo "══════════════════════════════════════════════════════════════"
echo "  LAYERS Rollback Drill"
echo "  Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "  Repo: $REPO_ROOT"
echo "══════════════════════════════════════════════════════════════"
echo ""

# Check git repo
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    log_fail "Not a git repository"
    exit 2
fi

# Fetch tags (in case we're on a fresh clone)
log_info "Fetching tags..."
git fetch --tags --quiet 2>/dev/null || log_warn "Could not fetch tags (offline?)"

# List available tags
TAGS=$(git tag --sort=-creatordate 2>/dev/null || true)
if [ -z "$TAGS" ]; then
    log_fail "No git tags found. Tag a release before running this drill."
    echo ""
    echo "Available commits for tagging:"
    git log --oneline -5
    exit 2
fi

TAG_COUNT=$(echo "$TAGS" | wc -l | tr -d ' ')
log_info "Found $TAG_COUNT tag(s)"
echo ""

# Determine rollback target
if [ $# -ge 1 ]; then
    ROLLBACK_TAG="$1"
    if ! git rev-parse "$ROLLBACK_TAG" > /dev/null 2>&1; then
        log_fail "Specified tag '$ROLLBACK_TAG' does not exist"
        exit 2
    fi
else
    # Default: second most recent tag (the "previous release")
    ROLLBACK_TAG=$(echo "$TAGS" | sed -n '2p')
    if [ -z "$ROLLBACK_TAG" ]; then
        log_warn "Only one tag found. Using it as rollback target."
        ROLLBACK_TAG=$(echo "$TAGS" | head -1)
    fi
fi

CURRENT_TAG=$(echo "$TAGS" | head -1)
CURRENT_COMMIT=$(git rev-parse --short HEAD)
ROLLBACK_COMMIT=$(git rev-parse --short "$ROLLBACK_TAG" 2>/dev/null || echo "unknown")

log_info "Simulated current release: $CURRENT_TAG (or HEAD $CURRENT_COMMIT)"
log_info "Rollback target:           $ROLLBACK_TAG ($ROLLBACK_COMMIT)"
echo ""

# ─── Step 1: Create temporary release tag at HEAD ────────────────────────────

TEMP_TAG="drill-release-$(date +%Y%m%d-%H%M%S)"
log_info "Step 1: Creating temporary tag $TEMP_TAG at HEAD..."

if git tag "$TEMP_TAG" HEAD 2>/dev/null; then
    pass "Created temporary release tag: $TEMP_TAG"
else
    # Tag might exist from a previous drill
    log_warn "Tag $TEMP_TAG already exists (from previous drill). Deleting and recreating..."
    git tag -d "$TEMP_TAG" > /dev/null
    git tag "$TEMP_TAG" HEAD
    pass "Created temporary release tag: $TEMP_TAG (recreated)"
fi

# ─── Step 2: Simulate rollback (checkout old tag) ────────────────────────────

echo ""
log_info "Step 2: Checking out rollback target $ROLLBACK_TAG..."

# Store current branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

if git checkout "$ROLLBACK_TAG" --quiet 2>&1; then
    pass "Checked out $ROLLBACK_TAG"
else
    log_fail "Failed to checkout $ROLLBACK_TAG"
    fail "Rollback checkout"
    # Attempt to return to original branch
    git checkout "$CURRENT_BRANCH" --quiet 2>/dev/null || true
    git tag -d "$TEMP_TAG" > /dev/null 2>&1 || true
    exit 1
fi

# ─── Step 3: Verify old version builds ──────────────────────────────────────

echo ""
log_info "Step 3: Installing dependencies for old version..."

if pnpm install --frozen-lockfile --quiet 2>&1; then
    pass "Dependencies installed"
else
    log_warn "Frozen lockfile install failed, trying regular install..."
    if pnpm install --quiet 2>&1; then
        pass "Dependencies installed (regular)"
    else
        log_fail "pnpm install failed"
        fail "Dependencies installed"
        git checkout "$CURRENT_BRANCH" --quiet
        git tag -d "$TEMP_TAG" > /dev/null 2>&1 || true
        exit 1
    fi
fi

echo ""
log_info "Step 4: Building old version..."

BUILD_OK=true
if pnpm build 2>&1; then
    pass "Build succeeded (old version)"
else
    log_fail "Build failed (old version)"
    fail "Build"
    BUILD_OK=false
fi

# ─── Step 4: Run tests against old version ───────────────────────────────────

echo ""
log_info "Step 5: Running tests against old version..."

TEST_OK=true
if pnpm test 2>&1; then
    pass "Tests passed (old version)"
else
    log_fail "Tests failed (old version)"
    fail "Tests"
    TEST_OK=false
fi

# ─── Step 5: Return to original state ───────────────────────────────────────

echo ""
log_info "Step 6: Returning to original state..."

# Return to original branch
if git checkout "$CURRENT_BRANCH" --quiet 2>&1; then
    pass "Returned to $CURRENT_BRANCH"
else
    log_fail "Could not return to $CURRENT_BRANCH"
    fail "Return to branch"
fi

# Remove temporary tag
if git tag -d "$TEMP_TAG" > /dev/null 2>&1; then
    pass "Cleaned up temporary tag: $TEMP_TAG"
else
    log_warn "Could not delete temporary tag $TEMP_TAG"
    fail "Cleanup"
fi

# Reinstall deps for current version
log_info "Reinstalling dependencies for current version..."
pnpm install --frozen-lockfile --quiet 2>&1 || pnpm install --quiet 2>&1 || log_warn "Reinstall warning"

# ─── Summary ────────────────────────────────────────────────────────────────

echo ""
echo "══════════════════════════════════════════════════════════════"
echo "  Rollback Drill Summary"
echo "══════════════════════════════════════════════════════════════"
echo ""
echo "  Checks passed: $CHECKS_PASSED"
echo "  Checks failed: $CHECKS_FAILED"
echo ""

if [ "$CHECKS_FAILED" -eq 0 ] && [ "$BUILD_OK" = true ] && [ "$TEST_OK" = true ]; then
    log_ok "DRILL PASSED — Rollback to $ROLLBACK_TAG would succeed."
    echo ""
    echo "  When a real rollback is needed:"
    echo "    1. git checkout $ROLLBACK_TAG"
    echo "    2. pnpm install && pnpm build && pnpm test"
    echo "    3. Deploy the built artifacts"
    echo "    4. git tag rollback-\$(date +%Y%m%d) $ROLLBACK_TAG  # mark the rollback"
    exit 0
else
    log_fail "DRILL FAILED — Rollback would NOT succeed cleanly."
    echo ""
    echo "  Resolve the failures above before launching."
    exit 1
fi
