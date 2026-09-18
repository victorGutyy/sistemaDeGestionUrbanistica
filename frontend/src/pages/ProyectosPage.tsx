// Contenido placeholder: la tabla se conecta al endpoint de Proyectos
// cuando construyamos ese módulo en el backend.
export function ProyectosPage() {
  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Proyectos</h1>
          <p className="text-sm text-slate-500">Predios y su subdivisión en lotes.</p>
        </div>
        <button
          type="button"
          className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Nuevo proyecto
        </button>
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Ubicación</th>
              <th className="px-4 py-3 font-medium">Área total</th>
              <th className="px-4 py-3 font-medium">Lotes</th>
              <th className="px-4 py-3 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                Todavía no hay proyectos registrados.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
