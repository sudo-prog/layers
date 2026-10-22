/**
 * AI Service Client
 *
 * Typed fetch wrapper around the LAYERS backend AI service (port 8123).
 * Provides feature extraction, stack search/optimization/pruning, and
 * adapters that convert between the frontend StackItem shape (which carries
 * a client-side `id`) and the backend ApiLayer shape (which omits `id`).
 */

import type { StackItem } from "@layers/stack";

// ── API layer shape (matches backend: core/params/opacity/blend/mask/enabled) ──

export interface ApiLayer {
  core: string;
  params: Record<string, unknown>;
  opacity: number;
  blend: string;
  mask: string | null;
  enabled: boolean;
}

// ── Feature vector (matches backend FeatureVector) ──

export interface FeatureVector {
  palette: Array<[number, number, number]>;
  edges: Record<string, unknown>;
  frequency: Record<string, unknown>;
  tone: Record<string, unknown>;
  clip_embedding?: number[] | null;
}

// ── Ranked stack candidate (matches backend RankedStack.to_dict()) ──

export interface RankedStack {
  stack: ApiLayer[];
  fidelity: number;
  passes: number;
  params_count: number;
  confidence: number;
}

// ── Optimization result (matches backend /v1/stacks/optimize response) ──

export interface OptimizationOutcome {
  optimized_stack: ApiLayer[];
  score: number;
  trace: number[];
  passes: number;
}

export interface OptimizeResult {
  stack: StackItem[];
  score: number;
  trace: number[];
  passes: number;
}

// ── Prune report (matches backend /v1/stacks/prune response) ──

export interface PruneReport {
  pruned_stack: ApiLayer[];
  removed_indices: number[];
  fidelity_before: number;
  fidelity_after: number;
  passes_before: number;
  passes_after: number;
  params_before: number;
  params_after: number;
  layers_removed_pct: number;
}

// ── Search response ──

export interface SearchStacksResponse {
  candidates: RankedStack[];
  count: number;
}

// ── Learning Store endpoints ───────────────────────────────────────────────────

export interface AcceptanceDashboard {
  acceptance_rates: Record<string, Record<string, number>>;
  core_types: string[];
  style_clusters: string[];
  description?: string;
}
export interface RetrieveResult {
  stack: ApiLayer[];
  core_type: string;
  cluster: string;
  score: number;
  rating?: number;
}
export interface RetrieveResponse {
  results: RetrieveResult[];
  count: number;
  weighting_formula?: string;
}

// ── Adapters ─────────────────────────────────────────────────────────────────

/**
 * Convert frontend StackItem[] to backend ApiLayer[] (strips the client `id`).
 */
export function stackToApi(stack: StackItem[]): ApiLayer[] {
  return stack.map((item) => ({
    core: item.core,
    params: item.params,
    opacity: item.opacity,
    blend: item.blend,
    mask: item.mask,
    enabled: item.enabled,
  }));
}

/**
 * Convert backend ApiLayer[] to frontend StackItem[] (assigns fresh ids).
 */
export function apiToStack(layers: ApiLayer[]): StackItem[] {
  return layers.map((layer, i) => ({
    id: `stack-${Date.now()}-${i}`,
    core: layer.core,
    params: layer.params,
    opacity: layer.opacity,
    blend: layer.blend,
    mask: layer.mask,
    enabled: layer.enabled,
  }));
}

// ── Client ───────────────────────────────────────────────────────────────────

const DEFAULT_BASE_URL = "/v1";
const DEFAULT_TIMEOUT_MS = 30_000;

let baseUrl = DEFAULT_BASE_URL;
let timeoutMs = DEFAULT_TIMEOUT_MS;
let authToken = "";

/** Override the base URL (mainly for testing). */
export function setAiBaseUrl(url: string): void {
  baseUrl = url;
}

/** Override the request timeout in milliseconds. */
export function setAiTimeout(ms: number): void {
  timeoutMs = ms;
}

/** Set the bearer token for AI service auth (default: empty = no auth). */
export function setAiToken(token: string): void {
  authToken = token;
}

/** Build headers including Authorization when a token is set. */
function buildHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }
  return headers;
}

/**
 * Low-level POST helper. Returns the parsed JSON or throws on HTTP error.
 */
async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: buildHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`AI request failed (${resp.status}): ${text || resp.statusText}`);
    }
    return (await resp.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Check whether the backend AI service is healthy. */
export async function checkHealth(): Promise<boolean> {
  try {
    const resp = await fetch(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: buildHeaders(),
    });
    if (!resp.ok) return false;
    const data = (await resp.json()) as { status: string };
    return data.status === "ok";
  } catch {
    return false;
  }
}

/**
 * Extract feature vector from a base64-encoded image.
 * The base64 string may include a data-URI prefix (e.g. `data:image/png;base64,...`);
 * the prefix is stripped before sending to the backend.
 */
export async function extractFeatures(base64Image: string): Promise<FeatureVector> {
  const clean = base64Image.replace(/^data:image\/[a-z]+;base64,/, "");
  const data = await postJSON<{ features: FeatureVector[] }>(
    "/features/extract",
    { image_data: clean },
  );
  if (!data.features || data.features.length === 0) {
    throw new Error("No features returned from AI service");
  }
  return data.features[0];
}

/**
 * Search for ranked stack candidates matching the given feature vector.
 */
export async function searchStacks(
  features: FeatureVector,
  beamWidth: number = 8,
): Promise<RankedStack[]> {
  const data = await postJSON<SearchStacksResponse>(
    "/stacks/search",
    { feature: features, beam_width: beamWidth },
  );
  return data.candidates ?? [];
}

/**
 * Optimize the parameters of the given stack against the feature vector.
 */
export async function optimizeStack(
  features: FeatureVector,
  stack: StackItem[],
): Promise<OptimizeResult> {
  const apiStack = stackToApi(stack);
  const data = await postJSON<OptimizationOutcome>(
    "/stacks/optimize",
    { feature: features, stack: apiStack },
  );
  return {
    stack: apiToStack(data.optimized_stack),
    score: data.score,
    trace: data.trace,
    passes: data.passes,
  };
}

/**
 * Prune layers from the stack while keeping fidelity loss within bounds.
 */
export async function pruneStack(
  features: FeatureVector,
  stack: StackItem[],
): Promise<PruneReport & { stack: StackItem[] }> {
  const apiStack = stackToApi(stack);
  const data = await postJSON<{ report: PruneReport }>(
    "/stacks/prune",
    { feature: features, stack: apiStack },
  );
  const report = data.report;
  return {
    ...report,
    stack: apiToStack(report.pruned_stack),
  };
}

// ── Learning Store endpoints ───────────────────────────────────────────────────

/**
 * Record that a stack suggestion was made for a core-type/cluster pair.
 * Fire-and-forget: swallows network errors so a down backend never breaks the editor.
 */
export async function recordSuggestion(coreType: string, cluster: string): Promise<void> {
  try {
    await postJSON<{ status: string; event: string }>(
      "/events/suggest",
      { core_type: coreType, cluster },
    );
  } catch (e) {
    // Swallow network errors for fire-and-forget event emitters
    console.warn(`Failed to record suggestion: ${e}`);
  }
}

/**
 * Record that a stack suggestion was applied for a core-type/cluster pair.
 * Fire-and-forget: swallows network errors so a down backend never breaks the editor.
 */
export async function recordApplication(coreType: string, cluster: string): Promise<void> {
  try {
    await postJSON<{ status: string; event: string }>(
      "/events/apply",
      { core_type: coreType, cluster },
    );
  } catch (e) {
    // Swallow network errors for fire-and-forget event emitters
    console.warn(`Failed to record application: ${e}`);
  }
}

/**
 * Get the acceptance dashboard showing acceptance rates per core-type/cluster.
 */
export async function getAcceptanceDashboard(): Promise<AcceptanceDashboard> {
  const data = await fetch(`${baseUrl}/dashboard/acceptance`, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: buildHeaders(),
  });
  if (!data.ok) {
    const text = await data.text().catch(() => "");
    throw new Error(`AI request failed (${data.status}): ${text || data.statusText}`);
  }
  return (await data.json()) as AcceptanceDashboard;
}

/**
 * Retrieve similar stacks based on a feature vector.
 */
export async function retrieveStacks(
  feature: FeatureVector,
  k: number = 10,
): Promise<RetrieveResponse> {
  const data = await postJSON<RetrieveResponse>(
    "/retrieve",
    { feature, k },
  );
  return data;
}
