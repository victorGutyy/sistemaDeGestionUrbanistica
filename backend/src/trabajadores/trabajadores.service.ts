import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { registrarAuditoria, soloCampos } from '../auditoria/auditoria.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { parsearFechaLocal } from '../common/fecha.util.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CrearTrabajadorDto } from './dto/crear-trabajador.dto.js';

@Injectable()
export class TrabajadoresService {
  constructor(private readonly prisma: PrismaService) {}

  async crear(dto: CrearTrabajadorDto, usuario: UsuarioAutenticado) {
    const existente = await this.prisma.trabajador.findUnique({ where: { documento: dto.documento } });
    if (existente) {
      throw new ConflictException(`Ya existe un trabajador con el documento ${dto.documento}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const trabajador = await tx.trabajador.create({
        data: {
          nombre: dto.nombre,
          documento: dto.documento,
          cargo: dto.cargo,
          salarioBase: dto.salarioBase,
          fechaIngreso: parsearFechaLocal(dto.fechaIngreso),
          telefono: dto.telefono,
          email: dto.email,
        },
      });
      await registrarAuditoria(tx, {
        usuario,
        accion: 'TRABAJADOR_CREAR',
        entidad: 'TRABAJADOR',
        entidadId: trabajador.id,
        resumen: `Creó al trabajador ${trabajador.nombre} (${trabajador.cargo})`,
        despues: soloCampos(trabajador, ['nombre', 'documento', 'cargo', 'salarioBase', 'fechaIngreso', 'estado']),
      });
      return trabajador;
    });
  }

  listar() {
    return this.prisma.trabajador.findMany({ orderBy: { nombre: 'asc' } });
  }

  async buscarPorId(id: string) {
    const trabajador = await this.prisma.trabajador.findUnique({
      where: { id },
      include: { pagos: { include: { novedades: true }, orderBy: { fechaPago: 'desc' } } },
    });
    if (!trabajador) {
      throw new NotFoundException(`No existe el trabajador ${id}`);
    }
    return trabajador;
  }
}
