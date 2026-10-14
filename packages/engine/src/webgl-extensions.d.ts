/**
 * Type declarations for the WEBGL_get_program_binary extension.
 *
 * This extension allows retrieving and restoring compiled shader program
 * binaries, enabling persistent shader compile caches that survive page
 * reloads.
 */

interface WebGL2RenderingContext {
  getProgramBinary(program: WebGLProgram, length: number): ArrayBuffer;
  programBinary(
    program: WebGLProgram,
    binaryFormat: number,
    binary: ArrayBuffer
  ): boolean;
  readonly PROGRAM_BINARY_LENGTH: number;
  readonly PROGRAM_BINARY_FORMATS: number;
}
