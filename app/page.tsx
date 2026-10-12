import registry from "@/registry.json"

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-2xl font-semibold">@{registry.name}</h1>
      <p className="mt-2 text-muted-foreground">
        Add the registry to <code>components.json</code>, then install items with{" "}
        <code>pnpm dlx shadcn add @{registry.name}/&lt;item&gt;</code>.
      </p>
      <ul className="mt-8 divide-y divide-border border-y border-border">
        {registry.items.map((item) => (
          <li key={item.name} className="py-4">
            <div className="font-medium">{item.title}</div>
            <div className="text-sm text-muted-foreground">{item.description}</div>
            <code className="mt-2 block text-sm">pnpm dlx shadcn add @{registry.name}/{item.name}</code>
          </li>
        ))}
      </ul>
    </main>
  )
}
