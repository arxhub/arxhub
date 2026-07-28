---
name: ui-audit
description: Measure the visual roles on the running app with Playwright and report drift — strip heights, row densities, surfaces, borders, icon notation. Use to verify a UI change or to find where the design language has slipped.
level: 3
---

<Purpose>
Answers "do the roles actually hold on screen?" with measured numbers instead of read CSS. Reading a stylesheet tells
you what one component intends; only the rendered app tells you that two strips are 40px and 33px, that a component
does not render at all, or that a panel wears a page header.
</Purpose>

<Use_When>
- Verifying a UI change against `.claude/rules/design.md` before calling it done
- The user reports the design looks uneven, inconsistent, or "crooked"
- Auditing drift across surfaces after a period of feature work
- Establishing whether a claimed inconsistency is real before planning work on it
</Use_When>

<Do_Not_Use_When>
- You are writing the UI code — use the **ui** skill
- The question is about a token's value (read `packages/theme-preset/src/styles/`) rather than what rendered
</Do_Not_Use_When>

<Steps>
1. Read `.claude/rules/design.md` — the roles and their expected values are what you measure against.
2. Write a throwaway spec at `e2e/tests/_audit.spec.ts`. It must live under `e2e/tests/` — Playwright only collects
   files inside `testDir`, so a script in a scratch directory will not run.
3. Reuse the suite's fixtures (`./fixtures`): `test` (seeds a paired identity), `vault` (writes notes through the
   filesystem), `isMobileFrame`, `openNavigation`, `openMiniApp`, `openSearchApp`, `openSettingsSection`,
   `withShellChrome`. Never hand-roll navigation — the mobile frame keeps mini-apps behind a sheet and the helpers
   already know that.
4. Measure with both the box and the computed style, because the drift lives in both:
   1. `await el.boundingBox()` → the rendered height, which is what the user sees;
   2. `getComputedStyle(node)` → `padding`, `backgroundColor`, `borderBottomWidth`/`Color`, `fontSize`, which resolve
      tokens to real values and so expose two strips sitting on different surface steps.
5. Write each measurement to a file (`appendFileSync` a JSONL line) **and** log it. Screenshot each surface.
   Point the output at the session scratchpad via an env var, not into the repo.
6. Run one test per surface group rather than one long test — the default timeout is 30s per test, and a single
   walk-everything test times out halfway with nothing written.
7. Run it: `AUDIT_OUT=<dir> pnpm --filter @arxhub/e2e test _audit --workers=2`. Redirect to a log file. Do **not**
   pipe into `head`/`grep` — closing the pipe kills the run mid-way and you get a partial audit that looks complete.
8. Crop the interesting strips out of the screenshots and look at them (`magick <png> -crop WxH+X+Y -resize 300%`).
   The icon-notation defects are visible and not measurable: a colour emoji among monochrome icons only shows up here.
9. Delete the spec and `e2e/test-results/` when done. The audit is a measurement, not a suite member — a permanent
   version of it belongs in the enforcement check, not in `e2e/tests/`.
10. Report per role: the value each surface rendered, which token it should have come from, and the delta. Attach the
    crop for anything visual. State plainly what you could not measure rather than inferring it from CSS.
</Steps>

<Gotchas>
- **The suite boots its own stand** on ports 3100/3101 against a temp `ARXHUB_DATA_DIR`. Never point it at the default
  data dir: the stand pins the TOFU key of the first device it sees and would unpair the developer's real devices.
- **A component that does not render measures as absent, not as wrong.** The desktop `.app-header` only mounts when it
  has content, so its literal height is a code-level finding with no on-screen effect. Report the difference.
- **In `single` layout mode every page stays mounted** (`v-show`, not `v-if`), so a selector like `.page > .header`
  matches all of them and `.first()` silently returns whichever is first in the DOM. Scope to the visible one.
- **Screenshot after the assertion, not after the click.** A shot taken immediately after a click can catch the
  previous state and invent a defect — a mismatch between a selected nav row and the visible page turned out to be
  exactly this.
- **`isMobileFrame()` waits for the mount.** The app boots asynchronously; reading the DOM straight after `reload()`
  races it and reports the wrong frame.
- A frame-specific test must skip itself on the other frame (`test.skip(await isMobileFrame(page), 'desktop only')`) —
  both Playwright projects run every spec.
</Gotchas>

<Reference>
`reference/baseline-2026-07-28.md` — the first full audit: what each role measured, which surfaces drifted, and the two
crops showing the icon-notation split between the two editors. Use it as the before-picture; a later audit reports
against it.
</Reference>
