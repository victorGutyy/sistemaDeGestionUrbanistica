import type { DatosTrabajador } from '../../lib/api'
import { formatearFecha } from '../../lib/formato'
import { ETIQUETA_SEXO, ETIQUETA_TIPO_CONTRATO, ETIQUETA_TIPO_DOCUMENTO_IDENTIDAD } from '../../lib/seguridadSocial'
import { Dato, Insignia } from '../formulario'

// Ficha de lectura del trabajador (sin salario: ese dato solo lo muestra la pantalla de nómina).
export function DatosPersonales({ trabajador }: { trabajador: DatosTrabajador }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      <Dato etiqueta="Documento">
        {ETIQUETA_TIPO_DOCUMENTO_IDENTIDAD[trabajador.tipoDocumento]} {trabajador.documento}
      </Dato>
      <Dato etiqueta="Estado">
        {trabajador.estado === 'ACTIVO' ? <Insignia tono="verde">Activo</Insignia> : <Insignia tono="gris">Retirado</Insignia>}
      </Dato>
      <Dato etiqueta="Nombres">{trabajador.nombres ?? '—'}</Dato>
      <Dato etiqueta="Apellidos">{trabajador.apellidos ?? '—'}</Dato>
      <Dato etiqueta="Fecha de nacimiento">{formatearFecha(trabajador.fechaNacimiento)}</Dato>
      <Dato etiqueta="Sexo">{trabajador.sexo ? ETIQUETA_SEXO[trabajador.sexo] : '—'}</Dato>
      <Dato etiqueta="Cargo">{trabajador.cargo}</Dato>
      <Dato etiqueta="Área">{trabajador.area ?? '—'}</Dato>
      <Dato etiqueta="Tipo de contrato">{ETIQUETA_TIPO_CONTRATO[trabajador.tipoContrato]}</Dato>
      <Dato etiqueta="Fecha de ingreso">{formatearFecha(trabajador.fechaIngreso)}</Dato>
      <Dato etiqueta="Celular">{trabajador.celular ?? '—'}</Dato>
      <Dato etiqueta="Teléfono">{trabajador.telefono ?? '—'}</Dato>
      <Dato etiqueta="Correo">{trabajador.email ?? '—'}</Dato>
      {trabajador.fechaRetiro && (
        <>
          <Dato etiqueta="Fecha de retiro">{formatearFecha(trabajador.fechaRetiro)}</Dato>
          <Dato etiqueta="Motivo del retiro">{trabajador.motivoRetiro ?? '—'}</Dato>
        </>
      )}
    </dl>
  )
}
