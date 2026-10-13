// @vitest-environment jsdom
/**
 * Tests for vector editor (Stage 0.5 Feature 3)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createVectorEditor,
  type VectorEditor,
  type VectorPath,
  type VectorPoint,
} from "./vectorEditor";

describe("vector editor", () => {
  let editor: VectorEditor;
  let svg: SVGSVGElement;

  beforeEach(() => {
    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "256");
    svg.setAttribute("height", "256");
    document.body.appendChild(svg);
    editor = createVectorEditor(svg);
  });

  describe("createVectorEditor", () => {
    it("creates a vector editor with default state", () => {
      expect(editor).toBeDefined();
      expect(editor.getPaths()).toEqual([]);
      expect(editor.getZoom()).toBe(1);
    });
  });

  describe("addPoint", () => {
    it("adds a point to the current path", () => {
      editor.addPoint(100, 100);
      const paths = editor.getPaths();
      expect(paths.length).toBe(1);
      expect(paths[0].points.length).toBe(1);
      expect(paths[0].points[0].x).toBe(100);
      expect(paths[0].points[0].y).toBe(100);
    });

    it("adds multiple points to the current path", () => {
      editor.addPoint(100, 100);
      editor.addPoint(200, 200);
      const paths = editor.getPaths();
      expect(paths.length).toBe(1);
      expect(paths[0].points.length).toBe(2);
    });
  });

  describe("movePoint", () => {
    it("moves a point to a new position", () => {
      editor.addPoint(100, 100);
      editor.movePoint(0, 0, 150, 150);
      const paths = editor.getPaths();
      expect(paths[0].points[0].x).toBe(150);
      expect(paths[0].points[0].y).toBe(150);
    });
  });

  describe("deletePoint", () => {
    it("deletes a point from the current path", () => {
      editor.addPoint(100, 100);
      editor.addPoint(200, 200);
      editor.deletePoint(0, 0);
      const paths = editor.getPaths();
      expect(paths[0].points.length).toBe(1);
    });
  });

  describe("addLine", () => {
    it("adds a line segment between two points", () => {
      editor.addPoint(100, 100);
      editor.addPoint(200, 200);
      editor.addLine(0, 1);
      const paths = editor.getPaths();
      expect(paths[0].segments.length).toBe(1);
      expect(paths[0].segments[0].type).toBe("line");
    });
  });

  describe("addCurve", () => {
    it("adds a quadratic bezier curve", () => {
      editor.addPoint(100, 100);
      editor.addPoint(200, 200);
      editor.addCurve(0, 1, 150, 50);
      const paths = editor.getPaths();
      expect(paths[0].segments.length).toBe(1);
      expect(paths[0].segments[0].type).toBe("curve");
    });
  });

  describe("newPath", () => {
    it("starts a new path", () => {
      editor.addPoint(100, 100);
      editor.newPath();
      editor.addPoint(200, 200);
      const paths = editor.getPaths();
      expect(paths.length).toBe(2);
      expect(paths[0].points.length).toBe(1);
      expect(paths[1].points.length).toBe(1);
    });
  });

  describe("clear", () => {
    it("clears all paths", () => {
      editor.addPoint(100, 100);
      editor.addPoint(200, 200);
      editor.clear();
      expect(editor.getPaths()).toEqual([]);
    });
  });

  describe("zoom", () => {
    it("zooms in", () => {
      const initialZoom = editor.getZoom();
      editor.zoomIn();
      expect(editor.getZoom()).toBeGreaterThan(initialZoom);
    });

    it("zooms out", () => {
      const initialZoom = editor.getZoom();
      editor.zoomOut();
      expect(editor.getZoom()).toBeLessThan(initialZoom);
    });

    it("clamps zoom to minimum 0.25", () => {
      for (let i = 0; i < 10; i++) editor.zoomOut();
      expect(editor.getZoom()).toBe(0.25);
    });

    it("clamps zoom to maximum 4", () => {
      for (let i = 0; i < 20; i++) editor.zoomIn();
      expect(editor.getZoom()).toBe(4);
    });
  });

  describe("exportSVG", () => {
    it("exports paths as SVG string", () => {
      editor.addPoint(100, 100);
      editor.addPoint(200, 200);
      editor.addLine(0, 1);
      const svgString = editor.exportSVG();
      expect(svgString).toContain("<svg");
      expect(svgString).toContain("<path");
      expect(svgString).toContain('d="M 100 100 L 200 200"');
    });

    it("exports empty SVG when no paths", () => {
      const svgString = editor.exportSVG();
      expect(svgString).toContain("<svg");
      expect(svgString).not.toContain("<path");
    });
  });

  describe("importSVG", () => {
    it("imports paths from SVG string", () => {
      const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path d="M 100 100 L 200 200" stroke="black" fill="none"/></svg>`;
      editor.importSVG(svgString);
      const paths = editor.getPaths();
      expect(paths.length).toBe(1);
      expect(paths[0].points.length).toBe(2);
    });

    it("imports curves from SVG string", () => {
      const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path d="M 100 100 Q 150 50 200 200" stroke="black" fill="none"/></svg>`;
      editor.importSVG(svgString);
      const paths = editor.getPaths();
      expect(paths.length).toBe(1);
      expect(paths[0].segments.length).toBe(1);
      expect(paths[0].segments[0].type).toBe("curve");
    });

    it("handles invalid SVG gracefully", () => {
      editor.importSVG("<invalid>");
      expect(editor.getPaths()).toEqual([]);
    });
  });

  describe("render", () => {
    it("renders points to the SVG element", () => {
      editor.addPoint(100, 100);
      editor.render();
      const circles = svg.querySelectorAll("circle");
      expect(circles.length).toBeGreaterThan(0);
    });

    it("renders paths to the SVG element", () => {
      editor.addPoint(100, 100);
      editor.addPoint(200, 200);
      editor.addLine(0, 1);
      editor.render();
      const paths = svg.querySelectorAll("path");
      expect(paths.length).toBeGreaterThan(0);
    });
  });
});
