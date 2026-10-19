import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { registrarAuditoria, soloCampos } from '../auditoria/auditoria.js';
import { exigirProyecto, filtroProyectoId } from '../auth/alcance.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { diaDeColumnaDate } from '../cierres-caja/periodo.js';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoEquipo, EstadoMovimiento, EstadoProyecto, TipoMovimiento, TipoProyecto } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActualizarEquipoDto, BajaEquipoDto, CrearEquipoDto, ListarEquiposQueryDto } from './dto/equipo.dto.js';

const ETIQUETA_ESTADO: Record<EstadoEquipo, string> = {
  ACTIVO: 'Activo',
  EN_MANTENIMIENTO: 'En mantenimiento',
  FUERA_DE_SERVICIO: 'Fuera de servicio',
};

const CAMPOS_AUDITADOS = ['nombre', 'tipoEquipoId', 'marca', 'modelo', 'anio', 'placaSerie', 'estado'] as const;

const INCLUIR_EQUIPO = {
  tipoEquipo: { select: { id: true, nombre: true } },
  proyecto: { select: { id: true, nombre: true } },
  bajaPor: { select: { nombre: true } },
} satisfies Prisma.EquipoInclude;

const textoOpcional = (valor: string | undefined) => (valor === undefined ? undefined : valor.trim() === '' ? null : valor.trim());

// Los equipos de maquinaria (RF-MAQ-01, 02 y 07). Un equipo nunca se borra: se da de baja con motivo y conserva todos
// sus movimientos; un equipo dado de baja no recibe movimientos nuevos ni se edita (solo el gerente lo reactiva).
@Injectable()
export class EquiposService {
  constructor(private readonly prisma: PrismaService) {}

  // Tipos activos para elegir al registrar un equipo.
  listarTipos() {
    return this.prisma.tipoEquipo.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } });
  }

  async listar(filtro: ListarEquiposQueryDto, usuario: UsuarioAutenticado) {
    const equipos = await this.prisma.equipo.findMany({
      where: {
        proyectoId: filtro.proyectoId,
        ...(filtro.incluirBajas === 'true' ? {} : { bajaEn: null }),
        AND: [filtroProyectoId(usuario)],
      },
      include: INCLUIR_EQUIPO,
      orderBy: [{ proyecto: { nombre: 'asc' } }, { nombre: 'asc' }],
    });
    return equipos.map((equipo) => ({ ...equipo, deBaja: equipo.bajaEn !== null }));
  }

  async crear(dto: CrearEquipoDto, usuario: UsuarioAutenticado) {
    exigirProyecto(usuario, dto.proyectoId, `No existe el proyecto ${dto.proyectoId}`);
    const proyecto = await this.prisma.proyecto.findUnique({ where: { id: dto.proyectoId } });
    if (!proyecto) {
      throw new NotFoundException(`No existe el proyecto ${dto.proyectoId}`);
    }
    if (proyecto.tipo !== TipoProyecto.MAQUINARIA) {
      throw new ConflictException(`El proyecto ${proyecto.nombre} no es de maquinaria: no maneja equipos`);
    }
    if (proyecto.estado === EstadoProyecto.FINALIZADO) {
      throw new ConflictException(`El proyecto ${proyecto.nombre} ya está finalizado, no admite equipos nuevos`);
    }
    await this.exigirTipoActivo(dto.tipoEquipoId);
    const placaSerie = textoOpcional(dto.placaSerie) ?? null;
    if (placaSerie) await this.exigirPlacaLibre(placaSerie);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const equipo = await tx.equipo.create({
          data: {
            proyectoId: dto.proyectoId,
            nombre: dto.nombre.trim(),
            tipoEquipoId: dto.tipoEquipoId,
            marca: textoOpcional(dto.marca) ?? null,
            modelo: textoOpcional(dto.modelo) ?? null,
            anio: dto.anio ?? null,
            placaSerie,
            estado: dto.estado ?? EstadoEquipo.ACTIVO,
          },
          include: INCLUIR_EQUIPO,
        });
        await registrarAuditoria(tx, {
          usuario,
          accion: 'EQUIPO_CREAR',
          entidad: 'EQUIPO',
          entidadId: equipo.id,
          resumen: `Registró el equipo ${equipo.nombre} (${equipo.tipoEquipo.nombre}) en ${proyecto.nombre}`,
          despues: soloCampos(equipo, [...CAMPOS_AUDITADOS]),
        });
        return equipo;
      });
    } catch (error) {
      // Dos personas registrando la misma placa a la vez: la base de datos deja pasar solo una.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Ya existe un equipo con la placa o serie ${placaSerie}`);
      }
      throw error;
    }
  }

  // Ficha del equipo: sus datos y sus movimientos, con los totales de lo que ingresó y gastó (los anulados se ven,
  // pero no suman). El reporte por rango de fechas y la comparación entre equipos son de la Etapa 2 (RF-MAQ-05).
  async obtener(id: string, usuario: UsuarioAutenticado) {
    const equipo = await this.prisma.equipo.findFirst({ where: { id, AND: [filtroProyectoId(usuario)] }, include: INCLUIR_EQUIPO });
    if (!equipo) {
      throw new NotFoundException(`No existe el equipo ${id}`);
    }

    const movimientos = await this.prisma.movimientoFinanciero.findMany({
      where: { equipoId: id },
      include: { categoriaGasto: { select: { nombre: true } }, categoriaIngreso: { select: { nombre: true } } },
      orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }],
    });

    let ingresos = new Prisma.Decimal(0);
    let egresos = new Prisma.Decimal(0);
    for (const movimiento of movimientos) {
      if (movimiento.estado !== EstadoMovimiento.ACTIVO) continue;
      if (movimiento.tipo === TipoMovimiento.INGRESO) ingresos = ingresos.plus(movimiento.valor);
      else egresos = egresos.plus(movimiento.valor);
    }

    return {
      ...equipo,
      deBaja: equipo.bajaEn !== null,
      totales: { ingresos, egresos, utilidad: ingresos.minus(egresos) },
      movimientos: movimientos.map((movimiento) => ({
        id: movimiento.id,
        fecha: movimiento.fecha,
        tipo: movimiento.tipo,
        categoria: (movimiento.categoriaGasto ?? movimiento.categoriaIngreso)?.nombre ?? '—',
        descripcion: movimiento.descripcion,
        valor: movimiento.valor,
        estado: movimiento.estado,
        tercero: movimiento.terceroNombre,
        periodoDesde: movimiento.periodoDesde ? diaDeColumnaDate(movimiento.periodoDesde) : null,
        periodoHasta: movimiento.periodoHasta ? diaDeColumnaDate(movimiento.periodoHasta) : null,
      })),
    };
  }

  async actualizar(id: string, dto: ActualizarEquipoDto, usuario: UsuarioAutenticado) {
    const actual = await this.buscarEnAlcance(id, usuario);
    if (actual.bajaEn) {
      throw new ConflictException('Este equipo está dado de baja: no se edita (el gerente puede reactivarlo)');
    }

    const cambios: Prisma.EquipoUncheckedUpdateInput = {};
    if (dto.nombre !== undefined && dto.nombre.trim() !== actual.nombre) cambios.nombre = dto.nombre.trim();
    if (dto.tipoEquipoId !== undefined && dto.tipoEquipoId !== actual.tipoEquipoId) {
      await this.exigirTipoActivo(dto.tipoEquipoId);
      cambios.tipoEquipoId = dto.tipoEquipoId;
    }
    for (const campo of ['marca', 'modelo'] as const) {
      const nuevo = textoOpcional(dto[campo]);
      if (nuevo !== undefined && nuevo !== actual[campo]) cambios[campo] = nuevo;
    }
    if (dto.anio !== undefined && dto.anio !== actual.anio) cambios.anio = dto.anio;
    const placa = textoOpcional(dto.placaSerie);
    if (placa !== undefined && placa !== actual.placaSerie) {
      if (placa) await this.exigirPlacaLibre(placa, id);
      cambios.placaSerie = placa;
    }
    if (dto.estado !== undefined && dto.estado !== actual.estado) cambios.estado = dto.estado;
    if (Object.keys(cambios).length === 0) {
      return this.obtener(id, usuario);
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const actualizado = await tx.equipo.update({ where: { id }, data: cambios, include: INCLUIR_EQUIPO });
        const cambiados = CAMPOS_AUDITADOS.filter((campo) => String(actual[campo]) !== String(actualizado[campo]));
        const cambioDeEstado = cambiados.includes('estado') ? `: ${ETIQUETA_ESTADO[actual.estado]} → ${ETIQUETA_ESTADO[actualizado.estado]}` : '';
        await registrarAuditoria(tx, {
          usuario,
          accion: 'EQUIPO_EDITAR',
          entidad: 'EQUIPO',
          entidadId: id,
          resumen: `Editó el equipo ${actualizado.nombre}${cambioDeEstado || ` (${cambiados.join(', ')})`}`,
          antes: soloCampos(actual, cambiados),
          despues: soloCampos(actualizado, cambiados),
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ya existe un equipo con esa placa o serie');
      }
      throw error;
    }
    return this.obtener(id, usuario);
  }

  // RF-MAQ-07: la baja conserva el equipo y todos sus movimientos; ya no recibe movimientos nuevos.
  async darDeBaja(id: string, dto: BajaEquipoDto, usuario: UsuarioAutenticado) {
    const actual = await this.buscarEnAlcance(id, usuario);
    const motivo = dto.motivo.trim();
    if (motivo.length < 5) {
      throw new BadRequestException('Explica el motivo de la baja');
    }

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.equipo.updateMany({ where: { id, bajaEn: null }, data: { bajaEn: new Date(), bajaMotivo: motivo, bajaPorId: usuario.id } });
      if (count === 0) {
        throw new ConflictException('Este equipo ya está dado de baja');
      }
      await registrarAuditoria(tx, {
        usuario,
        accion: 'EQUIPO_BAJA',
        entidad: 'EQUIPO',
        entidadId: id,
        resumen: `Dio de baja el equipo ${actual.nombre}: ${motivo}`,
        antes: { deBaja: false },
        despues: { deBaja: true, motivo },
      });
    });
    return this.obtener(id, usuario);
  }

  async reactivar(id: string, usuario: UsuarioAutenticado) {
    const actual = await this.buscarEnAlcance(id, usuario);

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.equipo.updateMany({ where: { id, bajaEn: { not: null } }, data: { bajaEn: null, bajaMotivo: null, bajaPorId: null } });
      if (count === 0) {
        throw new ConflictException('Este equipo no está dado de baja');
      }
      await registrarAuditoria(tx, {
        usuario,
        accion: 'EQUIPO_REACTIVAR',
        entidad: 'EQUIPO',
        entidadId: id,
        resumen: `Reactivó el equipo ${actual.nombre}`,
        antes: { deBaja: true, motivo: actual.bajaMotivo, bajaEn: actual.bajaEn },
        despues: { deBaja: false },
      });
    });
    return this.obtener(id, usuario);
  }

  // ---------------------------------------------------------------------------------------------

  private async buscarEnAlcance(id: string, usuario: UsuarioAutenticado) {
    const equipo = await this.prisma.equipo.findFirst({ where: { id, AND: [filtroProyectoId(usuario)] }, include: INCLUIR_EQUIPO });
    if (!equipo) {
      throw new NotFoundException(`No existe el equipo ${id}`);
    }
    return equipo;
  }

  private async exigirTipoActivo(tipoEquipoId: string) {
    const tipo = await this.prisma.tipoEquipo.findUnique({ where: { id: tipoEquipoId } });
    if (!tipo) {
      throw new BadRequestException('El tipo de equipo no existe');
    }
    if (!tipo.activo) {
      throw new BadRequestException(`El tipo de equipo "${tipo.nombre}" está desactivado: elige otro`);
    }
  }

  private async exigirPlacaLibre(placaSerie: string, ignorarId?: string) {
    const repetido = await this.prisma.equipo.findFirst({ where: { placaSerie: { equals: placaSerie, mode: 'insensitive' } } });
    if (repetido && repetido.id !== ignorarId) {
      throw new ConflictException(`Ya existe un equipo con la placa o serie ${placaSerie} (${repetido.nombre})`);
    }
  }
}

