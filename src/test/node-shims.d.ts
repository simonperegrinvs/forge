// Minimal Node type shims for test-only helpers.
// This project intentionally avoids pulling in full `@types/node`.

declare module "node:child_process" {
  export const execFile: any;
}

declare module "node:fs/promises" {
  const fs: any;
  export default fs;
  export const mkdtemp: any;
  export const writeFile: any;
  export const readFile: any;
  export const mkdir: any;
}

declare module "node:os" {
  export const tmpdir: any;
}

declare module "node:path" {
  const path: any;
  export default path;
  export const join: any;
  export const resolve: any;
  export const dirname: any;
}

declare module "node:util" {
  export const promisify: any;
}

declare const process: any;

