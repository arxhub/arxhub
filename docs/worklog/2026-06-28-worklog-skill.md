# 2026-06-28 — worklog-skill

## Focus
Added the `/worklog` skill so this intermittently-worked project keeps the *why*
behind changes and the thread of unfinished work across (roughly weekly) sessions.

## Why / what triggered it
- **`/worklog` skill** — triggered by a user pain point: working on the project ~once
  a week and forgetting what was done and, more importantly, *why*. Built to capture
  rationale + what initiated each change + what's left, in a committed, resumable log.
- **Design choices** (decided by the user when asked): store entries **in-repo and
  committed** (rationale travels with the code, shows in `git log`); two modes —
  **recap** at session start, **wrap** at session end; per-entry focus on **why /
  trigger** and **next steps**.

## What changed
- `.claude/skills/worklog/SKILL.md`: new user-invocable skill, modes `recap`
  (orient from the latest entry + git state) and `wrap` (write a dated entry).
  Explicit rule: never fabricate a rationale — ask or mark `(rationale unknown)`.
- `docs/worklog/README.md`: documents the log format, naming, and cadence.
- `.wolf/anatomy.md`, `.wolf/memory.md`: registered the new files (OpenWolf protocol).

## State
- Working: skill loads and is discoverable; `date` / `git` / `ls` commands it relies
  on were verified. The earlier `2026-06-28.md` entry (logger + VFS-append work) was
  left untouched.
- In flight: nothing from *this* session — the skill is complete.

## Next steps
- [ ] Next session, open with `/worklog recap` to confirm the orient flow reads back
      cleanly across the two 2026-06-28 entries.
- [ ] Consider wiring `recap` into a SessionStart hook later if manual invocation
      gets forgotten (deferred — keep it manual for now).
