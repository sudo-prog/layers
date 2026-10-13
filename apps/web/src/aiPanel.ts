/**
 * AI Panel UI — feature extraction, stack search, optimization & pruning.
 *
 * Mounts a self-contained panel into any HTMLElement. The panel provides:
 *  (a) "Extract from Photo"  → camera/file → extractFeatures → store result
 *  (b) "Search Stacks"       → searchStacks with stored features → candidates list
 *  (c) "Optimize Current"    → optimizeStack on the current stack → apply result
 *  (d) "Prune Current"       → pruneStack on the current stack → apply result
 *  (e) Status indicator (loading / error / success)
 *
 * The caller supplies callbacks to read the current stack and to apply a
 * new stack produced by optimization or pruning.
 */

import type { StackItem, StackState } from "@layers/stack";
import type {
  ApiLayer,
  FeatureVector,
  RankedStack,
  OptimizeResult,
  PruneReport,
} from "./aiClient";
import {
  checkHealth,
  extractFeatures,
  searchStacks,
  optimizeStack,
  pruneStack,
  apiToStack,
} from "./aiClient";
import { openCamera } from "./imageImport";

// ── Options ────────────────────────────────────────────────────────────────

export interface AIPanelOptions {
  /** Returns the current stack state (the editor\'s live state). */
  getCurrentStack: () => StackState;
  /** Replace the editor\'s stack with the result of optimization/pruning. */
  applyStack: (stack: StackItem[]) => void;
  /** Optional: load a candidate stack into the editor. */
  onSelectCandidate?: (stack: StackItem[]) => void;
}

export interface AIPanelHandle {
  /** Re-run a health check and update the status indicator. */
  refreshHealth: () => Promise<void>;
  /** Remove all DOM created by this panel. */
  destroy: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Convert a File to a base64 data-URI string (suitable for extractFeatures). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Human-readable description of an API layer stack. */
function describeStack(layers: ApiLayer[]): string {
  if (layers.length === 0) return "(empty)";
  return layers.map((l) => l.core).join(" → ");
}

// ── Main ───────────────────────────────────────────────────────────────────

export function mountAIPanel(
  container: HTMLElement,
  opts: AIPanelOptions,
): AIPanelHandle {
  container.innerHTML = "";
  container.className = "ai-panel-container";

  // ── Header ──
  const header = el("div", "ai-panel-header");
  header.appendChild(el("h3", "ai-panel-title", "AI Assistant"));

  const closeBtn = el("button", "btn ai-panel-close");
  closeBtn.textContent = "✕";
  closeBtn.title = "Close AI panel";
  closeBtn.addEventListener("click", () => container.remove());
  header.appendChild(closeBtn);
  container.appendChild(header);

  // ── Status indicator ──
  const statusBar = el("div", "ai-status-bar");
  const statusDot = el("span", "ai-status-dot");
  const statusText = el("span", "ai-status-text", "Checking service…");
  statusBar.appendChild(statusDot);
  statusBar.appendChild(statusText);
  container.appendChild(statusBar);

  // ── Action buttons ──
  const btnBar = el("div", "ai-panel-actions");
  const btnExtract = el("button", "btn ai-btn", "Extract from Photo");
  const btnSearch = el("button", "btn ai-btn", "Search Stacks");
  const btnOptimize = el("button", "btn ai-btn", "Optimize Current");
  const btnPrune = el("button", "btn ai-btn", "Prune Current");
  btnSearch.disabled = true;
  btnOptimize.disabled = true;
  btnPrune.disabled = true;
  btnBar.appendChild(btnExtract);
  btnBar.appendChild(btnSearch);
  btnBar.appendChild(btnOptimize);
  btnBar.appendChild(btnPrune);
  container.appendChild(btnBar);

  // ── Candidates list ──
  const candidatesSection = el("div", "ai-candidates-section");
  const candidatesTitle = el("h4", "ai-candidates-title", "Search Candidates");
  candidatesSection.appendChild(candidatesTitle);
  const candidatesList = el("div", "ai-candidates-list");
  candidatesSection.appendChild(candidatesList);
  container.appendChild(candidatesSection);

  // ── Module state ──
  let features: FeatureVector | null = null;
  let candidates: RankedStack[] = [];
  let destroyed = false;

  // ── Status helpers ──

  function setStatus(
    kind: "loading" | "error" | "success" | "idle",
    message: string,
  ): void {
    if (destroyed) return;
    statusDot.className = `ai-status-dot ${kind}`;
    statusText.textContent = message;
  }

  function setInitialDisabled(): void {
    btnSearch.disabled = true;
    btnOptimize.disabled = true;
    btnPrune.disabled = true;
  }

  // ── Health check ──
  async function refreshHealth(): Promise<void> {
    setStatus("loading", "Checking service…");
    const healthy = await checkHealth();
    if (healthy) {
      setStatus("success", "AI service ready");
      btnExtract.disabled = false;
    } else {
      setStatus("error", "AI service unavailable");
      btnExtract.disabled = true;
    }
    setInitialDisabled();
  }

  // ── Event handlers ──

  async function onExtract(): Promise<void> {
    setStatus("loading", "Selecting photo…");
    try {
      const file = await openCamera();
      if (!file) {
        setStatus("idle", "No photo selected.");
        return;
      }
      setStatus("loading", "Extracting features…");
      const base64 = await fileToBase64(file);
      features = await extractFeatures(base64);
      setStatus("success", "Features extracted ✓");
      btnSearch.disabled = false;
      btnOptimize.disabled = false;
      btnPrune.disabled = false;
      candidates = [];
      renderCandidates([]);
    } catch (e) {
      setStatus("error", `Extract failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function onSearch(): Promise<void> {
    if (!features) {
      setStatus("error", "No features extracted yet.");
      return;
    }
    setStatus("loading", "Searching stacks…");
    try {
      candidates = await searchStacks(features, 8);
      renderCandidates(candidates);
      setStatus("success", `${candidates.length} candidates found`);
    } catch (e) {
      setStatus("error", `Search failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function onOptimize(): Promise<void> {
    if (!features) {
      setStatus("error", "No features extracted yet.");
      return;
    }
    const current = opts.getCurrentStack();
    if (current.items.length === 0) {
      setStatus("error", "Stack is empty.");
      return;
    }
    setStatus("loading", "Optimizing…");
    try {
      const result: OptimizeResult = await optimizeStack(features, current.items);
      setStatus("success", `Optimized (score: ${result.score.toFixed(3)})`);
      opts.applyStack(result.stack);
    } catch (e) {
      setStatus("error", `Optimize failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function onPrune(): Promise<void> {
    if (!features) {
      setStatus("error", "No features extracted yet.");
      return;
    }
    const current = opts.getCurrentStack();
    if (current.items.length === 0) {
      setStatus("error", "Stack is empty.");
      return;
    }
    setStatus("loading", "Pruning…");
    try {
      const report: PruneReport & { stack: StackItem[] } = await pruneStack(
        features,
        current.items,
      );
      setStatus(
        "success",
        `Pruned: removed ${report.removed_indices.length} layer(s)`,
      );
      opts.applyStack(report.stack);
    } catch (e) {
      setStatus("error", `Prune failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  btnExtract.addEventListener("click", () => void onExtract());
  btnSearch.addEventListener("click", () => void onSearch());
  btnOptimize.addEventListener("click", () => void onOptimize());
  btnPrune.addEventListener("click", () => void onPrune());

  // ── Candidates rendering ──

  function renderCandidates(items: RankedStack[]): void {
    if (destroyed) return;
    candidatesList.innerHTML = "";
    candidatesTitle.textContent = items.length > 0 ? "Search Candidates" : "Search Candidates";

    if (items.length === 0) {
      const empty = el("p", "ai-candidates-empty");
      empty.textContent = "No candidates yet. Extract features and search to see results.";
      candidatesList.appendChild(empty);
      return;
    }

    for (const c of items) {
      const card = el("div", "ai-candidate-card");
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");

      const topRow = el("div", "ai-candidate-row");
      const name = el("span", "ai-candidate-name", describeStack(c.stack));
      const score = el("span", "ai-candidate-score", `fidel: ${c.fidelity.toFixed(2)}`);
      topRow.appendChild(name);
      topRow.appendChild(score);
      card.appendChild(topRow);

      const meta = el("div", "ai-candidate-meta");
      meta.textContent = `${c.passes} passes · ${c.confidence.toFixed(2)} conf`;
      card.appendChild(meta);

      card.addEventListener("click", () => {
        void applyCandidate(c);
      });
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          void applyCandidate(c);
        }
      });

      candidatesList.appendChild(card);
    }
  }

  async function applyCandidate(c: RankedStack): Promise<void> {
    if (destroyed) return;
    setStatus("loading", "Applying candidate…");
    try {
      const stackItems = apiToStack(c.stack);
      opts.applyStack(stackItems);
      if (opts.onSelectCandidate) opts.onSelectCandidate(stackItems);
      setStatus("success", "Candidate applied ✓");
    } catch (e) {
      setStatus("error", `Apply failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ── Init ──
  void (async () => {
    btnExtract.disabled = false;
    await refreshHealth();
  })();

  return {
    refreshHealth,
    destroy() {
      destroyed = true;
      container.innerHTML = "";
      container.className = "";
    },
  };
}
