// Access to the vendored Skulpt (loaded by classic <script> tags, or by src/test/setupSkulpt.ts in tests).

export function sk(): any {
  return (globalThis as any).Sk;
}

export function configureSkulpt(opts: { output: (s: string) => void; yieldLimit?: number }): void {
  sk().configure({
    __future__: sk().python3,
    output: opts.output,
    // Sk.configure checks `"yieldLimit" in opts`, so an omitted limit must not be passed as undefined.
    ...(opts.yieldLimit !== undefined && { yieldLimit: opts.yieldLimit }),
    read: (path: string) => {
      const files = sk().builtinFiles.files;
      if (files[path] !== undefined) return files[path];
      // `from robot import *` must succeed, so the robot module is an empty file.
      if (path.split('/').pop() === 'robot.py') return '';
      throw `File not found: '${path}'`;
    },
  });
}
