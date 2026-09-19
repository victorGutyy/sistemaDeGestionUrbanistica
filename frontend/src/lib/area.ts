// Cálculo de área disponible para seguir subdividiendo un proyecto. Es
// solo para mostrar en pantalla (no se guarda en la base de datos), así
// que sumar como número de punto flotante es suficiente — no es dinero.
export function calcularAreaDisponible(areaTotal: string, lotes: { area: string }[]): number {
  const areaLotes = lotes.reduce((acumulado, lote) => acumulado + Number(lote.area), 0)
  return Number(areaTotal) - areaLotes
}

export function formatearArea(area: number): string {
  return area.toLocaleString('es-CO', { maximumFractionDigits: 2 })
}
