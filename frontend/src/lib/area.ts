// El área disponible la calcula el servidor (resumenAreas); aquí solo se da formato para mostrarla.
export function formatearArea(area: number | string): string {
  return Number(area).toLocaleString('es-CO', { maximumFractionDigits: 2 })
}
