import type { DatosLegalesTrabajador } from '../../lib/api'
import { formatearCOP } from '../../lib/formato'
import { formatearPorcentaje } from '../../lib/seguridadSocial'
import { Dato, Insignia, Seccion } from '../formulario'

// Auxilio de transporte y tasa de la ARL, calculados solos con los parámetros legales del año (RF-PER-18).
export function ResumenLegal({ legales }: { legales: DatosLegalesTrabajador }) {
  return (
    <Seccion titulo={`Valores legales de ${legales.anio}`} descripcion="Se calculan solos con los parámetros legales que el gerente mantiene en Configuración → Seguridad social.">
      {!legales.hayParametros && (
        <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          No hay parámetros legales de {legales.anio}: el gerente debe crearlos para calcular el auxilio de transporte.
        </p>
      )}
      {legales.hayParametros && !legales.parametrosValidados && (
        <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Los parámetros de {legales.anio} están pendientes de validar por el asesor laboral: tómalos como provisionales.
        </p>
      )}
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {legales.auxilioTransporte && (
          <Dato etiqueta="Auxilio de transporte">
            {legales.auxilioTransporte.aplica ? (
              <>
                {formatearCOP(legales.auxilioTransporte.valor)} <Insignia tono="verde">Aplica</Insignia>
              </>
            ) : (
              <>
                $0 <Insignia tono="gris">No aplica: el salario supera el tope</Insignia>
              </>
            )}
          </Dato>
        )}
        <Dato etiqueta="Tasa de cotización a la ARL">
          {legales.tasaArl ? `Clase de riesgo ${legales.tasaArl.clase} — ${formatearPorcentaje(legales.tasaArl.tasa)}` : <Insignia tono="ambar">Sin ARL vigente</Insignia>}
        </Dato>
      </dl>
    </Seccion>
  )
}
