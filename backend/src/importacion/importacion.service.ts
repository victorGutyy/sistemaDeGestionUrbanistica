import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { registrarAuditoria } from '../auditoria/auditoria.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { hoyISO } from '../cierres-caja/periodo.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoCierre, EstadoVenta, TipoImportacion, type MedioPago } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ejecutarPlanEnTx } from './ejecutar.js';
import { generarConciliacionExcel } from './generar-conciliacion-excel.js';
import { leerLibro, type LibroLeido, type ProblemaImportacion } from './leer-libro.js';
import { generarPlantilla } from './plantilla.js';
import { validarImportacion, type ContextoValidacion, type FilaConciliacion, type ResumenImportacion } from './validar.js';

// Llave del bloqueo que impide dos importaciones a la vez (número cualquiera, distinto al de los cierres de caja).
const CLAVE_BLOQUEO_IMPORTACION = 7_002_002;
// Una carga grande (cientos de abonos con su recibo) tarda más que el tiempo por defecto de una transacción.
const TIEMPO_MAXIMO_CARGA_MS = 5 * 60 * 1000;
// Cuántos errores y avisos se devuelven al navegador (el total siempre se informa).
const MAXIMO_PROBLEMAS_DEVUELTOS = 500;

const ESTADOS_VIGENTES = [EstadoVenta.PENDIENTE_APROBACION, EstadoVenta.ACTIVA];
const FORMATO_HUELLA = /^[a-f0-9]{64}$/;

type BaseDeDatos = Prisma.TransactionClient;

@Injectable()
export class ImportacionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configuracion: ConfiguracionService,
  ) {}

  plantilla() {
    return generarPlantilla();
  }

  // Modo de prueba (RF-MIG-02): valida todo el archivo y dice qué se crearía y qué está mal. NO guarda nada.
  async validar(archivo: Express.Multer.File | undefined) {
    const { buffer, nombre } = this.exigirArchivo(archivo);
    const huella = this.calcularHuella(buffer);
    const libro = await leerLibro(buffer);
    const contexto = await this.cargarContexto(this.prisma, await this.mediosActivos());
    const resultado = validarImportacion(libro, contexto);

    const previa = await this.prisma.importacion.findUnique({
      where: { huella },
      select: { createdAt: true, usuario: { select: { nombre: true } } },
    });

    return {
      nombreArchivo: nombre,
      huella,
      puedeConfirmar: resultado.errores.length === 0 && !previa,
      yaImportado: previa ? { fecha: previa.createdAt, por: previa.usuario.nombre } : null,
      totalErrores: resultado.errores.length,
      totalAvisos: resultado.avisos.length,
      errores: resultado.errores.slice(0, MAXIMO_PROBLEMAS_DEVUELTOS),
      avisos: resultado.avisos.slice(0, MAXIMO_PROBLEMAS_DEVUELTOS),
      resumen: resultado.resumen,
      conciliacion: resultado.conciliacion,
    };
  }

  // Confirmación (RF-MIG-03): vuelve a validar el MISMO archivo y, solo si no hay errores, lo guarda todo en una
  // sola transacción (o entra completo o no entra nada).
  async confirmar(archivo: Express.Multer.File | undefined, huellaEsperada: string | undefined, usuario: UsuarioAutenticado) {
    const { buffer, nombre } = this.exigirArchivo(archivo);
    const huella = this.calcularHuella(buffer);
    if (!huellaEsperada || !FORMATO_HUELLA.test(huellaEsperada) || huellaEsperada !== huella) {
      throw new BadRequestException('El archivo no es el mismo que se validó. Súbelo y valídalo de nuevo antes de confirmar.');
    }

    const libro = await leerLibro(buffer);
    const medios = await this.mediosActivos();
    const contextoRecibo = await this.configuracion.contextoRecibo(usuario);

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CLAVE_BLOQUEO_IMPORTACION})`;

          if (await tx.importacion.findUnique({ where: { huella }, select: { id: true } })) {
            throw new ConflictException('Este archivo ya fue importado. Si necesitas cargar más datos, usa un archivo con datos nuevos.');
          }

          // Se valida otra vez DENTRO de la transacción y con el bloqueo tomado: si alguien creó algo entre la
          // validación y la confirmación, se detecta aquí y no se guarda nada.
          const contexto = await this.cargarContexto(tx, medios);
          const resultado = validarImportacion(libro, contexto);
          if (resultado.errores.length > 0) {
            throw new BadRequestException({
              message: `El archivo tiene ${resultado.errores.length} error(es). Corrígelos y vuelve a validar.`,
              codigo: 'IMPORTACION_CON_ERRORES',
              totalErrores: resultado.errores.length,
              errores: resultado.errores.slice(0, MAXIMO_PROBLEMAS_DEVUELTOS),
            });
          }

          const ejecucion = await ejecutarPlanEnTx(tx, resultado.plan, usuario, contextoRecibo);

          const resumen = { ...resultado.resumen, ejecucion };
          const importacion = await tx.importacion.create({
            data: {
              usuarioId: usuario.id,
              nombreArchivo: nombre,
              huella,
              resumen: resumen as unknown as Prisma.InputJsonValue,
              conciliacion: resultado.conciliacion as unknown as Prisma.InputJsonValue,
            },
          });
          await registrarAuditoria(tx, {
            usuario,
            accion: 'IMPORTACION_EJECUTAR',
            entidad: 'IMPORTACION',
            entidadId: importacion.id,
            resumen: `Importó el archivo "${nombre}": ${ejecucion.proyectos} proyecto(s), ${ejecucion.lotes} lote(s), ${ejecucion.clientes} cliente(s), ${ejecucion.ventas} venta(s) y ${ejecucion.abonos} abono(s) con recibo histórico`,
            despues: { nombreArchivo: nombre, huella, ...ejecucion, valorVentas: resultado.resumen.valorVentas, totalAbonado: resultado.resumen.totalAbonado, totalSaldo: resultado.resumen.totalSaldo },
          });

          return { id: importacion.id, nombreArchivo: nombre, createdAt: importacion.createdAt, resumen, conciliacion: resultado.conciliacion };
        },
        { timeout: TIEMPO_MAXIMO_CARGA_MS, maxWait: 15_000 },
      );
    } catch (error) {
      // Dos confirmaciones simultáneas del mismo archivo: la base de datos deja pasar solo una.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Este archivo ya fue importado.');
      }
      throw error;
    }
  }

  listar() {
    return this.prisma.importacion.findMany({
      where: { tipo: TipoImportacion.VENTAS },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true, nombreArchivo: true, resumen: true, usuario: { select: { nombre: true } } },
    });
  }

  async buscarPorId(id: string) {
    const importacion = await this.prisma.importacion.findUnique({
      where: { id },
      include: { usuario: { select: { nombre: true } } },
    });
    if (!importacion) throw new NotFoundException(`No existe la importación ${id}`);
    return importacion;
  }

  // Reporte de conciliación guardado de una importación (RF-MIG-05), en Excel.
  async conciliacionExcel(id: string) {
    const importacion = await this.buscarPorId(id);
    const empresa = await this.configuracion.obtenerEmpresa();
    const buffer = await generarConciliacionExcel(
      {
        nombreArchivo: importacion.nombreArchivo,
        fecha: importacion.createdAt,
        usuario: importacion.usuario.nombre,
        resumen: importacion.resumen as unknown as ResumenImportacion,
        filas: importacion.conciliacion as unknown as FilaConciliacion[],
      },
      { nombreComercial: empresa.nombreComercial },
    );
    return { buffer, nombreArchivo: `conciliacion-importacion-${id.slice(0, 8)}.xlsx` };
  }

  // ---------------------------------------------------------------------------------------------

  private exigirArchivo(archivo: Express.Multer.File | undefined) {
    if (!archivo) throw new BadRequestException('Falta el archivo de Excel (.xlsx)');
    return { buffer: archivo.buffer, nombre: archivo.originalname.slice(0, 200) };
  }

  private calcularHuella(buffer: Buffer) {
    return createHash('sha256').update(buffer).digest('hex');
  }

  private async mediosActivos(): Promise<MedioPago[]> {
    const medios = await this.configuracion.listarMediosPago();
    return medios.filter((medio) => medio.activo).map((medio) => medio.medio);
  }

  // Fotografía de lo que hay en el sistema que la validación necesita para saber qué ya existe.
  private async cargarContexto(db: BaseDeDatos, mediosActivos: MedioPago[]): Promise<ContextoValidacion> {
    const [proyectos, clientes, vendedores, cuentas, abonos, cierres] = await Promise.all([
      db.proyecto.findMany({
        select: {
          id: true,
          nombre: true,
          tipo: true,
          estado: true,
          areaTotal: true,
          manzanas: { select: { id: true, nombre: true } },
          lotes: {
            select: {
              id: true,
              numero: true,
              manzanaId: true,
              area: true,
              valorVenta: true,
              estado: true,
              ventas: { where: { estado: { in: ESTADOS_VIGENTES } }, select: { id: true }, take: 1 },
            },
          },
        },
      }),
      db.cliente.findMany({ select: { documento: true, nombre: true } }),
      db.vendedor.findMany({ select: { documento: true } }),
      db.cuentaBancaria.findMany({ select: { id: true, alias: true, activa: true } }),
      db.abono.findMany({
        where: { estado: 'ACTIVO', referencia: { not: null }, cuentaDestinoId: { not: null } },
        select: { cuentaDestinoId: true, referencia: true },
      }),
      db.cierreCaja.findMany({
        where: { estado: { in: [EstadoCierre.CERRADO, EstadoCierre.APROBADO] } },
        select: { numeroTexto: true, desde: true, hasta: true },
      }),
    ]);

    return {
      hoy: hoyISO(),
      proyectos: proyectos.map((proyecto) => ({
        ...proyecto,
        lotes: proyecto.lotes.map(({ ventas, ...lote }) => ({ ...lote, conVentaVigente: ventas.length > 0 })),
      })),
      clientes,
      vendedores,
      cuentas,
      mediosActivos,
      referencias: abonos.map((abono) => ({ cuentaId: abono.cuentaDestinoId as string, referencia: (abono.referencia as string).toLowerCase() })),
      cierresBloqueantes: cierres.map((cierre) => ({
        numeroTexto: cierre.numeroTexto ?? 'sin número',
        desde: cierre.desde.toISOString().slice(0, 10),
        hasta: cierre.hasta.toISOString().slice(0, 10),
      })),
    };
  }
}

export type { LibroLeido, ProblemaImportacion };
