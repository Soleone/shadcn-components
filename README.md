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
| `agent` | collapsible right agent dock, controlled conversation, Markdown, tool traces, custom results; no runtime or app knowledge | shadcn sidebar and chat primitives |
| `material` | grain, glare and rim light (`Sheen`), shadow and type tokens | |
| `theme` | omarchy palettes on shadcn tokens: parser, built-in palettes, `createThemeHead`, `ThemeProvider`, `revealTheme` | |
| `theme-vite` | `themePlugin`: inlines the theme head into `index.html` for Vite apps and serves `virtual:theme-options` | `theme` |
| `theme-picker` | `ThemePicker`: a 3D ring of cards, each drawn in its own theme | `theme`, `material`, `button`, `kbd` |
| `flip-card` | `FlipCard`: deals in, tilts, catches the light, flips; any `front` and `back` | `material` |
| `letter` | `Letter`: a form that folds into a paper plane and flies off when sent | `material` |

## Theme picker in an existing app

`ThemePicker` works uncontrolled by default with its palette button and plain **T** shortcut.
Hosts can pass `open`, `onOpenChange`, `trigger={null}`, `shortcut={false}` and `finalFocus`
to keep their existing entry points, keymap and focus return. A custom trigger can be passed as
an element instead of `null`. Controlled openings reset to the current theme just like the default button.

Use `ThemeProvider` with the same `storageKey` as `themePlugin` (Vite) or `createThemeHead` (server layouts).
The head restores the choice before paint; unavailable storage falls back to the configured default.
There is no built-in dark/light toggle shortcut.

## Agent panel

```sh
pnpm dlx shadcn@latest add @soleone/agent
```

`AgentSidebar` wraps your app: `<AgentSidebar agent={<YourAgent />} title="Agent">{app}</AgentSidebar>`.
It docks on the right, minimizes to one button, and uses the stock Sidebar's mobile sheet. The host
owns agent state outside the dock so work and unsent prompt text can survive minimization.

`AgentPanel` fills a bounded flex parent with its own transcript scroll and a pinned composer.
It takes `messages: AgentMessage[]`, controlled `prompt` and `onPromptChange` (a React state setter),
`busy`, `onSend(text): Promise<boolean>`, and
`onStop()`. Return `true` from `onSend` only after admitting the message; return `false` and set
`error` on failure so the prompt stays available to retry. `disabled` prevents new submissions.
Messages have `{ id, role: "user" | "assistant", text, tools? }`; consecutive assistant messages render as one
turn, with adjacent tool steps grouped in one shadcn `Trace` and text between them splitting the list. Tools have
`{ id, name, label, status: "running" | "complete" | "error", output?, data? }`. `label` is the step title
for the current status, worded as Trace expects: "Searching the web", "Searched the web", "Failed to search the web".

Use `renderTool(tool)` for app-specific results and approval controls; return `undefined` for the
default trace step. The host is responsible for validating tool data and enforcing approvals
on the server. Rendering an approval button is not an authorization boundary.

The component never imports pi, reads files, stores credentials, or chooses tools. Connect any
runtime through these props. `../gaming` is the first integration: its development server hosts
pi-durable, while its app owns game research and draft application. Import `shadcn/tailwind.css`
from your app's global stylesheet for the upstream chat utilities.

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
