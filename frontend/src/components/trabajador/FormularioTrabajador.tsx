import { useState, type FormEvent } from 'react'
import type { ActualizarTrabajadorPayload, CrearTrabajadorPayload, SexoTrabajador, TipoContrato, TipoDocumento, Trabajador } from '../../lib/api'
import { fechaParaInput, hoyEnBogota } from '../../lib/formato'
import { ETIQUETA_SEXO, ETIQUETA_TIPO_CONTRATO, ETIQUETA_TIPO_DOCUMENTO_IDENTIDAD, pesosATexto, TIPOS_DOCUMENTO_IDENTIDAD } from '../../lib/seguridadSocial'
import { Aviso, CLASE_BOTON, CLASE_INPUT, Campo } from '../formulario'

type Props =
  | { modo: 'crear'; onGuardar: (payload: CrearTrabajadorPayload) => Promise<void> }
  | { modo: 'editar'; trabajador: Trabajador; onGuardar: (payload: ActualizarTrabajadorPayload) => Promise<void> }

// Formulario de la ficha del trabajador (RF-PER-17), el mismo para crear y para editar. El número de documento no se
// edita: es la identidad del trabajador.
export function FormularioTrabajador(props: Props) {
  const inicial = props.modo === 'editar' ? props.trabajador : null
  const [tipoDocumento, setTipoDocumento] = useState<TipoDocumento>(inicial?.tipoDocumento ?? 'CC')
  const [documento, setDocumento] = useState(inicial?.documento ?? '')
  const [nombres, setNombres] = useState(inicial?.nombres ?? '')
  const [apellidos, setApellidos] = useState(inicial?.apellidos ?? '')
  const [nombre, setNombre] = useState(inicial?.nombre ?? '')
  const [fechaNacimiento, setFechaNacimiento] = useState(fechaParaInput(inicial?.fechaNacimiento))
  const [sexo, setSexo] = useState<SexoTrabajador | ''>(inicial?.sexo ?? '')
  const [cargo, setCargo] = useState(inicial?.cargo ?? '')
  const [area, setArea] = useState(inicial?.area ?? '')
  const [tipoContrato, setTipoContrato] = useState<TipoContrato>(inicial?.tipoContrato ?? 'OBRA_LABOR')
  const [salarioBase, setSalarioBase] = useState(inicial ? String(Number(inicial.salarioBase)) : '')
  const [fechaIngreso, setFechaIngreso] = useState(inicial ? fechaParaInput(inicial.fechaIngreso) : hoyEnBogota())
  const [celular, setCelular] = useState(inicial?.celular ?? '')
  const [telefono, setTelefono] = useState(inicial?.telefono ?? '')
  const [email, setEmail] = useState(inicial?.email ?? '')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      if (props.modo === 'crear') {
        // En la creación lo vacío se omite: el servidor arma el nombre completo con nombres y apellidos.
        await props.onGuardar({
          nombre: nombre.trim() || undefined,
          nombres: nombres.trim() || undefined,
          apellidos: apellidos.trim() || undefined,
          documento: documento.trim(),
          tipoDocumento,
          fechaNacimiento: fechaNacimiento || undefined,
          sexo: sexo || undefined,
          area: area.trim() || undefined,
          cargo: cargo.trim(),
          tipoContrato,
          salarioBase: pesosATexto(salarioBase),
          fechaIngreso,
          telefono: telefono.trim() || undefined,
          celular: celular.trim() || undefined,
          email: email.trim() || undefined,
        })
      } else {
        // En la edición un texto vacío borra el dato. El nombre completo solo se envía si la persona lo cambió: si no,
        // el servidor lo vuelve a armar cuando cambian los nombres o los apellidos.
        await props.onGuardar({
          ...(nombre.trim() !== props.trabajador.nombre ? { nombre: nombre.trim() } : {}),
          nombres: nombres.trim(),
          apellidos: apellidos.trim(),
          tipoDocumento,
          ...(fechaNacimiento ? { fechaNacimiento } : {}),
          ...(sexo ? { sexo } : {}),
          area: area.trim(),
          cargo: cargo.trim(),
          tipoContrato,
          salarioBase: pesosATexto(salarioBase),
          fechaIngreso,
          telefono: telefono.trim(),
          celular: celular.trim(),
          email: email.trim(),
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el trabajador')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Aviso error={error} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo id="tipoDocumento" etiqueta="Tipo de documento">
          <select id="tipoDocumento" value={tipoDocumento} onChange={(e) => setTipoDocumento(e.target.value as TipoDocumento)} className={CLASE_INPUT}>
            {TIPOS_DOCUMENTO_IDENTIDAD.map((tipo) => (
              <option key={tipo} value={tipo}>
                {ETIQUETA_TIPO_DOCUMENTO_IDENTIDAD[tipo]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id="documento" etiqueta="Número de documento" ayuda={props.modo === 'editar' ? 'No se puede cambiar.' : undefined}>
          <input id="documento" required minLength={3} disabled={props.modo === 'editar'} value={documento} onChange={(e) => setDocumento(e.target.value)} className={`${CLASE_INPUT} disabled:bg-slate-100 disabled:text-slate-500`} />
        </Campo>
        <Campo id="nombres" etiqueta="Nombres">
          <input id="nombres" maxLength={80} value={nombres} onChange={(e) => setNombres(e.target.value)} className={CLASE_INPUT} />
        </Campo>
        <Campo id="apellidos" etiqueta="Apellidos">
          <input id="apellidos" maxLength={80} value={apellidos} onChange={(e) => setApellidos(e.target.value)} className={CLASE_INPUT} />
        </Campo>
      </div>

      <Campo id="nombre" etiqueta="Nombre completo" ayuda={props.modo === 'crear' ? 'Si lo dejas vacío, se arma con los nombres y apellidos.' : 'Si cambias los nombres o apellidos y dejas este igual, se vuelve a armar solo.'}>
        <input id="nombre" required={props.modo === 'editar'} minLength={3} value={nombre} onChange={(e) => setNombre(e.target.value)} className={CLASE_INPUT} />
      </Campo>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo id="fechaNacimiento" etiqueta="Fecha de nacimiento">
          <input id="fechaNacimiento" type="date" max={hoyEnBogota()} value={fechaNacimiento} onChange={(e) => setFechaNacimiento(e.target.value)} className={CLASE_INPUT} />
        </Campo>
        <Campo id="sexo" etiqueta="Sexo">
          <select id="sexo" value={sexo} onChange={(e) => setSexo(e.target.value as SexoTrabajador | '')} className={CLASE_INPUT}>
            <option value="">Sin indicar</option>
            {(Object.keys(ETIQUETA_SEXO) as SexoTrabajador[]).map((valor) => (
              <option key={valor} value={valor}>
                {ETIQUETA_SEXO[valor]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id="cargo" etiqueta="Cargo">
          <input id="cargo" required minLength={2} value={cargo} onChange={(e) => setCargo(e.target.value)} className={CLASE_INPUT} />
        </Campo>
        <Campo id="area" etiqueta="Área" ayuda="Por ejemplo: obra civil, administrativa.">
          <input id="area" maxLength={80} value={area} onChange={(e) => setArea(e.target.value)} className={CLASE_INPUT} />
        </Campo>
        <Campo id="tipoContrato" etiqueta="Tipo de contrato">
          <select id="tipoContrato" value={tipoContrato} onChange={(e) => setTipoContrato(e.target.value as TipoContrato)} className={CLASE_INPUT}>
            {(Object.keys(ETIQUETA_TIPO_CONTRATO) as TipoContrato[]).map((valor) => (
              <option key={valor} value={valor}>
                {ETIQUETA_TIPO_CONTRATO[valor]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id="fechaIngreso" etiqueta="Fecha de ingreso">
          <input id="fechaIngreso" required type="date" value={fechaIngreso} onChange={(e) => setFechaIngreso(e.target.value)} className={CLASE_INPUT} />
        </Campo>
        <Campo id="salarioBase" etiqueta="Salario base">
          <input id="salarioBase" required inputMode="decimal" value={salarioBase} onChange={(e) => setSalarioBase(e.target.value)} className={CLASE_INPUT} />
        </Campo>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Campo id="celular" etiqueta="Celular (opcional)">
          <input id="celular" inputMode="tel" maxLength={30} value={celular} onChange={(e) => setCelular(e.target.value)} className={CLASE_INPUT} />
        </Campo>
        <Campo id="telefono" etiqueta="Teléfono (opcional)">
          <input id="telefono" inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} className={CLASE_INPUT} />
        </Campo>
        <Campo id="email" etiqueta="Correo (opcional)">
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={CLASE_INPUT} />
        </Campo>
      </div>

      <button type="submit" disabled={enviando} className={`${CLASE_BOTON} w-full sm:w-auto`}>
        {enviando ? 'Guardando…' : props.modo === 'crear' ? 'Registrar trabajador' : 'Guardar cambios'}
      </button>
    </form>
  )
}
