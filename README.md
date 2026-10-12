# shadcn-components

The `soleone` shadcn registry: components shared between Soleone's apps (portfolio, Tasks).

Nothing here is published to npm. `shadcn build` turns `registry.json` into JSON files under `public/r/`,
which are committed, so GitHub serves the registry. An app installs an item by copying its source in.

## Use it in an app

Add the registry to the app's `components.json`:

```json
"registries": {
  "@soleone": "https://raw.githubusercontent.com/Soleone/shadcn-components/main/public/r/{name}.json"
}
```

Then add items (their registry dependencies come along):

```sh
pnpm dlx shadcn add @soleone/theme-picker
```

Everything lands under `components/soleone/<item>/`. Items that ship design tokens have a CSS file the
app imports once from its global CSS, after Tailwind:

```css
@import "../components/soleone/theme/theme.css";
@import "../components/soleone/material/material.css";
@import "../components/soleone/letter/letter.css";
```

To update, run the same `add` with `--overwrite`. If the app has customized shadcn components an item
depends on (`button`, `kbd`), answer no when asked to overwrite them.

## Items

| item | what | depends on |
|---|---|---|
| `material` | grain, glare and rim light (`Sheen`), shadow and type tokens | |
| `theme` | omarchy palettes on shadcn tokens: parser, built-in palettes, `createThemeHead`, `ThemeProvider` (D flips dark/light), `revealTheme` | |
| `theme-picker` | `ThemePicker`: a 3D ring of cards, each drawn in its own theme | `theme`, `material`, `button`, `kbd` |
| `flip-card` | `FlipCard`: deals in, tilts, catches the light, flips; any `front` and `back` | `material` |
| `letter` | `Letter`: a form that folds into a paper plane and flies off when sent | `material` |

## Develop

```sh
pnpm dev              # site on http://localhost:3001, serving public/r too
pnpm registry:build   # rebuild public/r after changing an item; commit the result
pnpm registry:check   # fails if public/r is out of date
```

To try a change in an app before pushing, point its `@soleone` entry at `http://localhost:3001/r/{name}.json`.

Add an item: put its files under `registry/soleone/<item>/`, list them in `registry.json` with a
`target` of `components/soleone/<item>/<file>`, and import other items as `@/components/soleone/...`
(the repo's tsconfig maps that onto `registry/soleone/`).

### Conventions

- **Start every file with code** (`"use client"`, an import, an export). shadcn drops any comment that
  comes before a file's first statement when it installs it.
- **Client-only modules say so.** A module that touches the DOM or `react-dom` and is re-exported from an
  item's index needs `"use client"`, or a server layout importing the index pulls it into the server graph.
- **No site content.** Copy, data and callbacks come in as props or render functions; an item never
  imports from the app beyond shadcn's `@/components/ui` and `@/lib/utils`.
