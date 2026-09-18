export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div>
      <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
      <div className="mt-6 flex h-48 items-center justify-center rounded-lg border border-dashed border-slate-300 text-sm text-slate-400">
        Módulo en construcción.
      </div>
    </div>
  )
}
