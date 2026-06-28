---
name: worklog
description: Use to capture or recall project work progress across sessions — what was done, WHY it was done, what triggered it, and what's left to do. Run at the start of a work session to recap where you left off, and at the end to record a new entry. Triggers on "what was I doing", "where did I leave off", "wrap up", "log progress", "save my progress", "/worklog", or when resuming a project after time away. For this monorepo that's worked on intermittently (e.g. weekly).
version: 1.0.0
user-invocable: true
argument-hint: "[recap | wrap]"
allowed-tools:
  - Bash(date *)
  - Bash(git log *)
  - Bash(git status *)
  - Bash(git diff *)
  - Bash(ls *)
---

Maintains a committed work log at `docs/worklog/` so the user — who works on this project intermittently — never loses the *why* behind past changes or the thread of what's unfinished.

Entries focus on **rationale and what triggered the work** and **what's left / next steps**, not just a list of files. The user explicitly cares about remembering *why* a change was made and *what initiated it*.

## Modes

Pick the mode from the argument. If none is given, infer: at the obvious start of a session (no work done yet this conversation) default to **recap**; if the user has just finished work or says they're stopping, default to **wrap**. When genuinely ambiguous, ask.

---

### `recap` — start of session

Goal: get the user oriented in under a screen of text.

1. Find recent entries: `ls docs/worklog/` (date-prefixed, so the latest date sorts last; ignore `README.md`). Read the most recent entry in full, and skim the one before it. If a single day has multiple entries, read all of that day's.
2. Show what changed since that entry was written, so the recap reflects reality, not just the note:
   - `git log --oneline -15`
   - `git status --short` (uncommitted work-in-progress is the strongest "where I left off" signal)
3. Present a tight recap:
   - **Last session** (date) — what it was about and *why*.
   - **In flight** — uncommitted changes / open threads from the last entry's "Next steps".
   - **Suggested next step** — one concrete thing to pick up, drawn from the last entry.
4. Do not start working unless asked. End by asking what they want to tackle.

If `docs/worklog/` has no entries yet, say so and offer to start logging from this session.

---

### `wrap` — end of session

Goal: write one entry that a cold reader (the user, next week) can resume from.

1. Determine the date: `date +%Y-%m-%d`.
2. Gather ground truth — don't rely on memory of the conversation alone:
   - `git status --short` and `git diff --stat` for uncommitted changes.
   - `git log --oneline` for commits made since the last entry.
3. Reconstruct the *why*. For each meaningful chunk of work, capture **what triggered it** (a bug, a user request, a refactor goal, an idea) — this is the part the user most wants preserved. If the trigger isn't clear from context, ask the user a short question rather than guessing.
4. Choose the filename: `docs/worklog/YYYY-MM-DD-<feature>.md`, where `<feature>` is a short kebab-case slug naming what the session was about (e.g. `2026-06-28-log-viewer.md`, `2026-06-28-worklog-skill.md`) — so the directory listing is self-describing. If that exact name already exists, append `-2`, `-3`, etc. (check with `ls`). One file per entry — never rewrite an old one.
5. Write the entry using the template below.
6. Show the user the entry. Ask whether to commit it (respect their commit conventions — direct to `main`, no Co-Authored-By trailer for this project). Do not auto-commit unless they confirm.

## Entry template

```markdown
# YYYY-MM-DD

## Focus
One or two sentences: what this session was about.

## Why / what triggered it
- <change or task> — triggered by <bug report / user request / refactor goal / idea>; done because <rationale>.
- <change or task> — triggered by ...; done because ...

## What changed
- <file or area>: <one line>. (cite commits as `<short-sha>` when relevant)

## State
- Working: <what's solid / verified>
- In flight: <uncommitted or half-done work, with where it stands>

## Next steps
- [ ] <concrete next action, with enough context to resume cold>
- [ ] <open question or decision pending>
```

## Rules

- Keep entries scannable. Prefer bullets over prose. The *why* and *next steps* sections matter most — never leave them empty.
- This skill only touches `docs/worklog/`. It does not edit the OpenWolf `.wolf/` files (memory.md / cerebrum.md serve a different, token-discipline purpose).
- Never fabricate a rationale. If you don't know why something was done, ask or mark it `(rationale unknown)`.
- Dates come from the `date` command, never assumed.
