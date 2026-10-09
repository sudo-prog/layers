/**
 * @layers/stack — Effect stack state management
 *
 * Manages the ordered list of effect passes (cores) applied to a source image.
 * Each stack item references a core type and its parameters.
 */

// Effect-stack entry shape (mirrors contracts/effect-stack.schema.json).
// The schema package exports EffectStack as `typeof effectStackSchema` (i.e.
// `any`), so we declare the real shape here rather than importing it.
export interface EffectStackEntry {
  core: string;
  params: Record<string, unknown>;
  opacity: number;
  blend: string;
  mask?: string | null;
  enabled: boolean;
}

export type EffectStack = EffectStackEntry[];

export interface StackItem {
  id: string;
  core: string;
  params: Record<string, unknown>;
  opacity: number;
  blend: string;
  mask: string | null;
  enabled: boolean;
}

export interface StackState {
  items: StackItem[];
  selectedId: string | null;
}

export function createStackState(stack?: EffectStack): StackState {
  if (!stack || stack.length === 0) {
    return { items: [], selectedId: null };
  }

  const items: StackItem[] = stack.map((entry, i) => ({
    id: `stack-${i}`,
    core: entry.core,
    params: entry.params,
    opacity: entry.opacity,
    blend: entry.blend,
    mask: entry.mask ?? null,
    enabled: entry.enabled,
  }));

  return { items, selectedId: items[0]?.id ?? null };
}

export function addStackItem(state: StackState, item: Omit<StackItem, "id">): StackState {
  const id = `stack-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    items: [...state.items, { ...item, id }],
    selectedId: id,
  };
}

export function removeStackItem(state: StackState, id: string): StackState {
  const items = state.items.filter((i) => i.id !== id);
  return {
    items,
    selectedId: state.selectedId === id ? items[items.length - 1]?.id ?? null : state.selectedId,
  };
}

export function updateStackItem(state: StackState, id: string, updates: Partial<StackItem>): StackState {
  return {
    ...state,
    items: state.items.map((i) => (i.id === id ? { ...i, ...updates } : i)),
  };
}

export function moveStackItem(state: StackState, id: string, direction: "up" | "down"): StackState {
  const idx = state.items.findIndex((i) => i.id === id);
  if (idx < 0) return state;

  const newIdx = direction === "up" ? idx - 1 : idx + 1;
  if (newIdx < 0 || newIdx >= state.items.length) return state;

  const items = [...state.items];
  [items[idx], items[newIdx]] = [items[newIdx], items[idx]];
  return { ...state, items };
}

export function toggleStackItem(state: StackState, id: string): StackState {
  return {
    ...state,
    items: state.items.map((i) => (i.id === id ? { ...i, enabled: !i.enabled } : i)),
  };
}

export function selectStackItem(state: StackState, id: string | null): StackState {
  return { ...state, selectedId: id };
}

export function getEnabledItems(state: StackState): StackItem[] {
  return state.items.filter((i) => i.enabled);
}

export function estimatePasses(items: StackItem[]): number {
  const PASS_COSTS: Record<string, number> = {
    "bevel-emboss": 2,
    "gradient-overlay": 1,
    "pattern-dither": 2,
    "noise-grain": 2,
    "gaussian-blur": 3,
    displacement: 2,
    "color-adjust": 1,
    "color-blend": 1,
    blur: 1,
    lighting: 1,
    outline: 2,
  };
  return items.reduce((sum, item) => sum + (PASS_COSTS[item.core] ?? 1), 0);
}

export function isMobileOk(passes: number): boolean {
  return passes <= 8;
}
