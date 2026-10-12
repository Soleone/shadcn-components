# shadcn-components

The `soleone` shadcn registry: components shared between Soleone's apps (portfolio, Tasks).

Nothing here is published to npm. `shadcn build` turns `registry.json` into JSON files under `public/r/`, the
site serves them, and an app installs an item by copying its source in:

```jsonc
// the app's components.json
"registries": { "@soleone": "http://localhost:3001/r/{name}.json" }
```

```sh
pnpm dlx shadcn add @soleone/material
```

## Develop

```sh
pnpm dev              # site + registry on http://localhost:3001
pnpm registry:build   # rebuild public/r after changing an item
```

Add an item: put its files under `registry/<item>/` and list it in `registry.json`.
