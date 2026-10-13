/**
 * Pass interface for the multi-pass render engine.
 *
 * Each pass receives:
 * - uTexture: input texture (read from previous pass or source)
 * - uMask: optional mask texture
 * - uOpacity: pass opacity [0, 1]
 * - uResolution: canvas resolution
 * - uTime: elapsed time in seconds
 *
 * Each pass writes to the write FBO, then the FBOs are swapped.
 */

import type { GLContext } from "./context.js";
import type { PingPongFBO } from "./fbo.js";

export interface PassUniforms {
  uTexture: WebGLUniformLocation | null;
  uMask: WebGLUniformLocation | null;
  uOpacity: WebGLUniformLocation | null;
  uResolution: WebGLUniformLocation | null;
  uTime: WebGLUniformLocation | null;
}

export interface PassParams {
  opacity: number;
  mask?: WebGLTexture | null;
  enabled: boolean;
}
export interface Pass {
  /** Unique pass identifier */
  readonly id: string;
  /** Human-readable name */
  readonly name: string;
  /** Whether this pass is currently active */
  enabled: boolean;
  /** Compile the shader program */
  compile(gl: WebGL2RenderingContext): WebGLProgram | null;
  /** Set uniforms before rendering */
  setUniforms(gl: WebGL2RenderingContext, program: WebGLProgram, params: PassParams, time: number): void;
  /** Get the fragment shader source */
  getFragmentShader(): string;
  /** Get the vertex shader source (shared) */
  getVertexShader(): string;
  /** Clean up GL resources */
  dispose(gl: WebGL2RenderingContext): void;
}

export const QUAD_VERTEX_SHADER = `#version 300 es
precision highp float;

// Explicit locations: GLSL ES 3.0 does not guarantee any implicit binding
// order, so pinning these keeps createQuadVAO()'s hardcoded locations valid.
layout(location = 0) in vec2 aPosition;
layout(location = 1) in vec2 aTexCoord;

out vec2 vTexCoord;

void main() {
  vTexCoord = aTexCoord;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

export function createQuadVAO(gl: WebGL2RenderingContext): WebGLVertexArrayObject {
  const vao = gl.createVertexArray();
  if (!vao) throw new Error("Failed to create VAO");

  gl.bindVertexArray(vao);

  // Full-screen quad: positions + texcoords
  const vertices = new Float32Array([
    -1, -1, 0, 0,
     1, -1, 1, 0,
    -1,  1, 0, 1,
     1,  1, 1, 1,
  ]);

  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

  // aPosition (location 0)
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);

  // aTexCoord (location 1)
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

  gl.bindVertexArray(null);
  return vao;
}

export function createPassUniforms(
  gl: WebGL2RenderingContext,
  program: WebGLProgram
): PassUniforms {
  return {
    uTexture: gl.getUniformLocation(program, "uTexture"),
    uMask: gl.getUniformLocation(program, "uMask"),
    uOpacity: gl.getUniformLocation(program, "uOpacity"),
    uResolution: gl.getUniformLocation(program, "uResolution"),
    uTime: gl.getUniformLocation(program, "uTime"),
  };
}
