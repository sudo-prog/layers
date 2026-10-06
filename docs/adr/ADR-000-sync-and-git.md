# ADR-000 — Sync & Git Strategy

## Context
LAYERS uses two private GitHub repos: `layers` (code) and `layers-vault` (Obsidian vault). Both hosted under `sudo-prog`. GitHub Free plan limits apply.

## Decision
- Git host: ThinkPad commits for both agents (BE and FE)
- Branch protection: enforce_admins=true, pre-push hook blocks direct push to main, PR discipline required
- Fallback pre-push hook installed (works on Free plan)
- Syncthing syncs working trees: `layers-code` (id) -> `$LAYERS_CODE`, `layers-vault` (id) -> `$LAYERS_VAULT`
- Mac is read-only for git (never commits/pushes)

## GitHub Free Plan Limitations
- No branch protection/rulesets on private repos
- No CODEOWNERS enforcement
- No secret scanning
- Dependabot alerts are free
- Vulnerability alerts + automated security fixes enabled

## Protection Probe Result
TBD - will probe after repo creation.

## Next Steps
- Create both private repos (T-BE-001)
- Add vault remote (H-M-003 §1)
- Install fallback pre-push hook (H-M-002 §8)
- Probe real branch protection (H-M-002 §8)
- Enable vulnerability alerts + automated security fixes
