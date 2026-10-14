/**
 * Learning Panel UI — acceptance dashboard and retrieval interface.
 *
 * Mounts a self-contained panel into any HTMLElement. The panel provides:
 *  (a) Acceptance tab → shows acceptance matrix from getAcceptanceDashboard()
 *  (b) Retrieval tab → button to find similar stacks using retrieveStacks()
 *
 * The caller supplies a callback to get the current feature vector for retrieval.
 */

import type { StackItem } from "@layers/stack";
import type {
  AcceptanceDashboard,
  RetrieveResult,
  RetrieveResponse,
} from "./aiClient";
import {
  getAcceptanceDashboard,
  retrieveStacks,
} from "./aiClient";
import { checkConsent, giveConsent, revokeConsent } from "./consent";

// ── Options ────────────────────────────────────────────────────────────

export interface LearningPanelOptions {
  /** Returns the current feature vector (may be null if not available). */
  getFeatureVector: () => FeatureVector | null;
}

export interface LearningPanelHandle {
  /** Refresh the panel data (re-fetch acceptance dashboard). */
  refresh: () => Promise<void>;
  /** Remove all DOM created by this panel. */
  destroy: () => void;
}

// ── Feature vector type (matching aiClient) ────────────────────────────

export interface FeatureVector {
  palette: Array<[number, number, number]>;
  edges: Record<string, unknown>;
  frequency: Record<string, unknown>;
  tone: Record<string, unknown>;
  clip_embedding?: number[] | null;
}

// ── Helpers ────────────────────────────────────────────────────────────

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

/**
 * Format a number as a percentage string with 1 decimal place.
 */
function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Get a color for a value between 0 and 1, interpolating from --bg-secondary to --success.
 * Falls back to --accent if --success is not defined.
 */
function getAcceptanceColor(value: number): string {
  // Clamp value between 0 and 1
  const clamped = Math.max(0, Math.min(1, value));
  
  // Try to get CSS variables
  const root = document.documentElement;
  const bgSecondary = getComputedStyle(root).getPropertyValue('--bg-secondary').trim();
  const success = getComputedStyle(root).getPropertyValue('--success').trim() || 
                  getComputedStyle(root).getPropertyValue('--accent').trim();
  
  // If we can't parse the colors, return a fallback
  if (!bgSecondary || !success) {
    return `hsl(${120 * clamped}, 70%, 40%)`; // Green hue based on value
  }
  
  // For now, return a simple hue-based color since parsing RGB from CSS is complex
  // In a real implementation, we'd parse the actual colors and interpolate
  return `hsl(${120 * clamped}, 70%, 40%)`;
}

// ── Main ───────────────────────────────────────────────────────────────

export function mountLearningPanel(
  container: HTMLElement,
  opts: LearningPanelOptions,
): LearningPanelHandle {
  container.innerHTML = "";
  container.className = "learning-overlay";

  // ── Header ──
  const header = el("div", "learning-header");
  header.appendChild(el("h2", "learning-title", "Learning Store"));

  // ── Opt-in consent control (Stage 1.6 privacy gate) ──
  // Default is OFF; nothing is logged or sent until the user opts in.
  const consentLabel = el("label", "consent-toggle");
  const consentBox = el("input") as HTMLInputElement;
  consentBox.type = "checkbox";
  consentBox.checked = checkConsent();
  const consentText = el("span", "", consentBox.checked ? "Sharing enabled" : "Share anonymised usage data");
  consentLabel.appendChild(consentBox);
  consentLabel.appendChild(consentText);
  consentBox.addEventListener("change", () => {
    if (consentBox.checked) {
      giveConsent(["stack_events", "acceptance_rates"]);
      consentText.textContent = "Sharing enabled";
    } else {
      revokeConsent();
      consentText.textContent = "Share anonymised usage data";
    }
  });
  header.appendChild(consentLabel);

  const closeBtn = el("button", "btn learning-close");
  closeBtn.textContent = "✕";
  closeBtn.title = "Close learning panel";
  closeBtn.addEventListener("click", () => container.remove());
  header.appendChild(closeBtn);
  container.appendChild(header);

  // ── Tabs ──
  const tabsContainer = el("div", "learning-tabs");
  const acceptanceTab = el("button", "learning-tab tab-acceptance active", "Acceptance");
  const retrievalTab = el("button", "learning-tab tab-retrieval", "Retrieval");
  tabsContainer.appendChild(acceptanceTab);
  tabsContainer.appendChild(retrievalTab);
  container.appendChild(tabsContainer);

  // ── Content ──
  const contentContainer = el("div", "learning-content");
  
  // Acceptance tab content
  const acceptanceContent = el("div", "tab-content acceptance-content active");
  const acceptanceLoading = el("p", "acceptance-loading", "Loading acceptance data...");
  const acceptanceError = el("p", "acceptance-error hidden");
  const acceptanceMatrix = el("div", "acceptance-matrix");
  acceptanceContent.appendChild(acceptanceLoading);
  acceptanceContent.appendChild(acceptanceError);
  acceptanceContent.appendChild(acceptanceMatrix);
  
  // Retrieval tab content
  const retrievalContent = el("div", "tab-content retrieval-content");
  const retrievalLoading = el("p", "retrieval-loading hidden", "Searching...");
  const retrievalError = el("p", "retrieval-error hidden");
  const retrievalGuidance = el("p", "retrieval-guidance", "Extract features from an image to enable similarity search.");
  const retrievalButton = el("button", "btn retrieval-btn", "Find similar stacks");
  const retrievalResults = el("div", "retrieval-list");
  retrievalContent.appendChild(retrievalLoading);
  retrievalContent.appendChild(retrievalError);
  retrievalContent.appendChild(retrievalGuidance);
  retrievalContent.appendChild(retrievalButton);
  retrievalContent.appendChild(retrievalResults);
  
  contentContainer.appendChild(acceptanceContent);
  contentContainer.appendChild(retrievalContent);
  container.appendChild(contentContainer);

  // ── Module state ──
  let acceptanceData: AcceptanceDashboard | null = null;
  let retrievalResultsData: RetrieveResult[] = [];
  let destroyed = false;
  let activeTab: "acceptance" | "retrieval" = "acceptance";

  // ── Status helpers ──
  function setAcceptanceLoading(): void {
    if (destroyed) return;
    acceptanceLoading.classList.remove("hidden");
    acceptanceError.classList.add("hidden");
    acceptanceMatrix.classList.add("hidden");
  }
  
  function setAcceptanceError(message: string): void {
    if (destroyed) return;
    acceptanceLoading.classList.add("hidden");
    acceptanceError.classList.remove("hidden");
    acceptanceError.textContent = message;
    acceptanceMatrix.classList.add("hidden");
  }
  
  function setAcceptanceSuccess(): void {
    if (destroyed) return;
    acceptanceLoading.classList.add("hidden");
    acceptanceError.classList.add("hidden");
    acceptanceMatrix.classList.remove("hidden");
  }
  
  function setRetrievalLoading(): void {
    if (destroyed) return;
    retrievalLoading.classList.remove("hidden");
    retrievalError.classList.add("hidden");
    retrievalGuidance.classList.add("hidden");
    retrievalButton.disabled = true;
    retrievalResults.classList.add("hidden");
  }
  
  function setRetrievalError(message: string): void {
    if (destroyed) return;
    retrievalLoading.classList.add("hidden");
    retrievalError.classList.remove("hidden");
    retrievalError.textContent = message;
    retrievalGuidance.classList.remove("hidden");
    retrievalButton.disabled = false;
    retrievalResults.classList.add("hidden");
  }
  
  function setRetrievalSuccess(): void {
    if (destroyed) return;
    retrievalLoading.classList.add("hidden");
    retrievalError.classList.add("hidden");
    retrievalGuidance.classList.add("hidden");
    retrievalButton.disabled = false;
    retrievalResults.classList.remove("hidden");
  }
  
  function setRetrievalEmpty(): void {
    if (destroyed) return;
    retrievalLoading.classList.add("hidden");
    retrievalError.classList.add("hidden");
    retrievalGuidance.classList.remove("hidden");
    retrievalButton.disabled = false;
    retrievalResults.classList.add("hidden");
  }

  // ── Tab switching ──
  function showAcceptanceTab(): void {
    if (destroyed) return;
    acceptanceTab.classList.add("active");
    retrievalTab.classList.remove("active");
    acceptanceContent.classList.add("active");
    retrievalContent.classList.remove("active");
    activeTab = "acceptance";
  }
  
  function showRetrievalTab(): void {
    if (destroyed) return;
    acceptanceTab.classList.remove("active");
    retrievalTab.classList.add("active");
    acceptanceContent.classList.remove("active");
    retrievalContent.classList.add("active");
    activeTab = "retrieval";
  }

  // ── Acceptance dashboard rendering ──
  function renderAcceptanceMatrix(): void {
    if (destroyed || !acceptanceData) return;
    
    const { acceptance_rates, core_types, style_clusters } = acceptanceData;
    
    // Clear matrix
    acceptanceMatrix.innerHTML = "";
    
    if (core_types.length === 0 || style_clusters.length === 0) {
      const emptyMsg = el("p", "acceptance-empty", "No data available");
      acceptanceMatrix.appendChild(emptyMsg);
      return;
    }
    
    // Create table
    const table = el("table", "acceptance-table");
    const thead = el("thead");
    const tbody = el("tbody");
    
    // Header row
    const headerRow = el("tr");
    const emptyHeader = el("th");
    headerRow.appendChild(emptyHeader);
    
    for (const cluster of style_clusters) {
      const th = el("th");
      th.textContent = cluster;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    
    // Data rows
    for (const coreType of core_types) {
      const row = el("tr");
      
      // Core type label
      const coreTh = el("th");
      coreTh.textContent = coreType;
      row.appendChild(coreTh);
      
      // Data cells
      for (const cluster of style_clusters) {
        const rate = acceptance_rates[coreType]?.[cluster] ?? 0;
        const td = el("td", "acceptance-cell");
        td.textContent = formatPercent(rate);
        td.style.backgroundColor = getAcceptanceColor(rate);
        td.style.color = rate > 0.5 ? "white" : "inherit"; // Light text on dark background
        row.appendChild(td);
      }
      
      tbody.appendChild(row);
    }
    
    table.appendChild(thead);
    table.appendChild(tbody);
    acceptanceMatrix.appendChild(table);
    // Reveal the matrix now that it has content (the loading/error states are
    // mutually exclusive with this one).
    setAcceptanceSuccess();
  }

  // ── Retrieval rendering ──
  function renderRetrievalResults(): void {
    if (destroyed) return;
    
    retrievalResults.innerHTML = "";
    
    if (retrievalResultsData.length === 0) {
      setRetrievalEmpty();
      return;
    }
    
    for (const result of retrievalResultsData) {
      const item = el("div", "retrieval-item");
      
      const stackInfo = el("div", "retrieval-stack");
      stackInfo.textContent = result.stack.map(l => l.core).join(" → ");
      
      const metaInfo = el("div", "retrieval-meta");
      metaInfo.textContent = `Core: ${result.core_type} | Cluster: ${result.cluster} | Score: ${result.score.toFixed(3)}`;
      
      if (result.rating !== undefined) {
        const ratingInfo = el("div", "retrieval-rating");
        ratingInfo.textContent = `Rating: ${result.rating}`;
        item.appendChild(ratingInfo);
      }
      
      item.appendChild(stackInfo);
      item.appendChild(metaInfo);
      retrievalResults.appendChild(item);
    }
    
    setRetrievalSuccess();
  }

  // ── Event handlers ──
  async function loadAcceptanceData(): Promise<void> {
    setAcceptanceLoading();
    try {
      acceptanceData = await getAcceptanceDashboard();
      renderAcceptanceMatrix();
    } catch (e) {
      setAcceptanceError(`Failed to load acceptance data: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  
  async function onRetrievalSearch(): Promise<void> {
    const featureVector = opts.getFeatureVector();
    if (!featureVector) {
      setRetrievalError("No feature vector available. Extract features from an image first.");
      return;
    }
    
    setRetrievalLoading();
    try {
      const response = await retrieveStacks(featureVector, 10);
      retrievalResultsData = response.results;
      renderRetrievalResults();
    } catch (e) {
      setRetrievalError(`Search failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ── Init tab switching ──
  acceptanceTab.addEventListener("click", () => {
    showAcceptanceTab();
  });
  
  retrievalTab.addEventListener("click", () => {
    showRetrievalTab();
  });
  
  retrievalButton.addEventListener("click", () => {
    void onRetrievalSearch();
  });

  // ── Initial load ──
  void (async () => {
    await loadAcceptanceData();
  })();

  return {
    refresh: async () => {
      if (destroyed) return;
      if (activeTab === "acceptance") {
        await loadAcceptanceData();
      }
      // Could also refresh retrieval if needed
    },
    destroy() {
      destroyed = true;
      container.innerHTML = "";
      container.className = "";
    },
  };
}