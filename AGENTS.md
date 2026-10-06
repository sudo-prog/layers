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
