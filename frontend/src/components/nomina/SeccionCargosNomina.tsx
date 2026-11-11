import { useState, type FormEvent } from 'react'
import { actualizarCargoNomina, crearCargoNomina, type CargoNomina } from '../../lib/api'
import { formatearCOP } from '../../lib/formato'
import { CLASE_BOTON, CLASE_BOTON_SECUNDARIO, CLASE_INPUT, Seccion } from '../formulario'

// Cargos de nómina (CC-05, RF-PER-19): catálogo con un valor día sugerido. Lo administran el gerente y el administrador (quien
// liquida la nómina); quien solo puede ver la nómina ve la lista sin botones de cambio.

const SOLO_DIGITOS = (texto: string) => texto.replace(/\D/g, '')

function FilaCargoNomina({ cargo, puedeGestionar, onCambio }: { cargo: CargoNomina; puedeGestionar: boolean; onCambio: (c: CargoNomina) => void }) {
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre] = useState(cargo.nombre)
  const [valorDia, setValorDia] = useState(String(Number(cargo.valorDia)))
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      onCambio(await actualizarCargoNomina(cargo.id, { nombre: nombre.trim(), valorDia }))
      setEditando(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el cargo')
    } finally {
      setEnviando(false)
    }
  }

  async function alternar() {
    setError(null)
    try {
      onCambio(await actualizarCargoNomina(cargo.id, { activo: !cargo.activo }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el cargo')
    }
  }

  if (editando) {
    return (
      <li className="py-3">
        <form onSubmit={guardar} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor={`cargo-nombre-${cargo.id}`} className="block text-xs text-slate-500">
              Cargo
            </label>
            <input id={`cargo-nombre-${cargo.id}`} required minLength={2} maxLength={60} value={nombre} onChange={(e) => setNombre(e.target.value)} className={CLASE_INPUT} />
          </div>
          <div className="sm:w-44">
            <label htmlFor={`cargo-valor-${cargo.id}`} className="block text-xs text-slate-500">
              Valor día sugerido
            </label>
            <input id={`cargo-valor-${cargo.id}`} required inputMode="numeric" value={valorDia} onChange={(e) => setValorDia(SOLO_DIGITOS(e.target.value))} className={CLASE_INPUT} />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={enviando} className={CLASE_BOTON}>
              Guardar
            </button>
            <button type="button" className={CLASE_BOTON_SECUNDARIO} onClick={() => setEditando(false)}>
              Cancelar
            </button>
          </div>
        </form>
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      </li>
    )
  }

  return (
    <li className="py-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm text-slate-800">
          {cargo.nombre}
          <span className="ml-2 text-slate-500">{formatearCOP(cargo.valorDia)} por día</span>
          {!cargo.activo && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">Inactivo</span>}
        </p>
        {puedeGestionar && (
          <div className="flex shrink-0 gap-2">
            <button type="button" className={CLASE_BOTON_SECUNDARIO} onClick={() => setEditando(true)}>
              Editar
            </button>
            <button type="button" className={CLASE_BOTON_SECUNDARIO} onClick={() => void alternar()}>
              {cargo.activo ? 'Desactivar' : 'Activar'}
            </button>
          </div>
        )}
      </div>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </li>
  )
}

export function SeccionCargosNomina({ cargos, puedeGestionar, onCambio }: { cargos: CargoNomina[]; puedeGestionar: boolean; onCambio: (c: CargoNomina[]) => void }) {
  const [nombre, setNombre] = useState('')
  const [valorDia, setValorDia] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ordenar = (lista: CargoNomina[]) => [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

  async function handleCrear(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      const nuevo = await crearCargoNomina({ nombre: nombre.trim(), valorDia })
      onCambio(ordenar([...cargos, nuevo]))
      setNombre('')
      setValorDia('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el cargo')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Seccion
      titulo="Cargos de nómina"
      descripcion="Cargos con un valor día sugerido (auxiliar, oficial, maestro…). El valor es solo una sugerencia: cada trabajador guarda el suyo y cada pago conserva el valor con que se liquidó. Un cargo desactivado ya no se ofrece, pero los trabajadores que lo tienen lo conservan."
    >
      <ul className="divide-y divide-slate-100">
        {cargos.map((cargo) => (
          <FilaCargoNomina key={cargo.id} cargo={cargo} puedeGestionar={puedeGestionar} onCambio={(c) => onCambio(ordenar(cargos.map((x) => (x.id === c.id ? c : x))))} />
        ))}
        {cargos.length === 0 && <li className="py-3 text-sm text-slate-400">Todavía no hay cargos de nómina.</li>}
      </ul>
      {puedeGestionar && (
        <form onSubmit={handleCrear} className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row">
          <input aria-label="Nuevo cargo de nómina" placeholder="Nuevo cargo (por ejemplo, Oficial)" required minLength={2} maxLength={60} value={nombre} onChange={(e) => setNombre(e.target.value)} className={CLASE_INPUT} />
          <input aria-label="Valor día sugerido en pesos" placeholder="Valor día sugerido" required inputMode="numeric" value={valorDia} onChange={(e) => setValorDia(SOLO_DIGITOS(e.target.value))} className={`${CLASE_INPUT} sm:w-52`} />
          <button type="submit" disabled={enviando} className={CLASE_BOTON}>
            Agregar
          </button>
        </form>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </Seccion>
  )
}
