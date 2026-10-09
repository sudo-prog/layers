---
type: agent-instructions
---
# LAYERS — Workspace Instructions (both agents; copy to the code repo root and Hermes workspace)

Mission: build LAYERS per the vault. Philosophy: DO MORE WITH LESS — every change removes, merges, or justifies complexity and reports the Efficiency Ledger delta.

**Session ritual (mandatory):** `python3 tools/lv.py start <AGENT>` at the start; `python3 tools/lv.py end <AGENT>` at the end. Vault path: set `LAYERS_VAULT` or run from the vault root.

**Hard rules**
1. Mobile budget ≤ 8 passes (target 6), ≥ 30 fps at 1024–1536 px. AI never ships to mobile.
2. Presets/projects are JSON, Git-versioned. Media goes through Immich only; JSON stores asset IDs.
3. Edit only owned paths ([[02-Protocols/Ownership]]). Cross-agent surfaces live in `contracts/`; change via handoff.
4. No third-party code without a license-register entry. Never log pixels/tokens/secrets. Never commit `.env`.
5. Tests ship with code. No stage advances without green gates ([[03-Reference/Gates]]).
6. Install only vetted skills; record them in your `agents/<AGENT>/skills.md`.
7. Context discipline: read your briefing + one task card + its links. Notes are ≤120 lines; split if longer.
8. Every task ends: Done / Not done / Risks / Ledger delta / Next — as a `lv.py log` entry.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
