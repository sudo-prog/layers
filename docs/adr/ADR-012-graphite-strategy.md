# ADR-012 — Graphite License, Trademark, Repo & Syncthing Strategy

## Status
Proposed (BE research for T-M-004; human + FE sign-off required)

## Context
ADR-012 proposes Graphite as the basis for the desktop/iPad editor. This document answers the license, trademark, repo layout, and Syncthing questions that T-M-004 requires before any code is committed.

## License Verdict

**Graphite is dual-licensed under MIT and Apache-2.0, at the user's option.**

- Source: https://github.com/GraphiteEditor/Graphite/blob/master/LICENSE.txt
- Commit: `c49c001` (Jul 12, 2020 — "Add Apache 2 license")
- GitHub reports: "Apache-2.0, MIT licenses found"
- README states: "Graphite's source code is dual-licensed under your choice of either the MIT license or the Apache License 2.0, at your option, unless otherwise noted within the repository."
- Contributor agreement: "By submitting code for inclusion in the project, you agree to license your contributions under both licenses, and that you have the authority to do so."

**Verdict: OK** — Both MIT and Apache-2.0 are on our allow-list. We can vendor Graphite code under either license. Apache-2.0 is preferred for patent protection.

## Trademark Verdict

- No trademark registration found for "Graphite" in the context of graphic design software.
- The project name "Graphite" is generic (carbon allotrope, common word).
- No branding guidelines or trademark notices in the repo.
- **Verdict: OK** — No trademark restrictions identified. We can reference the name. If we fork, we should rename to avoid confusion (e.g., "LAYERS Desktop" or similar).

## Repo Layout Recommendation

**Recommendation: Reference-only (no fork, no subtree)**

Rationale:
1. **Rust/WASM toolchain is heavy** — building Graphite requires Rust, wasm-pack, and a full wgpu stack. This is a significant toolchain investment for a 2-agent team.
2. **Upstream churn** — Graphite is in active alpha (12k+ stars, 263 forks, 391 open issues). Forking means tracking upstream constantly.
3. **WASM size** — the wgpu layer adds a few hundred KB before compression. This is fine for desktop/iPad but not for the 250 KB mobile cap.
4. **Our cores are engine-neutral** — per ADR-012 exit plan, we keep preset schema and core definitions engine-neutral. We can study Graphite's node-graph concepts (Graphene) without vendoring the code.
5. **Syncthing + git workflow** — a Rust/WASM subtree would add `target/` (Rust build artifacts, often GBs) and complicate the single-writer model.

**Alternative (if fork is later required):**
- Fork to `sudo-prog/layers-desktop` (separate repo, not a subtree)
- Vendor only the Graphene node-graph engine (not the full editor)
- Keep our cores as WGSL shaders that map to Graphene nodes
- Use `.stignore` to exclude `target/`, `node_modules/`, `dist/`, `.wasm-cache/`

## .stignore Additions (if fork/subtree is later adopted)

```
# Rust build artifacts
target/
.wasm-cache/
*.wasm.bak

# Node
node_modules/
dist/

# Editor
*.log
*.tmp
```

## Risks

| Risk | Mitigation |
|---|---|
| Upstream license change | Dual MIT/Apache-2.0 is permissive; low risk |
| WASM cold-start too slow | Lazy-load the editor bundle; show a loading screen |
| Rust toolchain maintenance | Only FE (Mac) builds the WASM; BE does not need Rust |
| Fork drift from upstream | Rebase quarterly; track upstream releases |

## Next Steps

1. Human + FE sign off on this strategy
2. If reference-only: document Graphite patterns in `docs/adr/ADR-012-graphite-patterns.md` (node-graph concepts, layer model, non-destructive editing)
3. If fork: create `sudo-prog/layers-desktop`, set up CI, add `.stignore`
4. Proceed with S-0.0 spike (T-M-003) to verify custom shader nodes are feasible without forking core

## References

- Graphite GitHub: https://github.com/GraphiteEditor/Graphite
- Graphite LICENSE: https://github.com/GraphiteEditor/Graphite/blob/master/LICENSE.txt
- ADR-012 (proposed): Graphite as desktop/iPad basis
- OpenSource.md: Graphite entry (Apache-2.0 verified)
