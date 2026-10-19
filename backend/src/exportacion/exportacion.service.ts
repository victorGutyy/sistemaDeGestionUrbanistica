import { Injectable, Logger } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { Response } from 'express';
import { registrarAuditoria } from '../auditoria/auditoria.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { hoyISO } from '../cierres-caja/periodo.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { aCeldaExcel, esCampoSensible, formatearFechaExcel } from './convertir-celda.js';

const CONTENT_TYPE_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const TAMANO_LOTE = 1000;
// Una exportación grande puede tardar más que el tiempo por defecto de una transacción.
const TIEMPO_MAXIMO_MS = 10 * 60 * 1000;

interface DelegadoLectura {
  count(): Promise<number>;
  findMany(args: object): Promise<Record<string, unknown>[]>;
}

const aMinusculaInicial = (texto: string) => texto.charAt(0).toLowerCase() + texto.slice(1);

// Las tablas y los campos salen del propio esquema de Prisma: si mañana se agrega una tabla o un campo, entra solo a la
// exportación, sin que nadie tenga que acordarse. Las únicas exclusiones son las contraseñas, tokens y secretos.
export function tablasExportables() {
  return Object.values(Prisma.ModelName).map((modelo) => {
    const enumeracion = (Prisma as unknown as Record<string, Record<string, string> | undefined>)[`${modelo}ScalarFieldEnum`] ?? {};
    const campos = Object.keys(enumeracion);
    return { modelo, campos: campos.filter((campo) => !esCampoSensible(campo)), tieneId: campos.includes('id'), tieneCreadoEn: campos.includes('createdAt') };
  });
}

@Injectable()
export class ExportacionService {
  private readonly logger = new Logger(ExportacionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configuracion: ConfiguracionService,
  ) {}

  // Exportación completa (RNF-LEG-02): un libro de Excel con una hoja por tabla de negocio, escrito por tandas (en
  // flujo) para que miles de abonos o una auditoría grande no llenen la memoria del servidor. Todo se lee dentro de una
  // transacción de solo lectura con una "fotografía" fija de la base: aunque alguien registre un abono mientras se
  // exporta, el libro es coherente (las cuotas cuadran con los abonos).
  async exportar(res: Response, usuario: UsuarioAutenticado) {
    const empresa = await this.configuracion.obtenerEmpresa();
    const ahora = new Date();
    const nombreArchivo = `exportacion-completa-${hoyISO(ahora)}.xlsx`;

    // Quién exportó y cuándo queda registrado antes de empezar a entregar los datos.
    await this.prisma.$transaction((tx) =>
      registrarAuditoria(tx, {
        usuario,
        accion: 'EXPORTACION_COMPLETA',
        entidad: 'EXPORTACION',
        resumen: `Exportó todos los datos de la empresa a Excel (${nombreArchivo})`,
        despues: { archivo: nombreArchivo },
      }),
    );

    res.set({ 'Content-Type': CONTENT_TYPE_XLSX, 'Content-Disposition': `attachment; filename="${nombreArchivo}"` });
    const libro = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true, useSharedStrings: false });
    libro.creator = 'Urbanix';

    try {
      await this.prisma.$transaction(
        async (tx) => {
          const tablas = tablasExportables();
          const delegado = (modelo: string) => (tx as unknown as Record<string, DelegadoLectura>)[aMinusculaInicial(modelo)];
          const conteos = new Map<string, number>();
          for (const { modelo } of tablas) conteos.set(modelo, await delegado(modelo).count());

          // Hoja de resumen: qué es este archivo y cuántas filas trae cada hoja.
          const resumen = libro.addWorksheet('Resumen');
          resumen.getColumn(1).width = 34;
          resumen.getColumn(2).width = 22;
          const titulo = resumen.addRow([`${empresa.nombreComercial} · Exportación completa de datos`]);
          titulo.font = { bold: true, size: 13 };
          titulo.commit();
          for (const linea of [
            [`${empresa.razonSocial} · NIT ${empresa.nit}`],
            [`Exportado el ${formatearFechaExcel(ahora)} por ${usuario.nombre}`],
            ['Incluye todos los datos de negocio, uno por hoja. No incluye contraseñas ni claves de acceso.'],
            ['Los archivos adjuntos (soportes de pago, documentos firmados, logo) no van en este libro: se descargan desde cada registro.'],
            [],
          ]) {
            resumen.addRow(linea).commit();
          }
          const encabezadoResumen = resumen.addRow(['Hoja', 'Filas']);
          encabezadoResumen.font = { bold: true };
          encabezadoResumen.commit();
          for (const { modelo } of tablas) resumen.addRow([modelo, conteos.get(modelo)]).commit();
          resumen.commit();

          for (const { modelo, campos, tieneId, tieneCreadoEn } of tablas) {
            const hoja = libro.addWorksheet(modelo, { views: [{ state: 'frozen', ySplit: 1 }] });
            campos.forEach((_, indice) => {
              hoja.getColumn(indice + 1).width = 20;
            });
            const encabezado = hoja.addRow(campos);
            encabezado.font = { bold: true };
            encabezado.commit();

            const lector = delegado(modelo);
            if (!tieneId) {
              // Tablas pequeñas de configuración sin identificador propio.
              for (const fila of await lector.findMany({})) hoja.addRow(campos.map((campo) => aCeldaExcel(fila[campo]))).commit();
            } else {
              // Lectura por tandas con cursor (rápida aunque la tabla tenga cientos de miles de filas).
              let cursor: string | undefined;
              for (;;) {
                const filas = await lector.findMany({
                  take: TAMANO_LOTE,
                  orderBy: tieneCreadoEn ? [{ createdAt: 'asc' }, { id: 'asc' }] : [{ id: 'asc' }],
                  ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
                });
                for (const fila of filas) hoja.addRow(campos.map((campo) => aCeldaExcel(fila[campo]))).commit();
                if (filas.length < TAMANO_LOTE) break;
                cursor = filas[filas.length - 1].id as string;
              }
            }
            hoja.commit();
          }
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: TIEMPO_MAXIMO_MS, maxWait: 15_000 },
      );
      await libro.commit();
    } catch (error) {
      // Ya se entregó parte del archivo: no se puede cambiar el estado de la respuesta, así que se corta la conexión
      // para que el navegador no guarde un archivo a medias como si estuviera completo.
      this.logger.error(`La exportación completa falló: ${error instanceof Error ? error.message : String(error)}`);
      res.destroy(error instanceof Error ? error : undefined);
    }
  }
}
