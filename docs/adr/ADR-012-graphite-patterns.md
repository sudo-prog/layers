# Graphite Patterns (Reference-Only)

## Purpose
Document Graphite's node-graph concepts, layer model, and non-destructive editing patterns for reference in LAYERS. No code is vendored — this is a patterns document only.

## Source
- Graphite GitHub: https://github.com/GraphiteEditor/Graphite
- License: Dual MIT/Apache-2.0 (verified)
- Commit: c49c001 (Jul 12, 2020)

## Key Concepts

### 1. Node-Graph Engine (Graphene)
- Graphite's core is a node-graph engine called "Graphene"
- Nodes are connected in a DAG (directed acyclic graph)
- Each node has inputs, outputs, and parameters
- The graph is evaluated lazily — only dirty nodes recompute
- Nodes can be grouped into "node groups" for organization

### 2. Layer Model
- Layers are nodes in the graph
- Each layer has: content (vector/raster), transform, blend mode, opacity, mask
- Layers can be nested (layer groups)
- Non-destructive: original content is never modified
- Effects are applied as post-processing nodes

### 3. Non-Destructive Editing
- All operations are parametric — no destructive edits
- History is a graph of operations, not a linear stack
- Undo/redo = navigating the graph
- Brushes, erasers, and tools are also nodes

### 4. Vector Renderer (Vello)
- Graphite uses Vello for vector rendering
- Vello is a Rust library that uses wgpu for GPU acceleration
- Supports compute shaders for advanced effects
- Renders to a texture, then composites with raster layers

### 5. Document Model
- Document = layer tree + node graph
- Each layer references a node graph
- Document is serialized as JSON (with binary blobs for raster data)
- Supports versioning and incremental saves

## Patterns for LAYERS

### Pattern 1: Effect Stack as Node Graph
LAYERS' effect stack maps to a linear node graph:
```
[Input] -> [Core 1] -> [Core 2] -> ... -> [Core N] -> [Output]
```
Each core is a node with parameters. The graph is evaluated left-to-right.

### Pattern 2: Layer = Node Group
A LAYERS layer maps to a Graphite node group:
```
Layer Group
  ├── Content (vector/raster)
  ├── Transform
  ├── Effect Stack (linear graph)
  └── Mask
```

### Pattern 3: Non-Destructive Effects
LAYERS effects are non-destructive by design:
- Original content is never modified
- Effects are applied as shader passes
- Parameters are stored in JSON
- Reordering effects = reordering the node graph

### Pattern 4: Lazy Evaluation
LAYERS can adopt lazy evaluation:
- Only recompute passes when parameters change
- Cache intermediate results (FBO ping-pong)
- Invalidate cache when upstream nodes change

### Pattern 5: Pass Fusion
Adjacent compatible passes can be fused:
- Two blur passes = one blur with combined radius
- Color adjustment + blend = single pass
- Reduces GPU memory bandwidth

## Differences from LAYERS

| Aspect | Graphite | LAYERS |
|--------|----------|--------|
| Core engine | Rust/WASM (Graphene) | TypeScript (WebGL2) |
| Renderer | Vello (wgpu) | Custom WebGL2 multi-pass |
| UI | Svelte | Svelte (planned) |
| Effects | Node graph | Linear effect stack |
| Mobile | Not supported | Primary target (PWA) |
| AI | Not built-in | Built-in (Phase 1) |
| Persistence | JSON + binary | JSON only (GitHub) |

## What We Adopt
- Node-graph concepts for effect organization
- Non-destructive editing model
- Lazy evaluation and caching
- Pass fusion for optimization
- Layer = node group pattern

## What We Don't Adopt
- Rust/WASM toolchain (too heavy for 2-agent team)
- Vello renderer (we use custom WebGL2)
- Full node graph UI (we use linear effect stack)
- Graphite's editor shell (we build our own)

## References
- Graphite GitHub: https://github.com/GraphiteEditor/Graphite
- Vello: https://github.com/linebender/vello
- ADR-012: Graphite as desktop/iPad basis
- ADR-012-graphite-strategy.md: License/trademark/repo strategy
