# @arxhub/theme-preset

A collection of low-level CSS design tokens and styles for the Arxhub ecosystem.

## Structure

This package contains the core tokens (colors, radii, shadows, sizing) and the CSS reset.

- **Colors:** Radix Colors palette.
- **Styles:** Typography, radii, shadows, z-index, sizing.
- **Reset:** Modern CSS reset.

## Usage

Import the core tokens you need (colors) and the design tokens (styles).

```scss
@import "@arxhub/theme-preset";
```

## Themes

This preset is meant to be used with a **Theme** package that maps the colors to semantic variables (`--gray-*`, `--accent-*`).

### Creating a Theme

To create a new theme (e.g., `my-theme`), create a folder in your project or a separate package.

1.  Create `my-theme/index.css`.
2.  Import the preset and map your chosen colors to `--gray` and `--accent`.

```css
/* my-theme/index.css */
@import "@arxhub/theme-preset/src/index.css";

:root {
  /* Map 'slate' to --gray */
  --gray-1: var(--slate-1);
  /* ... repeat for 1-12 and a1-a12 ... */

  /* Map 'indigo' to --accent */
  --accent-1: var(--indigo-1);
  /* ... repeat for 1-12 and a1-a12 ... */
}
```

3.  Import your theme in your application.

### Default Theme

You can use the official default theme:

```bash
npm install @arxhub/theme-default
```

```scss
@import "@arxhub/theme-default/index.css";
```

## Design Tokens

### Sizing System

| Size | Primary Height | Half Height (Icons/Badges) |
| :--- | :--- | :--- |
| **xs** | 32px | 16px |
| **sm** | 36px | 18px |
| **md** | 40px | 20px |
| **lg** | 44px | 22px |
| **xl** | 48px | 24px |
| **2xl** | 64px | 32px |

### ...

(License and other details from previous README)
