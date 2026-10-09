/**
 * Vector editor for LAYERS web app (Stage 0.5 Feature 3)
 *
 * Simple SVG-based vector path editor with point manipulation,
 * line/curve segments, zoom, and SVG import/export.
 */

export interface VectorPoint {
  x: number;
  y: number;
}

export interface VectorSegment {
  type: "line" | "curve";
  from: number;
  to: number;
  controlX?: number;
  controlY?: number;
}

export interface VectorPath {
  points: VectorPoint[];
  segments: VectorSegment[];
}

export interface VectorEditor {
  getPaths(): VectorPath[];
  addPoint(x: number, y: number): void;
  movePoint(pathIndex: number, pointIndex: number, x: number, y: number): void;
  deletePoint(pathIndex: number, pointIndex: number): void;
  addLine(fromIndex: number, toIndex: number): void;
  addCurve(fromIndex: number, toIndex: number, controlX: number, controlY: number): void;
  newPath(): void;
  clear(): void;
  getZoom(): number;
  zoomIn(): void;
  zoomOut(): void;
  exportSVG(): string;
  importSVG(svgString: string): void;
  render(): void;
}

const SVG_NS = "http://www.w3.org/2000/svg";

function createElement(tag: string, attrs: Record<string, string>): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v);
  }
  return el;
}

export function createVectorEditor(svg: SVGSVGElement): VectorEditor {
  let paths: VectorPath[] = [];
  let currentPath = 0;
  let zoom = 1;

  function getPaths(): VectorPath[] {
    return paths;
  }

  function addPoint(x: number, y: number): void {
    if (paths.length === 0) {
      paths.push({ points: [], segments: [] });
      currentPath = 0;
    }
    paths[currentPath].points.push({ x, y });
  }

  function movePoint(pathIndex: number, pointIndex: number, x: number, y: number): void {
    const path = paths[pathIndex];
    if (!path || !path.points[pointIndex]) return;
    path.points[pointIndex].x = x;
    path.points[pointIndex].y = y;
  }

  function deletePoint(pathIndex: number, pointIndex: number): void {
    const path = paths[pathIndex];
    if (!path) return;
    path.points.splice(pointIndex, 1);
    path.segments = path.segments.filter(
      (s) => s.from !== pointIndex && s.to !== pointIndex
    );
    path.segments.forEach((s) => {
      if (s.from > pointIndex) s.from--;
      if (s.to > pointIndex) s.to--;
    });
  }

  function addLine(fromIndex: number, toIndex: number): void {
    const path = paths[currentPath];
    if (!path) return;
    path.segments.push({ type: "line", from: fromIndex, to: toIndex });
  }

  function addCurve(fromIndex: number, toIndex: number, controlX: number, controlY: number): void {
    const path = paths[currentPath];
    if (!path) return;
    path.segments.push({ type: "curve", from: fromIndex, to: toIndex, controlX, controlY });
  }

  function newPath(): void {
    paths.push({ points: [], segments: [] });
    currentPath = paths.length - 1;
  }

  function clear(): void {
    paths = [];
    currentPath = 0;
  }

  function getZoom(): number {
    return zoom;
  }

  function zoomIn(): void {
    zoom = Math.min(4, zoom * 1.25);
  }

  function zoomOut(): void {
    zoom = Math.max(0.25, zoom / 1.25);
  }

  function pathToSVG(path: VectorPath): string {
    if (path.points.length === 0) return "";
    let d = `M ${path.points[0].x} ${path.points[0].y}`;
    for (const seg of path.segments) {
      const to = path.points[seg.to];
      if (!to) continue;
      if (seg.type === "line") {
        d += ` L ${to.x} ${to.y}`;
      } else if (seg.type === "curve" && seg.controlX !== undefined && seg.controlY !== undefined) {
        d += ` Q ${seg.controlX} ${seg.controlY} ${to.x} ${to.y}`;
      }
    }
    return d;
  }

  function exportSVG(): string {
    const width = svg.getAttribute("width") || "256";
    const height = svg.getAttribute("height") || "256";
    let inner = "";
    for (const path of paths) {
      const d = pathToSVG(path);
      if (d) {
        inner += `  <path d="${d}" stroke="black" fill="none" stroke-width="2"/>\n`;
      }
    }
    return `<svg xmlns="${SVG_NS}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n${inner}</svg>`;
  }

  function importSVG(svgString: string): void {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, "image/svg+xml");
    const pathElements = doc.querySelectorAll("path");
    paths = [];
    currentPath = 0;
    for (const pathEl of pathElements) {
      const d = pathEl.getAttribute("d") || "";
      const newPath: VectorPath = { points: [], segments: [] };
      const commands = d.match(/[MLQ][^MLQ]*/g) || [];
      for (const cmd of commands) {
        const parts = cmd.trim().split(/[\s,]+/);
        const type = parts[0];
        const nums = parts.slice(1).map(Number);
        if (type === "M" && nums.length >= 2) {
          newPath.points.push({ x: nums[0], y: nums[1] });
        } else if (type === "L" && nums.length >= 2) {
          newPath.points.push({ x: nums[0], y: nums[1] });
          newPath.segments.push({ type: "line", from: newPath.points.length - 2, to: newPath.points.length - 1 });
        } else if (type === "Q" && nums.length >= 4) {
          newPath.points.push({ x: nums[2], y: nums[3] });
          newPath.segments.push({ type: "curve", from: newPath.points.length - 2, to: newPath.points.length - 1, controlX: nums[0], controlY: nums[1] });
        }
      }
      if (newPath.points.length > 0) {
        paths.push(newPath);
      }
    }
    currentPath = paths.length > 0 ? paths.length - 1 : 0;
  }

  function render(): void {
    svg.innerHTML = "";
    const grid = createElement("defs", {});
    const pattern = createElement("pattern", { id: "grid", width: "20", height: "20", patternUnits: "userSpaceOnUse" });
    pattern.appendChild(createElement("path", { d: "M 20 0 L 0 0 0 20", fill: "none", stroke: "#ccc", "stroke-width": "0.5" }));
    grid.appendChild(pattern);
    svg.appendChild(grid);
    const rect = createElement("rect", { width: "100%", height: "100%", fill: "url(#grid)" });
    svg.appendChild(rect);
    const g = createElement("g", { transform: `scale(${zoom})` });
    for (const path of paths) {
      for (const seg of path.segments) {
        const from = path.points[seg.from];
        const to = path.points[seg.to];
        if (!from || !to) continue;
        if (seg.type === "line") {
          g.appendChild(createElement("line", { x1: String(from.x), y1: String(from.y), x2: String(to.x), y2: String(to.y), stroke: "black", "stroke-width": "2" }));
        } else if (seg.type === "curve" && seg.controlX !== undefined && seg.controlY !== undefined) {
          g.appendChild(createElement("path", { d: `M ${from.x} ${from.y} Q ${seg.controlX} ${seg.controlY} ${to.x} ${to.y}`, fill: "none", stroke: "black", "stroke-width": "2" }));
        }
      }
      for (const pt of path.points) {
        g.appendChild(createElement("circle", { cx: String(pt.x), cy: String(pt.y), r: "4", fill: "red" }));
      }
    }
    svg.appendChild(g);
  }

  return {
    getPaths,
    addPoint,
    movePoint,
    deletePoint,
    addLine,
    addCurve,
    newPath,
    clear,
    getZoom,
    zoomIn,
    zoomOut,
    exportSVG,
    importSVG,
    render,
  };
}
