# FE-owned fixes pending Mac agent application

**Status (2026-10-23):** all three fixes below are applied on the ThinkPad and verified
green there (`pnpm test` 19/19, `pnpm lint` 7/7, `pnpm exec tsc -b` exit 0), but the
ThinkPad's pre-commit ownership hook correctly refuses FE-owned paths, so they cannot be
committed from this machine. They are recorded here so the Mac agent can apply them.

The three files are FE-owned per `CODEOWNERS`:

    /apps/           -> apps/web/src/debugSession.ts
    /packages/ui/    -> packages/ui/test/tokens.test.ts
    /tests/e2e/      -> tests/e2e/engine-live.mjs

---

## 1. packages/ui/test/tokens.test.ts — THE ONLY REMAINING CI FAILURE

CI: `Failed: @layers/ui#test`
```
AssertionError: expected ':root {\n  --bg-primary: #0a0b0d;\n  …' to contain '--bg-primary: #0a0a0a'
```

The test is wrong, not the source. `packages/ui/src/tokens.ts` defines the dark "Graphite"
ramp with `dark: "#0a0b0d"`. Commit `bee8d84` re-tuned it from `#0a0a0a` to `#0a0b0d` and
this expectation was never updated.

Find (line ~40, inside `it("generates dark theme", ...)`):

    expect(css).toContain("--bg-primary: #0a0a0a");

Replace with:

    // Graphite ramp: see packages/ui/src/tokens.ts — dark bg is #0a0b0d, not #0a0a0a.
    expect(css).toContain("--bg-primary: #0a0b0d");

Verified: `pnpm test --filter @layers/ui` -> Test Files 1 passed (1), Tests 9 passed (9).

---

## 2. apps/web/src/debugSession.ts — dead code + wrong mutability

**(a)** `frameTimes` is never reassigned, so `let` should be `const`.

Find:

    let frameTimes: number[] = [];

Replace with:

    const frameTimes: number[] = [];

**(b)** `fpsBuffer` has zero uses anywhere in the repo (confirmed with
`grep -rn "fpsBuffer" apps/ packages/ services/ --include=*.ts` -> no matches). Delete
this line entirely:

    let fpsBuffer: number[] = [];

---

## 3. tests/e2e/engine-live.mjs — browser-launch resilience

**Context:** the e2e task used to abort the whole file when Chromium was killed mid-run:

```
FATAL: page.evaluate: Target page, context or browser has been closed
  at main (tests/e2e/engine-live.mjs:226)
```

**Root cause was found and fixed elsewhere** — the host's `resource-watchdog.sh` cron
was SIGKILLing the browser (see the commit history; CI now shows `@layers/e2e:test`
`13/13 checks passed`). This change is belt-and-braces so a future transient kill
degrades to a recorded FAIL instead of discarding every check that already passed.

### Change A — add a retrying launcher (insert after the `record()` function)

    async function launchBrowser(attempts = 3, delayMs = 4000) {
      const args = [
        "--headless=new",
        "--use-gl=angle",
        "--use-angle=swiftshader-webgl",
        "--enable-unsafe-swiftshader",
        "--disable-dev-shm-usage",
        "--no-sandbox",
        // NOTE: no --js-flags heap cap here. An earlier attempt used
        // --js-flags=--max-old-space-size=512 to bound the renderer under CI memory
        // pressure, but it made SwiftShader silently no-op: the 2-pass @ 512
        // benchmark reported 22222 fps (0.04 ms/frame) because the GPU process
        // could not allocate its rasteriser and rendered nothing. A benchmark that
        // reports an impossible number is worse than a crash — leave the heap
        // uncapped and handle a mid-run kill as a failed check instead.
      ];
      let lastErr = null;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          const browser = await chromium.launch({ args });
          if (attempt > 1) {
            console.log(`  (browser launched on attempt ${attempt}/${attempts})`);
          }
          return browser;
        } catch (e) {
          lastErr = e;
          if (attempt < attempts) {
            console.log(`  (browser launch attempt ${attempt}/${attempts} failed: ${String(e).slice(0, 120)} — retrying)`);
            await new Promise((r) => setTimeout(r, delayMs));
          }
        }
      }
      throw lastErr;
    }

### Change B — replace the inline launch with the retrying one

Find:

    const browser = await chromium.launch({
      args: [
        "--headless=new",
        "--use-gl=angle",
        "--use-angle=swiftshader-webgl",
        "--enable-unsafe-swiftshader",
        "--disable-dev-shm-usage",
        "--no-sandbox",
      ],
    });

Replace with:

    const browser = await launchBrowser();

### Change C — make a mid-run kill non-fatal

Find (the FPS benchmark, `const fpsResult = await page.evaluate(() => {`):

    const fpsResult = await page.evaluate(() => {

Replace with:

    let fpsResult;
    try {
      fpsResult = await page.evaluate(() => {

Then find the end of that call (the closing `});` followed by the benchmark print loop):

    return {
      "1p@512": bench(1, 512, 512, 20),
      "2p@512": bench(2, 512, 512, 20),
      "4p@512": bench(4, 512, 512, 10),
      "8p@1024": bench(8, 1024, 1024, 10),
      "8p@1536": bench(8, 1536, 1536, 5),
    };
    });

    console.log("\n=== SwiftShader benchmark (readPixels-synced, CPU raster) ===");
    for (const [k, v] of Object.entries(fpsResult)) {
      console.log(`  ${k.padEnd(9)}: ${String(v.fps).padStart(5)} fps  (${v.msPerFrame} ms/frame)`);
    }
    record(
      "Pipeline is stall-free (8 passes @ 1536 completes)",
      fpsResult["8p@1536"].msPerFrame < 20000,
      `8p@1536 = ${fpsResult["8p@1536"].msPerFrame} ms/frame (SwiftShader CPU bound; real GPU gate needs hardware)`
    );

Replace with:

      return {
        "1p@512": bench(1, 512, 512, 20),
        "2p@512": bench(2, 512, 512, 20),
        "4p@512": bench(4, 512, 512, 10),
        "8p@1024": bench(8, 1024, 1024, 10),
        "8p@1536": bench(8, 1536, 1536, 5),
      };
      });
    } catch (e) {
      // Browser was killed mid-benchmark (memory pressure on the shared runner).
      // Record a FAIL with the reason so the run continues to the remaining
      // checks instead of aborting the whole file.
      record("SwiftShader benchmark (8 passes @ 1536)", false, `browser unavailable: ${String(e).slice(0, 140)}`);
      fpsResult = null;
    }

    if (fpsResult) {
      console.log("\n=== SwiftShader benchmark (readPixels-synced, CPU raster) ===");
      for (const [k, v] of Object.entries(fpsResult)) {
        console.log(`  ${k.padEnd(9)}: ${String(v.fps).padStart(5)} fps  (${v.msPerFrame} ms/frame)`);
      }
      record(
        "Pipeline is stall-free (8 passes @ 1536 completes)",
        fpsResult["8p@1536"].msPerFrame < 20000,
        `8p@1536 = ${fpsResult["8p@1536"].msPerFrame} ms/frame (SwiftShader CPU bound; real GPU gate needs hardware)`
      );
    }

Verified: `node --check tests/e2e/engine-live.mjs` OK; `node tests/e2e/engine-live.mjs`
-> `13/13 checks passed, 0 failed`.

---

## Verification summary (ThinkPad, 2026-10-23)

    pnpm test            19/19 tasks
    pnpm lint             7/7 tasks, 0 errors
    pnpm exec tsc -b      exit 0
    pnpm build            9/9 tasks
    cores-golden --verify 8/8 passed
