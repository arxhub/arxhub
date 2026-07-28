---
name: ui
description: Build or change a UI surface in ArxHub so it matches the product's visual language — pick the role, reuse its one implementation, and never introduce a second place where geometry is defined.
level: 1
---

<Purpose>
Entry point for any change to a visible surface: a uikit primitive, a plugin's panel or rail, a settings page, either
shell frame. Ensures the change lands on an existing role instead of inventing a ninth strip.
</Purpose>

<Use_When>
- Adding or editing a `.vue` file under `packages/uikit/src`, `packages/config/src/ui`, or any `plugins/*/src/ui`
- Adding a header, tab bar, toolbar, filter row or any band above content
- Adding a list, tree, menu or any row of an enumeration
- Adding an icon, a button, a dialog, a sheet, an empty state
- Reviewing someone's UI diff
</Use_When>

<Do_Not_Use_When>
- The change is not visible (engine, VFS, sync, SQL index) — no visual rules apply
- You are measuring existing drift rather than writing code — use the **ui-audit** skill
- The task is to change the token scales or a theme as such — that is `packages/theme-preset` and `themes/*`, and the
  scale owner decides; this skill only consumes them
</Do_Not_Use_When>

<Steps>
1. Read `.claude/rules/design.md` in full. It is the source of truth for roles, colour steps, the type ramp, icon
   notation, focus and disabled treatments.
2. Name the role your surface needs — strip, row, control, page frame — before writing any CSS. If it is a band above
   content, it is a strip; if it is one item of an enumeration, it is a row. A panel of the workspace starts with a
   strip and is never a page.
3. Find the role's existing implementation in `packages/uikit/src/core/` and use it. Do not copy another surface's CSS
   — that is precisely how the drift spread. If the role has no implementation yet, add it there, not in the plugin.
4. Take every value from a token: heights and paddings from the sizing scale, colour from the role steps, text from
   the ramp, radii by role. If a value you need is missing, extend the existing scale in `packages/theme-preset`
   (DS-3) rather than writing a literal or a parallel token.
5. For an icon, use `<Icon name="lu:<name>" />` with the size its role dictates. Never a letter, a typographic mark or
   an emoji.
6. If the surface differs between frames, ship two realizations behind a one-line dispatcher (`useShellFrame()`), not
   `v-if="isMobile"` inside one template.
7. Check what you changed:
   1. `pnpm check:design` — the source half of the discipline. It must stay green; an exception needs a
      `design-ignore` comment carrying its reason.
   2. `pnpm --filter @arxhub/e2e test design` — the rendered half, both frames.
   3. `pnpm biome check --write <the paths you touched>` — scope it; a repo-wide run reports ~220 pre-existing
      findings, and `.vue` files where a binding is used only in the template are false positives.
   2. Build the package you touched (`pnpm --filter @arxhub/<pkg> build`) so type errors surface.
   3. Look at it in the real app — `pnpm --filter @arxhub/dev dev` — in both frames if the surface exists in both.
8. Before calling it done, verify the geometry rather than trusting the CSS: run the **ui-audit** skill on the surfaces
   you touched and confirm the role's measured height matches its token.
</Steps>

<Anti_Patterns>
- Defining `height`, `padding`, `background` or `border` for a strip or a row inside a plugin component.
- Overriding a uikit control's internals with `:deep()` from a plugin — if the control cannot do what you need, change
  the control and give it a prop.
- Reaching for `opacity` to express disabled, or a hand-picked `--black-a*` for a scrim.
- Adding a role-named parallel token (`--strip-height`) beside the scale instead of a step in the scale.
- A second registration to make the same mini-app appear in the mobile bottom bar — the mobile frame derives its keys
  from the sidebar registry already.
</Anti_Patterns>
