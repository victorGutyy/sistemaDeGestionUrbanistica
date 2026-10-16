import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { exigirProyecto, filtroCliente, filtroLote } from '../auth/alcance.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { parsearFechaLocal } from '../common/fecha.util.js';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoProyecto, EstadoSeparacion, TipoEventoLote, TipoProyecto } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { calcularResumenAreas } from '../proyectos/areas.js';
import { aplicarAccionLote, type OpcionesAccionLote } from './aplicar-accion.js';
import { AccionLoteDto, EscriturarLoteDto, ReponerLoteDto, SepararLoteDto } from './dto/accion-lote.dto.js';
import { ActualizarLoteDto } from './dto/actualizar-lote.dto.js';
import { CrearLoteDto } from './dto/crear-lote.dto.js';
import { ListarLotesQueryDto } from './dto/listar-lotes-query.dto.js';
import { ESTADOS_CON_VENTA, ETIQUETA_ESTADO_LOTE, accionesDisponibles, type AccionLote } from './estado-lote.js';

const ERROR_UNICO_PRISMA = 'P2002';

// La separación activa de un lote (si la hay), con quién la registró, para mostrarla en la ficha y en las listas.
const SEPARACION_ACTIVA = {
  where: { estado: EstadoSeparacion.ACTIVA },
  take: 1,
  include: { cliente: { select: { id: true, nombre: true } }, registradaPor: { select: { nombre: true } } },
} as const;

@Injectable()
export class LotesService {
  constructor(private readonly prisma: PrismaService) {}

  async crear(dto: CrearLoteDto, usuario: UsuarioAutenticado) {
    exigirProyecto(usuario, dto.proyectoId, `No existe el proyecto ${dto.proyectoId}`);

    const proyecto = await this.prisma.proyecto.findUnique({ where: { id: dto.proyectoId } });
    if (!proyecto) {
      throw new NotFoundException(`No existe el proyecto ${dto.proyectoId}`);
    }
    if (proyecto.tipo !== TipoProyecto.LOTES) {
      throw new ConflictException(`El proyecto ${proyecto.nombre} no es de venta de lotes: no maneja lotes`);
    }
    if (proyecto.estado === EstadoProyecto.FINALIZADO) {
      throw new ConflictException(`El proyecto ${proyecto.nombre} ya está finalizado, no admite lotes nuevos`);
    }

    if (dto.manzanaId) {
      const manzana = await this.prisma.manzana.findFirst({ where: { id: dto.manzanaId, proyectoId: dto.proyectoId } });
      if (!manzana) {
        throw new BadRequestException('La manzana indicada no pertenece a este proyecto');
      }
    }

    // El número es único dentro de la manzana, o dentro del proyecto cuando no tiene manzanas.
    const manzanaId = dto.manzanaId ?? null;
    const repetido = await this.prisma.lote.findFirst({
      where: { proyectoId: dto.proyectoId, manzanaId, numero: dto.numero },
    });
    if (repetido) {
      throw new ConflictException(
        manzanaId
          ? `Esa manzana ya tiene un lote con el número ${dto.numero}`
          : `El proyecto ya tiene un lote con el número ${dto.numero}`,
      );
    }

    await this.exigirAreaDisponible(proyecto, new Prisma.Decimal(dto.area), undefined, dto.confirmarExcesoArea);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const lote = await tx.lote.create({
          data: {
            proyectoId: dto.proyectoId,
            manzanaId,
            numero: dto.numero,
            area: dto.area,
            linderos: dto.linderos,
            valorPorM2: dto.valorPorM2,
            valorVenta: dto.valorVenta,
          },
        });
        await tx.loteHistorial.create({
          data: {
            loteId: lote.id,
            tipo: TipoEventoLote.CREACION,
            estadoNuevo: lote.estado,
            valorNuevo: lote.valorVenta,
            usuarioId: usuario.id,
          },
        });
        return lote;
      });
    } catch (error) {
      // Dos personas creando el mismo número a la vez: la base de datos lo impide y se avisa igual que arriba.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === ERROR_UNICO_PRISMA) {
        throw new ConflictException(`Ya existe un lote con el número ${dto.numero} en ese lugar del proyecto`);
      }
      throw error;
    }
  }

  listar(filtro: ListarLotesQueryDto, usuario: UsuarioAutenticado) {
    const buscar = filtro.buscar?.trim();
    return this.prisma.lote.findMany({
      where: {
        estado: filtro.estado,
        proyectoId: filtro.proyectoId,
        manzanaId: filtro.manzanaId,
        ...(buscar
          ? {
              OR: [
                { numero: { contains: buscar, mode: 'insensitive' } },
                { linderos: { contains: buscar, mode: 'insensitive' } },
              ],
            }
          : {}),
        // Se combina con el alcance: pedir un proyecto ajeno devuelve una lista vacía.
        AND: [filtroLote(usuario)],
      },
      include: { proyecto: true, manzana: true, separaciones: SEPARACION_ACTIVA },
      orderBy: [{ proyecto: { nombre: 'asc' } }, { manzana: { nombre: 'asc' } }, { numero: 'asc' }],
    });
  }

  // Ficha del lote: datos, manzana, historial (lo más reciente primero) y acciones posibles según su estado.
  async buscarPorId(id: string, usuario: UsuarioAutenticado) {
    const lote = await this.prisma.lote.findFirst({
      where: { id, ...filtroLote(usuario) },
      include: {
        proyecto: true,
        manzana: true,
        historial: { orderBy: { createdAt: 'desc' }, include: { usuario: { select: { nombre: true } } } },
        separaciones: SEPARACION_ACTIVA,
      },
    });
    if (!lote) {
      throw new NotFoundException(`No existe el lote ${id}`);
    }
    const { separaciones, ...datos } = lote;
    return { ...datos, separacionActiva: separaciones[0] ?? null, acciones: accionesDisponibles(lote.estado) };
  }

  async actualizar(id: string, dto: ActualizarLoteDto, usuario: UsuarioAutenticado) {
    const lote = await this.obtenerParaCambiar(id, usuario);

    const cambiaArea = dto.area !== undefined && !new Prisma.Decimal(dto.area).equals(lote.area);
    const cambiaPrecio = dto.valorVenta !== undefined && !new Prisma.Decimal(dto.valorVenta).equals(lote.valorVenta);

    if ((cambiaArea || cambiaPrecio) && ESTADOS_CON_VENTA.includes(lote.estado)) {
      throw new ConflictException(
        `El lote ${lote.numero} está ${ETIQUETA_ESTADO_LOTE[lote.estado].toLowerCase()}: ya no se puede cambiar su precio ni su área`,
      );
    }

    if (cambiaArea) {
      await this.exigirAreaDisponible(lote.proyecto, new Prisma.Decimal(dto.area!), lote.id, dto.confirmarExcesoArea);
    }

    return this.prisma.$transaction(async (tx) => {
      const actualizado = await tx.lote.update({
        where: { id },
        data: {
          area: cambiaArea ? dto.area : undefined,
          linderos: dto.linderos,
          valorPorM2: dto.valorPorM2,
          valorVenta: cambiaPrecio ? dto.valorVenta : undefined,
        },
      });
      if (cambiaPrecio) {
        await tx.loteHistorial.create({
          data: {
            loteId: id,
            tipo: TipoEventoLote.CAMBIO_PRECIO,
            valorAnterior: lote.valorVenta,
            valorNuevo: actualizado.valorVenta,
            motivo: dto.motivo,
            usuarioId: usuario.id,
          },
        });
      }
      return actualizado;
    });
  }

  // Separar el lote y dejar constancia de quién lo aparta, cuánto dejó y hasta cuándo (RF-VEN-01).
  async separar(id: string, dto: SepararLoteDto, usuario: UsuarioAutenticado) {
    const lote = await this.obtenerParaCambiar(id, usuario);

    if (dto.valor && !dto.clienteId && !dto.nombreInteresado) {
      throw new BadRequestException('Si la separación tiene un valor, indica de quién es (un cliente o su nombre)');
    }
    if (dto.clienteId && dto.nombreInteresado) {
      throw new BadRequestException('Indica un cliente registrado o un nombre, no ambos');
    }
    if (dto.clienteId) {
      const cliente = await this.prisma.cliente.findFirst({ where: { id: dto.clienteId, ...filtroCliente(usuario) } });
      if (!cliente) {
        throw new NotFoundException(`No existe el cliente ${dto.clienteId}`);
      }
    }
    const fechaLimite = dto.fechaLimite ? parsearFechaLocal(dto.fechaLimite) : null;
    if (fechaLimite) {
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      if (fechaLimite.getTime() < hoy.getTime()) {
        throw new BadRequestException('La fecha límite no puede estar en el pasado');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await aplicarAccionLote(tx, lote, 'SEPARAR', usuario.id, { motivo: dto.motivo });
      await tx.separacion.create({
        data: {
          loteId: id,
          clienteId: dto.clienteId,
          nombreInteresado: dto.nombreInteresado?.trim(),
          telefonoInteresado: dto.telefonoInteresado?.trim(),
          valor: dto.valor,
          fechaLimite,
          registradaPorId: usuario.id,
        },
      });
      return tx.lote.findUniqueOrThrow({ where: { id } });
    });
  }

  // Liberar la separación cierra también el registro de la separación (queda LIBERADA, no se borra).
  async liberar(id: string, dto: AccionLoteDto, usuario: UsuarioAutenticado) {
    const lote = await this.obtenerParaCambiar(id, usuario);

    return this.prisma.$transaction(async (tx) => {
      await aplicarAccionLote(tx, lote, 'LIBERAR', usuario.id, { motivo: dto.motivo });
      await tx.separacion.updateMany({ where: { loteId: id, estado: EstadoSeparacion.ACTIVA }, data: { estado: EstadoSeparacion.LIBERADA } });
      return tx.lote.findUniqueOrThrow({ where: { id } });
    });
  }

  escriturar(id: string, dto: EscriturarLoteDto, usuario: UsuarioAutenticado) {
    return this.cambiarEstado(id, 'ESCRITURAR', usuario, {
      escritura: { numero: dto.numero, notaria: dto.notaria, fecha: parsearFechaLocal(dto.fecha) },
    });
  }

  // Un lote desistido solo vuelve a la venta por decisión del gerente (el permiso se exige en el controlador).
  reponer(id: string, dto: ReponerLoteDto, usuario: UsuarioAutenticado) {
    return this.cambiarEstado(id, 'REPONER', usuario, { motivo: dto.motivo });
  }

  private async cambiarEstado(id: string, accion: AccionLote, usuario: UsuarioAutenticado, opciones: OpcionesAccionLote) {
    const lote = await this.obtenerParaCambiar(id, usuario);

    return this.prisma.$transaction(async (tx) => {
      await aplicarAccionLote(tx, lote, accion, usuario.id, opciones);
      return tx.lote.findUniqueOrThrow({ where: { id } });
    });
  }

  // El lote debe existir y estar dentro del alcance del usuario (si no, responde como si no existiera).
  private async obtenerParaCambiar(id: string, usuario: UsuarioAutenticado) {
    const lote = await this.prisma.lote.findFirst({
      where: { id, ...filtroLote(usuario) },
      include: { proyecto: true },
    });
    if (!lote) {
      throw new NotFoundException(`No existe el lote ${id}`);
    }
    return lote;
  }

  // RF-PRY-04: avisa (no bloquea) si el lote hace que la suma de áreas pase el área total del proyecto.
  private async exigirAreaDisponible(
    proyecto: { id: string; areaTotal: Prisma.Decimal },
    areaNueva: Prisma.Decimal,
    ignorarLoteId: string | undefined,
    confirmado: boolean | undefined,
  ) {
    const { _sum } = await this.prisma.lote.aggregate({
      where: { proyectoId: proyecto.id, id: ignorarLoteId ? { not: ignorarLoteId } : undefined },
      _sum: { area: true },
    });
    const { areaDisponible } = calcularResumenAreas(proyecto.areaTotal, _sum.area ? [_sum.area] : []);

    if (areaNueva.greaterThan(areaDisponible) && !confirmado) {
      throw new ConflictException({
        message: `El lote (${areaNueva.toString()} m²) supera el área disponible del proyecto (${areaDisponible.toString()} m²). Confirma para crearlo de todas formas.`,
        codigo: 'AREA_EXCEDIDA',
        areaDisponible: areaDisponible.toString(),
      });
    }
  }
}
