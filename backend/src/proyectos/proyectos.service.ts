import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { registrarAuditoria, soloCampos } from '../auditoria/auditoria.js';
import { exigirAlcanceTotal, exigirProyecto, filtroProyecto } from '../auth/alcance.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { parsearFechaLocal } from '../common/fecha.util.js';
import { EstadoProyecto, TipoProyecto } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { calcularResumenAreas } from './areas.js';
import { CrearManzanaDto } from './dto/crear-manzana.dto.js';
import { ActualizarEstadoProyectoDto } from './dto/actualizar-estado-proyecto.dto.js';
import { CrearProyectoDto } from './dto/crear-proyecto.dto.js';

@Injectable()
export class ProyectosService {
  constructor(private readonly prisma: PrismaService) {}

  crear(dto: CrearProyectoDto, usuario: UsuarioAutenticado) {
    // Un proyecto nuevo quedaría fuera del alcance de quien está limitado a ciertos proyectos.
    exigirAlcanceTotal(usuario);

    return this.prisma.$transaction(async (tx) => {
      const proyecto = await tx.proyecto.create({
        data: {
          nombre: dto.nombre,
          tipo: dto.tipo,
          ubicacion: dto.ubicacion,
          municipio: dto.municipio,
          areaTotal: dto.areaTotal,
          valorCompra: dto.valorCompra,
          fechaCompra: dto.fechaCompra ? parsearFechaLocal(dto.fechaCompra) : undefined,
        },
      });
      await registrarAuditoria(tx, {
        usuario,
        accion: 'PROYECTO_CREAR',
        entidad: 'PROYECTO',
        entidadId: proyecto.id,
        resumen: `Creó el proyecto ${proyecto.nombre}`,
        despues: soloCampos(proyecto, ['nombre', 'tipo', 'ubicacion', 'municipio', 'areaTotal', 'valorCompra', 'fechaCompra', 'estado']),
      });
      return proyecto;
    });
  }

  listar(usuario: UsuarioAutenticado) {
    return this.prisma.proyecto.findMany({
      where: filtroProyecto(usuario),
      include: { _count: { select: { lotes: true } } },
      orderBy: { nombre: 'asc' },
    });
  }

  async buscarPorId(id: string, usuario: UsuarioAutenticado) {
    const proyecto = await this.prisma.proyecto.findFirst({
      where: { id, AND: [filtroProyecto(usuario)] },
      include: {
        manzanas: { orderBy: { nombre: 'asc' } },
        lotes: { orderBy: { numero: 'asc' }, include: { manzana: true } },
      },
    });
    if (!proyecto) {
      throw new NotFoundException(`No existe el proyecto ${id}`);
    }
    // RF-PRY-04: área total, subdividida y disponible.
    return { ...proyecto, resumenAreas: calcularResumenAreas(proyecto.areaTotal, proyecto.lotes.map((lote) => lote.area)) };
  }

  // RF-PRY-02: las manzanas son opcionales y solo existen en proyectos de venta de lotes.
  async crearManzana(proyectoId: string, dto: CrearManzanaDto, usuario: UsuarioAutenticado) {
    exigirProyecto(usuario, proyectoId, `No existe el proyecto ${proyectoId}`);

    const proyecto = await this.prisma.proyecto.findUnique({ where: { id: proyectoId } });
    if (!proyecto) {
      throw new NotFoundException(`No existe el proyecto ${proyectoId}`);
    }
    if (proyecto.tipo !== TipoProyecto.LOTES) {
      throw new ConflictException(`El proyecto ${proyecto.nombre} no es de venta de lotes: no maneja manzanas`);
    }
    if (proyecto.estado === EstadoProyecto.FINALIZADO) {
      throw new ConflictException(`El proyecto ${proyecto.nombre} ya está finalizado, no admite manzanas nuevas`);
    }

    const nombre = dto.nombre.trim();
    const repetida = await this.prisma.manzana.findFirst({
      where: { proyectoId, nombre: { equals: nombre, mode: 'insensitive' } },
    });
    if (repetida) {
      throw new ConflictException(`El proyecto ya tiene la manzana "${repetida.nombre}"`);
    }

    return this.prisma.$transaction(async (tx) => {
      const manzana = await tx.manzana.create({ data: { proyectoId, nombre } });
      await registrarAuditoria(tx, {
        usuario,
        accion: 'PROYECTO_CREAR_MANZANA',
        entidad: 'PROYECTO',
        entidadId: proyectoId,
        resumen: `Creó la manzana "${manzana.nombre}" en el proyecto ${proyecto.nombre}`,
        despues: { manzanaId: manzana.id, nombre: manzana.nombre },
      });
      return manzana;
    });
  }

  async actualizarEstado(id: string, dto: ActualizarEstadoProyectoDto, usuario: UsuarioAutenticado) {
    exigirProyecto(usuario, id, `No existe el proyecto ${id}`);

    const proyecto = await this.prisma.proyecto.findUnique({ where: { id } });
    if (!proyecto) {
      throw new NotFoundException(`No existe el proyecto ${id}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const actualizado = await tx.proyecto.update({ where: { id }, data: { estado: dto.estado } });
      await registrarAuditoria(tx, {
        usuario,
        accion: 'PROYECTO_CAMBIAR_ESTADO',
        entidad: 'PROYECTO',
        entidadId: id,
        resumen: `${dto.estado === EstadoProyecto.FINALIZADO ? 'Finalizó' : 'Reactivó'} el proyecto ${proyecto.nombre}`,
        antes: { estado: proyecto.estado },
        despues: { estado: actualizado.estado },
      });
      return actualizado;
    });
  }
}
