# LAYERS Launch Checklist

**Stage:** 2.5 — Beta & v1.0 Launch
**Created:** 2026-10-14
**Owner:** MGR

Complete every item before advancing from Stage 2.5. A red ❌ blocks launch.

---

## 1. Quality Gates (must all be green)

| Gate | Threshold | Status | Evidence |
|------|-----------|--------|----------|
| Static (TS strict, lint clean) | Zero errors | ⬜ | `pnpm lint` + `tsc --noEmit` |
| Unit tests | ≥80% schema/stack/sync, ≥70% else | ⬜ | `pnpm test` — all 319 tests |
| Visual regression (golden SSIM) | Per-core SSIM ≥ 0.98 (stochastic ≥ 0.90, fixed seed) | ⬜ | 8/8 per-core golden checks |
| Cross-browser smoke | Chromium, WebKit, Firefox | ⬜ | Playwright matrix |
| Performance — desktop | No regression > 5% | ⬜ | Benchmark vs Stage 1.4 baseline |
| Performance — mobile | ≤ 8 passes (target 6), ≥ 30 fps @ 1024–1536px, apply < 300ms | ⬜ | Real device or documented deferred |
| Bundle size | Engine+7 cores ≤ 150 KB gz; mobile first load ≤ 250 KB gz | ⬜ | `vite build` + gzip analysis |
| Accessibility | axe zero critical/serious; keyboard-complete; AA contrast | ⬜ | axe-core run |
| Security | No high/critical CVEs; CSP; no secrets in logs | ⬜ | Security review below |
| License | Allow-list only; no AGPL/SSPL/PolyForm/non-commercial | ⬜ | `license-check` CI job |
| Schema compat | All historical fixtures load via migrations | ⬜ | Schema migration tests |
| Efficiency Ledger | Updated; Simplification Gate verdict attached | ⬜ | `docs/EFFICIENCY-LEDGER.md` |

---

## 2. Security Review

**Document:** [`docs/security-review.md`](./security-review.md)
**Status:** 🟡 Done — 7 findings, 1 High, 3 Medium, 3 Low

### Pre-launch remediation required

| # | Priority | Finding | Remediation | Status |
|---|----------|---------|-------------|--------|
| 1 | High | No CSP anywhere | Add CSP headers via `vite.config.ts` or meta tag | ⬜ |
| 2 | Medium | No auth on AI service endpoints | Add API key/token middleware; restrict to localhost | ⬜ |
| 3 | Medium | `public readonly token` in `GitHubSyncProvider` | Change to `private readonly` | ⬜ |
| 4 | Medium | Hardcoded anonymization salt | Source from env var or secrets manager | ⬜ |
| 5 | Medium | Immich client could run in browser | Document server-side only, or add runtime env check | ⬜ |
| 6 | Low | No file type validation on upload | Add MIME type and magic-byte validation | ⬜ |
| 7 | Low | No rate limiting on AI endpoints | Add rate limiting for compute-intensive endpoints | ⬜ |

**Sign-off:** MGR confirms all High and Medium findings resolved or documented as accepted risk. ⬜

---

## 3. Privacy Review

**Document:** [`docs/privacy-review.md`](./privacy-review.md)
**Status:** 🟡 Done — 6 findings, 3 Medium, 3 Low

### Pre-launch remediation required

| # | Priority | Finding | Remediation | Status |
|---|----------|---------|-------------|--------|
| 1 | Medium | Hardcoded anonymization salt | Source from env var; document rotation policy | ⬜ |
| 2 | Medium | No schema validation on event metadata | Add JSON Schema validation for event metadata | ⬜ |
| 3 | Medium | No retention enforcement | Implement automated purge of events > retention period | ⬜ |
| 4 | Low | Consent in localStorage | Document threat model; consider secure cookie | ⬜ |
| 5 | Low | No encryption at rest | Document local-first unencrypted; add optional encryption | ⬜ |
| 6 | Low | Session ID generation | Ensure randomly generated, not derived from user identifiers | ⬜ |

**Sign-off:** MGR confirms all Medium findings resolved or documented as accepted risk. ⬜

---

## 4. Accessibility Sign-off

- [ ] axe-core automated run passes (zero critical/serious)
- [ ] Keyboard-only navigation complete (Tab, Enter, Escape, arrow keys)
- [ ] WCAG 2.2 AA contrast verified for all UI text
- [ ] Focus indicators visible on all interactive elements
- [ ] Reduced-motion preference respected
- [ ] 44×44px minimum touch targets on mobile
- [ ] ARIA roles and labels on dialogs, stack panel, inspector

**Sign-off:** ⬜

---

## 5. Beta Sign-off

- [ ] Staged rollout plan documented (internal → closed beta → public)
- [ ] Beta user cohort identified (target: 10–20 users)
- [ ] Feedback collection mechanism in place (GitHub Issues template or form)
- [ ] Known-issues list published
- [ ] Support channel documented (GitHub Discussions or email)
- [ ] Beta exit criteria defined (zero critical bugs for 2 weeks, ≥ 80% task success rate)

**Sign-off:** ⬜

---

## 6. Staged Rollout Plan

| Phase | Audience | Duration | Entry Criteria | Exit Criteria |
|-------|----------|----------|----------------|---------------|
| Internal | MGR + BE agents | 1 week | All gates green | Zero P0 bugs |
| Closed beta | 10–20 invited users | 2 weeks | Internal sign-off | Zero critical bugs, ≥80% task success |
| Public | General public | Ongoing | Beta sign-off | — |

**Deployment targets:**
- Web app: GitHub Pages or Netlify
- Desktop: GitHub Releases (DMG for macOS, AppImage for Linux)
- iOS: TestFlight → App Store
- Android: Play Console internal testing → production

⬜ Rollout plan reviewed and approved

---

## 7. Rollback Drill

- [ ] `scripts/rollback-drill.sh` created and committed
- [ ] Drill rehearsed at least once (simulate rollback to last known good tag)
- [ ] Rollback verified: old version builds and passes tests
- [ ] Documented rollback procedure in `docs/site/`
- [ ] Rollback decision tree documented (when to roll back vs. hotfix)

**Sign-off:** ⬜

---

## 8. Documentation

- [ ] `docs/site/` scaffold created with index linking all docs
- [ ] README updated with launch status
- [ ] ADRs complete for all major decisions
- [ ] API docs generated (if applicable)
- [ ] User guide drafted (basic usage, preset creation, stack editing)
- [ ] Troubleshooting guide drafted

**Sign-off:** ⬜

---

## 9. Operational Readiness

- [ ] CI/CD pipeline green on main (all 5 jobs: lint-typecheck-test, license-check, conflict-files, ownership-check, golden-image)
- [ ] Pre-commit hooks installed (ownership + conflict detection)
- [ ] CODEOWNERS file up to date
- [ ] Git tags for releases follow semver
- [ ] Backup strategy documented (Syncthing + GitHub)
- [ ] Monitoring/alerting plan (at minimum: CI failure notifications)

**Sign-off:** ⬜

---

## 10. Go / No-Go Decision

| Criteria | Threshold | Actual | Pass? |
|----------|-----------|--------|-------|
| All quality gates green | 100% | __/13 | ⬜ |
| No open High-severity security findings | 0 | __ | ⬜ |
| No open Medium-severity privacy findings | 0 | __ | ⬜ |
| Beta sign-off complete | Yes | | ⬜ |
| Rollback drill rehearsed | ≥ 1 | | ⬜ |
| Documentation complete | 100% | | ⬜ |

**Decision:** ⬜ GO — ready for beta launch
**Decision:** ⬜ NO-GO — blocked on items above

---

**Approved by (MGR):** ________________
**Date:** ________________
