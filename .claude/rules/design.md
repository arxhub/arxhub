---
name: design
description: The visual language of ArxHub — roles and their geometry, colour steps, type ramp, icon notation, focus and disabled treatments. Read before building or changing any UI surface.
---

<Principles>
Apply to every UI change in `packages/uikit`, `packages/config/src/ui`, `themes/*` and any `plugins/*/src/ui`.
A deviation names the rule and the reason in one line, in the code, at the point of deviation.

- **DS-1 — A repeated purpose is a role, and a role has ONE implementation.** Strip, row, page frame and control are
  roles. Geometry (height, padding, surface, border) is fixed in the role's own component and nowhere else. A surface
  that needs a role imports it from `@arxhub/uikit/core`; describing a role's geometry in a plugin component is the
  defect this rule exists to stop — eight strip implementations with five paddings is what it produced.
- **DS-2 — Colour comes from a role token, never from a literal.** No hex, no colour keyword, no `rgb()`/`oklch()` in a
  component. Text on a fill uses that role's paired `--*-contrast` token, never white.
- **DS-3 — A value the scale lacks changes the scale.** If a role needs a step that theme-preset does not have, add it
  to the existing scale in `packages/theme-preset`. A parallel set of role tokens beside the scale is not the fix.
- **DS-4 — Geometry is on a 4px grid.** Every gap, padding, margin, height and width is a multiple of 4. Hairlines
  (1px), border widths and optical marks (the 6px `StatusDot`) are the only exceptions. Type sizes are not on the grid.
- **DS-5 — A max-width is not a token.** A measure (a 720px note column, a 60ch prose block) is a decision about one
  page and lives in that page's component. Do not add measures to theme-preset.
</Principles>

<Roles>
Every value below comes from a token. A literal in place of one of these is a violation of DS-1.

- **Strip** — a horizontal band above content: a header, a tab bar, a formatting row, a filter row. `var(--size-md)`
  (40px) on desktop, `var(--size-xl)` (48px) on mobile to contain touch controls, text `var(--font-size-sm)`. One element with an optional title slot — a strip with a title and a strip with
  only controls are the same role, not two. Its two zones have one job each and are never swapped: the content zone
  (the `title` slot or the default slot) is an identifying label — a static name (`title="Vault"`) or a live one
  (a `StatusDot` plus text, as content) — paired with icon-only `IconButton`s for the strip's frequent, self-evident
  actions (new file, formatting marks); `#actions` is for occasional, commit-style controls that need a label and
  read as a decision rather than a toggle (Save, Clear, Run) — a labelled bordered `Button` belongs there and nowhere
  else in the strip. `size="lg"` on `IconButton` (`var(--size-md)`, 40px) fills the strip's own height edge to edge,
  the way `size="lg"` on nothing else does — reach for it exactly when an icon sits directly in a strip. Pair it
  with `Strip`'s `flush-actions` when the actions zone ends in one: the strip's own 8px right inset is for content
  that needs the breathing room (text, a smaller icon), and against a `size="lg"` icon it does not frame the icon,
  it silently eats into it — a title plus four `size="lg"` actions is wide enough to overflow the strip's own
  padding, which reads as "no gap" for the wrong reason (overflow, not a rule) and shifts if the title's length
  ever does. `flush-actions` makes the same edge deliberate instead.
- **Row** — one item of an enumeration: a tree node, a menu item, a settings section, a search result, a log entry.
  28px on the desktop frame, `var(--size-xl)` (48px) on the mobile frame. The frame chooses, read through
  `useShellFrame()`; the consumer gets no density prop. A single-line row lands exactly on the value; a row that
  legitimately wraps grows down from it.
  Navigation lists have no outer padding: the first row follows the strip directly, and rows fill the navigation
  width. The row itself owns the text inset, so selection fills the available width as it does in Explorer.
  Hierarchical navigation and flat section lists use uikit's `TreeView`, which composes Row and owns the
  expander/icon/name/action arrangement. Plugins supply nodes and slots rather than their own row geometry.
- **Control** — an interactive element: button, input, switch, stepper, segmented control. `var(--size-xs)` (32px).
- **Status bar** — `var(--size-md)` (40px) on the desktop frame, matching the type rail's own `size="lg"`
  `NavItem` — it spans the whole window under the rail, and a shorter bar left a jog where the two met instead of
  one level seam. Its own items (Logs, Sync, the maintenance/auth/pending-changes alerts) fill that height edge to
  edge rather than sitting as a smaller control centred inside it — the same reasoning as the Tab role below,
  applied to the same bar.
- **Page frame** — a full-height page (a settings section, a full-screen mini-app): `PageLayout`, padding
  `24px 24px 20px`, and it sets no measure. A panel of the workspace is NOT a page: it starts with a strip.
- **Tab** — keeps its own component (it carries drag-and-drop and a close control) but matches the Strip it sits in
  (`var(--size-md)`, 40px) rather than the Row role — it fills the tab bar's own height edge to edge, the way a
  `size="lg"` icon does, instead of sitting centred inside it with a gap above and below.
</Roles>

<Colour>
- **Surfaces:** page `--gray-1` · panel, rail, sidebar `--gray-2` · raised chrome, active tab, hovered fill `--gray-3`
  · hover `--gray-4`. Two strips of the same role never sit on different surfaces.
- **Borders:** `--gray-6` between regions · `--gray-4` for a hairline inside one region · `--gray-7` on an interactive
  control. Two strips of the same role never take different border steps.
- **Text:** `--gray-12` primary · `--gray-11` secondary and meta · `--gray-10` micro-labels and placeholders ·
  `--gray-9` disabled.
- **Accent is spent on selection and links only** — never as decoration. A selected row or tab is `--accent-3` +
  `--accent-11`; a solid fill is `--accent-9` + `--accent-contrast`. Accent text is step 11, not 9. One selection
  treatment for the whole product.
- **Scrim is a token and is base-dependent:** `--scrim` behind a panel (what is behind stays readable),
  `--scrim-modal` behind a dialog or sheet (it does not). Never a hand-picked `--black-a*`.
</Colour>

<Type>
- **There is no literal `font-size` in the app.** Every size goes through the ramp: `--font-size-xs` (12) micro-labels,
  meta columns, the status bar, mono facts, badges · `--font-size-sm` (14) the default for rows, strips, buttons,
  inputs, labels, form copy · `--font-size-md` (16) touch rows and the note body · `--font-size-lg` (18) ·
  `--font-size-xl` (20) a page's own h1.
- One ramp. A role that needs a size the ramp lacks changes the ramp (DS-3); a parallel set of role-named size tokens
  is not the fix.
- `--font-sans`/`--font-mono` stay as they are until someone bundles font files — a local-first app does not fetch
  fonts from a CDN.
</Type>

<Icons>
- **DS-6 — In the role of an icon, only an icon.** A glyph of action is `<Icon name="lu:<name>" />`. Letters (`B`,
  `I`, `H1`), typographic marks (`¶`, `❝`, `✕`, `−`, `↩`) and emoji are not icons. An emoji additionally carries its
  own colour, which no theme can restyle.
- **DS-7 — One concept, one glyph.** Close, delete, refresh and create have one icon each across the whole product.
  The same action in two places is the same glyph.
- **DS-8 — Size follows the role, not the call site.** 14 in a row or a strip · 16 in a touch row · 20 standalone
  (an empty state, a large accent). The set is closed; a fourth number at a call site is a violation.
- A raw text glyph stays legal only for user content, never for chrome.
</Icons>

<Focus_And_Disabled>
- **One focus treatment:** `outline: 2px solid var(--accent-8)`, offset `1px` outside chrome and `-1px` inside it.
  Every interactive element has a visible focus state and is reachable by keyboard.
- **Disabled is flat, not faded:** `--gray-3` fill, `--gray-9` text, `cursor: not-allowed`. No `opacity` — a faded
  primary button still reads as a primary button.
- **Radii by role:** `--radius-xs` rows, tabs, buttons, icon buttons · `--radius-sm` inputs, cards, menus ·
  `--radius-md` dialogs, sheets, pills · `--radius-full` dots, tracks, avatars. No literal radius.
- Every animation has a reduced-motion variant, and disabling it never removes meaning.
</Focus_And_Disabled>

<Generic_Controls>
- A generic control belongs in `@arxhub/uikit/core` and wraps Ark UI (`@ark-ui/vue`), which owns its state machine,
  keyboard model and ARIA; the wrapper owns only the box. A package outside the uikit never hand-rolls one.
- Prop names differ per component: `Checkbox`/`Switch` are controlled by `checked`, while `SegmentGroup`,
  `RadioGroup`, `NumberInput`, `Slider`, `TagsInput` and `CheckboxGroup` use `modelValue`. Binding `value` on the
  latter silently renders an empty control.
</Generic_Controls>

<Enforcement>
A rule nobody checks is a wish. Both levels run; each catches what the other cannot.

- **Source level** — `pnpm check:design` (`scripts/check-design.mjs`): refuses a colour literal in a component, a
  `font-size` outside the ramp, and a role height written as a literal where a role token exists. It names the
  surface, the rule and the value found.
- **Rendered level** — `pnpm --filter @arxhub/e2e test design` (`e2e/tests/design.spec.ts`): measures the roles on
  the running app in both frames — every strip is one height, rows of one frame are one density, switching workspace
  tabs does not move where content starts, and no glyph stands in for an icon. It reads the expected values out of
  the document's own custom properties, so a token change moves the check with it.
- **An explained exception is legal.** A `design-ignore` marker in a comment suppresses the source check for the
  rest of its block, and must carry the reason — note *content* typography is the worked example: a heading inside a
  document scales with the body it sits in, and the chrome ramp has no step for it.
- To find drift interactively rather than in CI, use the **ui-audit** skill.
</Enforcement>

<Reference>
- Prototypes: `refs/claude-design/` (`ArxHub Redesign.dc.html`, `ArxHub Mobile.dc.html`, `ArxHub Form Kit.dc.html`).
  Type sizes come from there; the fonts it names do not (see `<Type>`).
- Product register, users and personality: `AGENTS.md` → DESIGN CONTEXT.
- The two frames are separate component trees, not one tree reacting to a media query: `AGENTS.md` → "Two frames, one
  decision". A surface that genuinely differs ships two realizations behind a one-line dispatcher.
</Reference>

## Shared UI ownership

A general-purpose UI component used by more than two workspace packages (three or more) belongs
in `@arxhub/uikit/core`; migrate its consumers to that shared implementation. Feature components
remain with their domain owner even when widely embedded (for example the editor or Notes
DocumentName, which owns rename behaviour). The uikit must not depend on feature plugins.
