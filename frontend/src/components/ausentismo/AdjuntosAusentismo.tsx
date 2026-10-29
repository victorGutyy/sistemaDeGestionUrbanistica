import { useCallback, useEffect, useState } from 'react'
import { listarDocumentosSst, type DocumentoSst } from '../../lib/api'
import { AdjuntosSst } from '../sst/AdjuntosSst'

interface Props {
  ausentismoId: string
  // Ver la lista y abrir los certificados exige poder ver diagnósticos (traen el diagnóstico escrito).
  puedeVer: boolean
  puedeAdjuntar: boolean
  onCambio: (mensaje: string) => void
}

// Certificados de un ausentismo (RF-SST-21). Quien puede gestionar pero no ver diagnósticos solo adjunta: no ve la lista, y el
// servidor tampoco se la entrega.
export function AdjuntosAusentismo({ ausentismoId, puedeVer, puedeAdjuntar, onCambio }: Props) {
  const [documentos, setDocumentos] = useState<DocumentoSst[]>([])

  const cargar = useCallback(() => {
    if (!puedeVer) return
    listarDocumentosSst('ausentismo', ausentismoId)
      .then(setDocumentos)
      .catch(() => setDocumentos([]))
  }, [ausentismoId, puedeVer])

  useEffect(cargar, [cargar])

  return (
    <AdjuntosSst
      ruta="ausentismo"
      registroId={ausentismoId}
      documentos={documentos}
      puedeAdjuntar={puedeAdjuntar}
      etiquetaAdjuntar="Adjuntar certificado"
      ocultarLista={puedeVer ? undefined : 'Los certificados traen el diagnóstico escrito: solo los ven quienes pueden ver diagnósticos. Puedes adjuntar uno, pero no abrirlo después.'}
      onCambio={() => {
        cargar()
        onCambio('Certificado adjuntado.')
      }}
    />
  )
}
