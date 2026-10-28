import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { registrarAuditoria, soloCampos } from '../auditoria/auditoria.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { parsearFechaLocal } from '../common/fecha.util.js';
import { Prisma } from '../generated/prisma/client.js';
import { EntidadRecobro, EstadoRecobro } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ActualizarRecobroDto, ListarRecobrosQueryDto } from './dto/ausentismo.dto.js';
import { diasDeLaEntidad, errorEnRecobro, ETIQUETA_ENTIDAD_RECOBRO, valorEsperadoPara } from './recobros.js';
import { presentarRecobro, vistaDe } from './visibilidad.js';

const LIMITE_LISTA = 500;
const CAMPOS_RECOBRO = ['entidad', 'estado', 'valorReconocido', 'fechaRadicacion', 'fechaPago', 'observaciones'] as const;

function fechaDelRecobro(valor: string | undefined, campo: string): Date | null {
  if (!valor) return null;
  const fecha = parsearFechaLocal(valor);
  const [anio, mes, dia] = valor.split('-').map(Number);
  if (Number.isNaN(fecha.getTime()) || fecha.getFullYear() !== anio || fecha.getMonth() + 1 !== mes || fecha.getDate() !== dia) {
    throw new BadRequestException(`${campo} no es una fecha válida`);
  }
  return fecha;
}

// Seguimiento del recobro de las incapacidades a la EPS, la ARL o el fondo de pensiones (RF-SST-09): pendiente, radicado,
// pagado o rechazado, con el valor y las fechas. El sistema no transmite nada a esas entidades. Es plata: quien lo lleva debe
// poder ver valores, y los demás solo ven el estado.
@Injectable()
export class RecobrosAusentismoService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(filtro: ListarRecobrosQueryDto, usuario: UsuarioAutenticado) {
    const filas = await this.prisma.recobroAusentismo.findMany({
      where: {
        ...(filtro.estado ? { estado: filtro.estado } : {}),
        ...(filtro.entidad ? { entidad: filtro.entidad } : {}),
        ausentismo: { anulada: false, ...(filtro.anio ? { anio: filtro.anio } : {}) },
      },
      orderBy: [{ ausentismo: { fechaInicio: 'desc' } }, { entidad: 'asc' }],
      take: LIMITE_LISTA,
      include: {
        ausentismo: {
          select: {
            id: true,
            fechaInicio: true,
            fechaFin: true,
            dias: true,
            numeroDocumento: true,
            trabajador: { select: { id: true, nombre: true, documento: true } },
            tipo: { select: { id: true, nombre: true } },
            periodos: { select: { valorEps: true, valorArl: true, valorAfp: true, diasEps: true, diasArl: true, diasAfp: true } },
          },
        },
      },
    });
    const vista = vistaDe(usuario);
    return filas.map(({ ausentismo, ...recobro }) => {
      const { periodos, ...resto } = ausentismo;
      return presentarRecobro({ ...recobro, valorEsperado: valorEsperadoPara(recobro.entidad, periodos).toString(), ausentismo: resto }, vista);
    });
  }

  // Cambia el estado de un recobro con los datos que ese estado exige. Los campos que no aplican al nuevo estado se limpian.
  // Si el ausentismo todavía no tiene seguimiento con esa entidad pero la liquidación le asigna días, se crea.
  async actualizar(ausentismoId: string, entidad: EntidadRecobro, dto: ActualizarRecobroDto, usuario: UsuarioAutenticado) {
    const ausentismo = await this.prisma.ausentismo.findUnique({
      where: { id: ausentismoId },
      include: {
        trabajador: { select: { nombre: true } },
        periodos: { select: { valorEps: true, valorArl: true, valorAfp: true, diasEps: true, diasArl: true, diasAfp: true } },
        recobros: { where: { entidad } },
      },
    });
    if (!ausentismo) {
      throw new NotFoundException(`No existe el ausentismo ${ausentismoId}`);
    }
    if (ausentismo.anulada) {
      throw new BadRequestException('El ausentismo está anulado: ya no tiene recobro');
    }
    const actual = ausentismo.recobros[0] ?? null;
    if (!actual && diasDeLaEntidad(entidad, ausentismo.periodos) === 0) {
      throw new BadRequestException(`Este ausentismo no tiene días a cargo ${ETIQUETA_ENTIDAD_RECOBRO[entidad].de}: no hay nada que cobrarle`);
    }

    const datos = {
      estado: dto.estado,
      valorReconocido: dto.valorReconocido ?? null,
      fechaRadicacion: fechaDelRecobro(dto.fechaRadicacion, 'fechaRadicacion'),
      fechaPago: fechaDelRecobro(dto.fechaPago, 'fechaPago'),
      observaciones: dto.observaciones?.trim() || null,
    };
    const error = errorEnRecobro(datos);
    if (error) {
      throw new BadRequestException(error);
    }
    // Un recobro pendiente empieza de cero: no arrastra valor ni observaciones de un estado anterior.
    const guardar = {
      estado: datos.estado,
      valorReconocido: datos.estado === EstadoRecobro.PENDIENTE || datos.valorReconocido === null ? null : new Prisma.Decimal(datos.valorReconocido),
      fechaRadicacion: datos.fechaRadicacion,
      fechaPago: datos.fechaPago,
      observaciones: datos.observaciones,
      actualizadoPorId: usuario.id,
    };

    const actualizado = await this.prisma.$transaction(async (tx) => {
      const recobro = actual
        ? await tx.recobroAusentismo.update({ where: { id: actual.id }, data: guardar })
        : await tx.recobroAusentismo.create({ data: { ausentismoId, entidad, ...guardar } });
      await registrarAuditoria(tx, {
        usuario,
        accion: 'AUSENTISMO_RECOBRO_ACTUALIZAR',
        entidad: 'AUSENTISMO',
        entidadId: ausentismoId,
        resumen: `Pasó el recobro ${ETIQUETA_ENTIDAD_RECOBRO[entidad].a} de un ausentismo de ${ausentismo.trabajador.nombre} a ${recobro.estado.toLowerCase()}`,
        antes: soloCampos(actual, CAMPOS_RECOBRO),
        despues: soloCampos(recobro, CAMPOS_RECOBRO),
      });
      return recobro;
    });
    return presentarRecobro({ ...actualizado, valorEsperado: valorEsperadoPara(entidad, ausentismo.periodos).toString() }, vistaDe(usuario));
  }
}
