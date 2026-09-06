# Application icon

`icon.svg` is the source of truth. Every file beside it — `*.png`, `icon.icns`, `icon.ico`, `ios/` —
is generated from it and must never be hand-edited.

## The mark

A square with its top-right quarter taken out, and that quarter set beside it as a separate piece.

The big neutral form is the core; the accent piece is a module. ArxHub is an assembly — everything the
app can do arrives as a plugin — so the mark shows the shape that is only whole once something is
plugged into it, and it shows the seam. The neutral form is the tool and recedes; the one accent
piece is what was added to it.

No letter, no glyph, no gradient: three flat shapes, which is what survives a 16px raster.

## Colours

Literal hex, because an icon file cannot read CSS variables. Each value is a design token copied
verbatim — change one here only when the token itself changes.

| Part   | Value     | Token     | Where it comes from                                   |
|--------|-----------|-----------|-------------------------------------------------------|
| Tile   | `#21201c` | `sand-12` | `packages/theme-preset/src/colors/sand.css` — the product's ink |
| Core   | `#fdfdfc` | `sand-1`  | same file — the paper the app is written on            |
| Module | `#00a2c7` | `cyan-9`  | `packages/theme-preset/src/colors/cyan.css` — the accent, and the one step whose value is identical in the light and dark arms |

The tile ground is what makes the mark legible on a light dock, a dark dock and a photo wallpaper
alike; the icon is an image, not a themed component, so it does not follow the user's theme.

## Geometry

512 grid, everything on 8. The rule that decides the shapes: **no feature or seam below 48 units** —
48/512 is 1.5px at 16px, and anything thinner turns to grey mush when the raster set is downscaled.
The seam between core and module is exactly 48; the module is 144; the thinnest arm of the core is
144. Radii are 112 tile (the 22% app-tile convention) / 48 outer / 32 module / 16 at the notch.

Earlier attempts that broke this rule are the reason it is written down: a bracket frame at 44 units
and a hub with four small satellites both read fine at 512 and were illegible at 16.

## Regenerating the raster set

```bash
pnpm --filter app exec tauri icon icons/icon.svg
```

Tauri 2.11 accepts an SVG source (it renders through resvg) and rewrites every raster in this folder
plus `ios/`. Two things resvg is strict about: an XML comment may not contain `--` (so the token names
above are written without their CSS prefix inside `icon.svg`), and the source must be square.

Check the result at 16px before committing it — that size, not 512, is what decides whether the mark
works.
