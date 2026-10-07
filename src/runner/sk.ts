// Access to the vendored Skulpt (loaded by classic <script> tags, or by src/test/setupSkulpt.ts in tests).

export function sk(): any {
  return (globalThis as any).Sk;
}

export function configureSkulpt(opts: { output: (s: string) => void; yieldLimit?: number }): void {
  patchWakeCheck();
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

// Skulpt 1.2.0 defect: when a suspended frame wakes, it checks its time slice before it uses the value
// (or the suspension) that its resumed call returned. If the resume took longer than yieldLimit (a
// stall, or a resumed inner function computing for a while), the frame yields there and the value is
// lost. Each compiled frame therefore skips that one check right after waking.
function patchWakeCheck(): void {
  const Sk = sk();
  if (Sk.compile.$wakePatched) return;
  const compile = Sk.compile;
  Sk.compile = (...args: unknown[]) => {
    const compiled = compile(...args);
    compiled.code = compiled.code
      .replaceAll('var $wakeFromSuspension = function() {', 'var $woke = false;var $wakeFromSuspension = function() {$woke = true;')
      .replaceAll('if ($dateNow - Sk.lastYield > Sk.yieldLimit) {', 'if (!$woke && $dateNow - Sk.lastYield > Sk.yieldLimit) {')
      .replaceAll('$susp.optional = true;return $susp;}', '$susp.optional = true;return $susp;}$woke = false;');
    return compiled;
  };
  Sk.compile.$wakePatched = true;
}
