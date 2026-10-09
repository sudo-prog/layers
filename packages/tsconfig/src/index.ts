/**
 * @layers/tsconfig — shared TypeScript configuration entry point.
 *
 * This package ships `base.json` (the shared compiler-options base extended by
 * every workspace package). The root `tsconfig.json` references this package
 * as a build target; the empty module here satisfies that reference so `tsc -b`
 * has a valid program to track without emitting anything.
 *
 * @module
 */
export {};
