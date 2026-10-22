import { describe, it, expect, beforeEach } from "vitest";
import {
  ShaderCompileCache,
  computeShaderHash,
  base64ToArrayBuffer,
} from "../src/shader-compile-cache.js";

const VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPosition;
out vec2 vTexCoord;
void main() { vTexCoord = aPosition; gl_Position = vec4(aPosition, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float;
in vec2 vTexCoord;
out vec4 fragColor;
void main() { fragColor = vec4(vTexCoord, 0.0, 1.0); }`;

beforeEach(() => {
  localStorage.clear();
});

describe("computeShaderHash", () => {
  it("produces the same hash for identical inputs", () => {
    const h1 = computeShaderHash(VS, FS);
    const h2 = computeShaderHash(VS, FS);
    expect(h1).toBe(h2);
  });

  it("produces different hashes for different fragment shaders", () => {
    const h1 = computeShaderHash(VS, FS);
    const h2 = computeShaderHash(VS, FS + "// changed");
    expect(h1).not.toBe(h2);
  });

  it("produces different hashes for different vertex shaders", () => {
    const h1 = computeShaderHash(VS, FS);
    const h2 = computeShaderHash(VS + "// changed", FS);
    expect(h1).not.toBe(h2);
  });
});

describe("ShaderCompileCache", () => {
  it("returns null when no entry exists", () => {
    const cache = new ShaderCompileCache();
    const hash = computeShaderHash(VS, FS);
    expect(cache.get(hash)).toBeNull();
  });

  it("stores and retrieves a program entry", () => {
    const cache = new ShaderCompileCache();
    const hash = computeShaderHash(VS, FS);
    const binary = new Uint8Array([1, 2, 3, 4]).buffer;
    cache.set(hash, binary, 12345);

    const entry = cache.get(hash);
    expect(entry).not.toBeNull();
    expect(entry!.binaryFormat).toBe(12345);
    expect(entry!.hash).toBe(hash);
  });

  it("persists across cache instances (simulates page reload)", () => {
    const cache1 = new ShaderCompileCache();
    const hash = computeShaderHash(VS, FS);
    const binary = new Uint8Array([10, 20, 30]).buffer;
    cache1.set(hash, binary, 999);

    // New instance = new page load, reads from localStorage
    const cache2 = new ShaderCompileCache();
    const entry = cache2.get(hash);
    expect(entry).not.toBeNull();
    expect(entry!.binaryFormat).toBe(999);

    // Verify the binary round-trips correctly
    const restored = base64ToArrayBuffer(entry!.binary);
    expect(new Uint8Array(restored)).toEqual(new Uint8Array([10, 20, 30]));
  });

  it("returns null for unknown hashes after persistence", () => {
    const cache1 = new ShaderCompileCache();
    const hash = computeShaderHash(VS, FS);
    cache1.set(hash, new Uint8Array([1]).buffer, 1);

    const cache2 = new ShaderCompileCache();
    const unknownHash = computeShaderHash("other", "shaders");
    expect(cache2.get(unknownHash)).toBeNull();
  });

  it("clear removes all entries and cleans up localStorage", () => {
    const cache = new ShaderCompileCache();
    cache.set(computeShaderHash(VS, FS), new Uint8Array([1]).buffer, 1);
    cache.set(computeShaderHash(FS, VS), new Uint8Array([2]).buffer, 2);

    expect(cache.get(computeShaderHash(VS, FS))).not.toBeNull();
    cache.clear();
    expect(cache.get(computeShaderHash(VS, FS))).toBeNull();
    expect(cache.get(computeShaderHash(FS, VS))).toBeNull();
  });

  it("overwrites existing entry when set is called twice with same hash", () => {
    const cache = new ShaderCompileCache();
    const hash = computeShaderHash(VS, FS);
    cache.set(hash, new Uint8Array([1]).buffer, 100);
    cache.set(hash, new Uint8Array([2, 3]).buffer, 200);

    const entry = cache.get(hash);
    expect(entry!.binaryFormat).toBe(200);
    const restored = new Uint8Array(base64ToArrayBuffer(entry!.binary));
    expect(restored).toEqual(new Uint8Array([2, 3]));
  });

  it("handles localStorage being unavailable gracefully", () => {
    const originalGetItem = localStorage.getItem;
    const originalSetItem = localStorage.setItem;
    localStorage.getItem = () => {
      throw new Error("localStorage unavailable");
    };
    localStorage.setItem = () => {
      throw new Error("localStorage unavailable");
    };

    const cache = new ShaderCompileCache();
    // Should not throw
    cache.set(computeShaderHash(VS, FS), new Uint8Array([1]).buffer, 1);
    expect(cache.get(computeShaderHash(VS, FS))).not.toBeNull();

    localStorage.getItem = originalGetItem;
    localStorage.setItem = originalSetItem;
  });
});
