import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { AusentismoService } from '../ausentismo/ausentismo.service.js';
import { registrarAuditoria } from '../auditoria/auditoria.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { Prisma } from '../generated/prisma/client.js';
import { TipoImportacion } from '../generated/prisma/enums.js';
import { leerLibroDe, type LibroLeido } from '../importacion/leer-libro.js';
import { generarLibroDePlantilla } from '../importacion/plantilla.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CapacitacionesService } from '../sst/capacitaciones.service.js';
import { EppService } from '../sst/epp.service.js';
import { TrabajadoresService } from '../trabajadores/trabajadores.service.js';
import { cargarLibroSst, type ResultadoCarga, type ServiciosDeCarga } from './cargar.js';
import { HOJAS_SST, PASOS_SST, type ClaveHojaSst } from './plantilla-sst-definicion.js';

// Llave del bloqueo que impide dos cargas a la vez (número cualquiera, distinto al de las demás cargas y cierres).
const CLAVE_BLOQUEO_CARGA_SST = 7_002_003;
// Una carga grande (cientos de filas, cada una con sus validaciones y su auditoría) tarda más que el tiempo por defecto.
const TIEMPO_MAXIMO_CARGA_MS = 5 * 60 * 1000;
// Cuántos errores y avisos se devuelven al navegador (el total siempre se informa).
const MAXIMO_PROBLEMAS_DEVUELTOS = 500;
const FORMATO_HUELLA = /^[a-f0-9]{64}$/;

// La prueba previa corre la carga de verdad y después la deshace: así las reglas que se prueban son exactamente las de la carga.
class PruebaPrevia extends Error {
  constructor(readonly resultado: ResultadoCarga) {
    super('prueba previa');
  }
}

// Carga desde Excel de los datos de seguridad y salud en el trabajo (RF-SST-23): trabajadores, ausentismos, entregas de EPP y
// asistencias históricas, con prueba previa que no guarda nada y confirmación, como RF-MIG-02 y RF-MIG-03. No tiene reglas
// propias de negocio: cada fila pasa por los mismos servicios que usan las pantallas.
@Injectable()
export class ImportacionSstService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trabajadores: TrabajadoresService,
    private readonly ausentismo: AusentismoService,
    private readonly epp: EppService,
    private readonly capacitaciones: CapacitacionesService,
  ) {}

  plantilla() {
    return generarLibroDePlantilla({ titulo: 'Plantilla de carga de seguridad y salud en el trabajo', pasos: PASOS_SST, hojas: HOJAS_SST });
  }

  // Modo de prueba: valida todo el archivo y muestra errores, avisos y qué se cargaría, SIN guardar nada.
  async validar(archivo: Express.Multer.File | undefined, usuario: UsuarioAutenticado) {
    const { buffer, nombre } = this.exigirArchivo(archivo);
    const huella = this.calcularHuella(buffer);
    const libro = await leerLibroDe(buffer, HOJAS_SST);
    const resultado = await this.simular(libro, usuario);

    const previa = await this.prisma.importacion.findUnique({ where: { huella }, select: { createdAt: true, usuario: { select: { nombre: true } } } });
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
    };
  }

  // Confirmación: vuelve a correr el MISMO archivo y, solo si no hay ningún error, lo guarda todo en una sola transacción (o
  // entra completo o no entra nada).
  async confirmar(archivo: Express.Multer.File | undefined, huellaEsperada: string | undefined, usuario: UsuarioAutenticado) {
    const { buffer, nombre } = this.exigirArchivo(archivo);
    const huella = this.calcularHuella(buffer);
    if (!huellaEsperada || !FORMATO_HUELLA.test(huellaEsperada) || huellaEsperada !== huella) {
      throw new BadRequestException('El archivo no es el mismo que se validó. Súbelo y valídalo de nuevo antes de confirmar.');
    }
    const libro = await leerLibroDe(buffer, HOJAS_SST);

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CLAVE_BLOQUEO_CARGA_SST})`;
          if (await tx.importacion.findUnique({ where: { huella }, select: { id: true } })) {
            throw new ConflictException('Este archivo ya fue cargado. Si necesitas cargar más datos, usa un archivo con datos nuevos.');
          }

          // Se valida otra vez DENTRO de la transacción y con el bloqueo tomado: si alguien cambió algo entre la prueba previa y
          // la confirmación, se detecta aquí y no se guarda nada.
          const resultado = await cargarLibroSst(tx, libro, this.servicios(), usuario);
          if (resultado.errores.length > 0) {
            throw new BadRequestException({
              message: `El archivo tiene ${resultado.errores.length} error(es). Corrígelos y vuelve a validar.`,
              codigo: 'IMPORTACION_CON_ERRORES',
              totalErrores: resultado.errores.length,
              errores: resultado.errores.slice(0, MAXIMO_PROBLEMAS_DEVUELTOS),
            });
          }

          const { resumen } = resultado;
          const importacion = await tx.importacion.create({
            data: {
              usuarioId: usuario.id,
              nombreArchivo: nombre,
              huella,
              tipo: TipoImportacion.SST,
              resumen: resumen as unknown as Prisma.InputJsonValue,
              conciliacion: [],
            },
          });
          await registrarAuditoria(tx, {
            usuario,
            accion: 'IMPORTACION_EJECUTAR',
            entidad: 'IMPORTACION',
            entidadId: importacion.id,
            resumen: `Cargó el archivo "${nombre}" de seguridad y salud en el trabajo: ${resumen.trabajadores.nuevos} trabajador(es) nuevo(s), ${resumen.ausentismos} ausentismo(s), ${resumen.entregasEpp} entrega(s) de EPP y ${resumen.asistencias.registradas} asistencia(s)`,
            despues: { nombreArchivo: nombre, huella, tipo: 'SST', ...resumen },
          });

          return { id: importacion.id, nombreArchivo: nombre, createdAt: importacion.createdAt, resumen, avisos: resultado.avisos.slice(0, MAXIMO_PROBLEMAS_DEVUELTOS), totalAvisos: resultado.avisos.length };
        },
        { timeout: TIEMPO_MAXIMO_CARGA_MS, maxWait: 15_000 },
      );
    } catch (error) {
      // Dos confirmaciones simultáneas del mismo archivo: la base de datos deja pasar solo una.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Este archivo ya fue cargado.');
      }
      throw error;
    }
  }

  listar() {
    return this.prisma.importacion.findMany({
      where: { tipo: TipoImportacion.SST },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true, nombreArchivo: true, resumen: true, usuario: { select: { nombre: true } } },
    });
  }

  // ---------------------------------------------------------------------------------------------

  private servicios(): ServiciosDeCarga {
    return { trabajadores: this.trabajadores, ausentismo: this.ausentismo, epp: this.epp, capacitaciones: this.capacitaciones };
  }

  // Corre la carga dentro de una transacción que SIEMPRE se revierte y devuelve lo que habría pasado.
  private async simular(libro: LibroLeido<ClaveHojaSst>, usuario: UsuarioAutenticado): Promise<ResultadoCarga> {
    try {
      await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CLAVE_BLOQUEO_CARGA_SST})`;
          throw new PruebaPrevia(await cargarLibroSst(tx, libro, this.servicios(), usuario));
        },
        { timeout: TIEMPO_MAXIMO_CARGA_MS, maxWait: 15_000 },
      );
    } catch (error) {
      if (error instanceof PruebaPrevia) return error.resultado;
      throw error;
    }
    throw new Error('La prueba previa terminó sin resultado');
  }

  private exigirArchivo(archivo: Express.Multer.File | undefined) {
    if (!archivo) throw new BadRequestException('Falta el archivo de Excel (.xlsx)');
    return { buffer: archivo.buffer, nombre: archivo.originalname.slice(0, 200) };
  }

  private calcularHuella(buffer: Buffer) {
    return createHash('sha256').update(buffer).digest('hex');
  }
}
