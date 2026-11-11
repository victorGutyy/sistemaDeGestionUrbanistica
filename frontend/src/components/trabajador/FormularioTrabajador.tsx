import { useEffect, useState, type FormEvent } from 'react'
import { listarCargosNomina, type ActualizarTrabajadorPayload, type CargoNomina, type CrearTrabajadorPayload, type SexoTrabajador, type TipoContrato, type TipoDocumento, type Trabajador } from '../../lib/api'
import { fechaParaInput, formatearCOP, hoyEnBogota } from '../../lib/formato'
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
  // CC-05: pago por día. El valor día es del trabajador; el del cargo solo lo sugiere.
  const [valorDia, setValorDia] = useState(inicial?.valorDia ? String(Number(inicial.valorDia)) : '')
  const [banco, setBanco] = useState(inicial?.banco ?? '')
  const [tipoCuenta, setTipoCuenta] = useState(inicial?.tipoCuenta ?? '')
  const [numeroCuenta, setNumeroCuenta] = useState(inicial?.numeroCuenta ?? '')
  const [cargos, setCargos] = useState<CargoNomina[]>([])
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // El catálogo de cargos ayuda, pero no es obligatorio: si no carga, el cargo se escribe a mano como antes.
  useEffect(() => {
    listarCargosNomina()
      .then(setCargos)
      .catch(() => setCargos([]))
  }, [])

  const normalizar = (texto: string) => texto.trim().toLowerCase()
  const cargoElegido = cargos.find((c) => normalizar(c.nombre) === normalizar(cargo)) ?? null
  const diasValor = Number(valorDia) || 0

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
          cargoNominaId: cargoElegido?.id,
          valorDia: valorDia || undefined,
          banco: banco.trim() || undefined,
          tipoCuenta: tipoCuenta.trim() || undefined,
          numeroCuenta: numeroCuenta.trim() || undefined,
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
          ...(cargoElegido && cargoElegido.id !== props.trabajador.cargoNominaId ? { cargoNominaId: cargoElegido.id } : {}),
          ...(valorDia ? { valorDia } : {}),
          banco: banco.trim(),
          tipoCuenta: tipoCuenta.trim(),
          numeroCuenta: numeroCuenta.trim(),
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
        <Campo id="cargo" etiqueta="Cargo" ayuda={cargos.length > 0 ? 'Elige uno de la lista o escribe otro.' : undefined}>
          <input id="cargo" required minLength={2} list="cargos-nomina" value={cargo} onChange={(e) => setCargo(e.target.value)} className={CLASE_INPUT} />
          <datalist id="cargos-nomina">
            {cargos.map((c) => (
              <option key={c.id} value={c.nombre} />
            ))}
          </datalist>
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
        <Campo id="salarioBase" etiqueta="Salario base" ayuda={diasValor > 0 && Number(salarioBase) !== diasValor * 30 ? `El valor día por 30 es ${formatearCOP(diasValor * 30)}.` : undefined}>
          <input id="salarioBase" required inputMode="decimal" value={salarioBase} onChange={(e) => setSalarioBase(e.target.value)} className={CLASE_INPUT} />
          {diasValor > 0 && Number(salarioBase) !== diasValor * 30 && (
            <button type="button" onClick={() => setSalarioBase(String(diasValor * 30))} className="mt-1 text-xs font-medium text-blue-700 underline">
              Usar el valor día por 30
            </button>
          )}
        </Campo>
      </div>

      <div className="space-y-3 rounded-md border border-slate-200 p-3">
        <div>
          <p className="text-sm font-medium text-slate-800">Pago por día</p>
          <p className="text-xs text-slate-500">Con el valor día se liquida cada quincena por obra. Cada pago conserva el valor con que se liquidó, así que cambiarlo aquí no altera lo ya pagado.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo id="valorDia" etiqueta="Valor día (pesos)">
            <input id="valorDia" inputMode="numeric" value={valorDia} onChange={(e) => setValorDia(e.target.value.replace(/\D/g, ''))} className={CLASE_INPUT} />
            {diasValor > 0 && (
              <p className="mt-1 text-xs text-slate-500">
                {formatearCOP(diasValor * 15)} por quincena de 15 días · {formatearCOP(diasValor * 30)} al mes
              </p>
            )}
            {cargoElegido && Number(cargoElegido.valorDia) !== diasValor && (
              <p className="mt-1 text-xs text-slate-500">
                Sugerido para {cargoElegido.nombre}: {formatearCOP(cargoElegido.valorDia)}.{' '}
                <button type="button" onClick={() => setValorDia(String(Number(cargoElegido.valorDia)))} className="font-medium text-blue-700 underline">
                  Usar el sugerido
                </button>
              </p>
            )}
          </Campo>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Campo id="banco" etiqueta="Banco (opcional)">
            <input id="banco" maxLength={60} value={banco} onChange={(e) => setBanco(e.target.value)} className={CLASE_INPUT} />
          </Campo>
          <Campo id="tipoCuenta" etiqueta="Tipo de cuenta (opcional)" ayuda="Por ejemplo: ahorros, corriente.">
            <input id="tipoCuenta" maxLength={30} value={tipoCuenta} onChange={(e) => setTipoCuenta(e.target.value)} className={CLASE_INPUT} />
          </Campo>
          <Campo id="numeroCuenta" etiqueta="Número de cuenta (opcional)">
            <input id="numeroCuenta" inputMode="numeric" maxLength={40} autoComplete="off" value={numeroCuenta} onChange={(e) => setNumeroCuenta(e.target.value)} className={CLASE_INPUT} />
          </Campo>
        </div>
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
