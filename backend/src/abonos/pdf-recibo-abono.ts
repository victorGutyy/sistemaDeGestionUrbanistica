import { detectarTipoDocumento } from '../common/tipo-archivo.js';
import type { Prisma } from '../generated/prisma/client.js';
import { EstadoAbono } from '../generated/prisma/enums.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { StorageService } from '../storage/storage.service.js';
import { generarPdfRecibo } from './generar-pdf-recibo.js';
import type { ContenidoRecibo } from './recibo-contenido.js';

async function leerLogo(storage: StorageService, ruta: string | null): Promise<Buffer | undefined> {
  if (!ruta) return undefined;
  try {
    const buffer = await storage.leer(ruta);
    const tipo = detectarTipoDocumento(buffer);
    return tipo === 'png' || tipo === 'jpg' ? buffer : undefined;
  } catch {
    return undefined;
  }
}

// PDF del recibo de un abono (RF-REC-04 y RF-REC-09). Se dibuja siempre desde la fotografía guardada al emitirlo:
// reimprimirlo da el mismo documento aunque hoy haya cambiado el cliente, el lote o la configuración de la empresa.
// "donde" ya trae el alcance del usuario; devuelve null si el abono no existe, no se ve o no tiene recibo.
export async function generarPdfDeReciboDeAbono(prisma: PrismaService, storage: StorageService, donde: Prisma.AbonoWhereInput) {
  const abono = await prisma.abono.findFirst({
    where: donde,
    include: { recibo: true, anuladoPor: { select: { nombre: true } } },
  });
  if (!abono?.recibo) return null;

  const contenido = abono.recibo.contenido as unknown as ContenidoRecibo;
  const logo = await leerLogo(storage, contenido.empresa.logoRuta);
  const anulacion =
    abono.estado === EstadoAbono.ANULADO && abono.anuladoEn
      ? { fecha: abono.anuladoEn, motivo: abono.motivoAnulacion ?? '', usuario: abono.anuladoPor?.nombre ?? 'Sistema' }
      : undefined;

  const buffer = await generarPdfRecibo(contenido, { logo, anulacion });
  return { buffer, nombreArchivo: `recibo-${abono.recibo.numeroTexto}.pdf`, abono, contenido };
}
