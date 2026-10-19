import { Injectable } from '@nestjs/common';
import { parsearFechaLocal } from '../common/fecha.util.js';
import type { Prisma } from '../generated/prisma/client.js';
import { sumarDias } from '../cierres-caja/periodo.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ACCIONES_AUDITORIA, ENTIDADES_AUDITORIA } from './auditoria.js';
import { ListarAuditoriaQueryDto } from './dto/listar-auditoria-query.dto.js';

const LIMITE_POR_DEFECTO = 50;

// Consulta de la auditoría (RF-AUD-02). Solo lectura: no existe ninguna operación que cambie o borre registros
// (y la base de datos tampoco lo permite, RF-AUD-03).
@Injectable()
export class AuditoriaService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(filtro: ListarAuditoriaQueryDto) {
    const limite = filtro.limite ?? LIMITE_POR_DEFECTO;
    const pagina = filtro.pagina ?? 1;
    const buscar = filtro.buscar?.trim();

    const where: Prisma.RegistroAuditoriaWhereInput = {
      usuarioId: filtro.usuarioId,
      entidad: filtro.entidad,
      accion: filtro.accion,
      ...(filtro.desde || filtro.hasta
        ? {
            createdAt: {
              // Los días son de Colombia: de la medianoche local del primer día a la del día siguiente al último.
              ...(filtro.desde ? { gte: parsearFechaLocal(filtro.desde) } : {}),
              ...(filtro.hasta ? { lt: parsearFechaLocal(sumarDias(filtro.hasta, 1)) } : {}),
            },
          }
        : {}),
      ...(buscar ? { resumen: { contains: buscar, mode: 'insensitive' } } : {}),
    };

    const [total, registros] = await Promise.all([
      this.prisma.registroAuditoria.count({ where }),
      this.prisma.registroAuditoria.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (pagina - 1) * limite,
        take: limite,
      }),
    ]);

    return { registros, total, pagina, limite, paginas: Math.max(1, Math.ceil(total / limite)) };
  }

  // Lo que necesita la pantalla para armar los filtros: tipos de registro, acciones y usuarios.
  async catalogo() {
    const usuarios = await this.prisma.usuario.findMany({ select: { id: true, nombre: true, email: true }, orderBy: { nombre: 'asc' } });
    return {
      entidades: Object.entries(ENTIDADES_AUDITORIA).map(([valor, etiqueta]) => ({ valor, etiqueta })),
      acciones: Object.entries(ACCIONES_AUDITORIA).map(([valor, etiqueta]) => ({ valor, etiqueta })),
      usuarios,
    };
  }
}
