import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { filtroVenta } from '../auth/alcance.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { registrarAuditoria } from '../auditoria/auditoria.js';
import { parsearFechaLocal } from '../common/fecha.util.js';
import { formatearCOP } from '../common/formato.util.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoAbono, EstadoVerificacion } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ListarPorVerificarQueryDto } from './dto/verificacion.dto.js';
import { diasDeEspera, esperaEnAlerta } from './verificacion.js';

const LIMITE_LISTA = 500;

// Abonos pagados por consignación, transferencia o billetera que esperan que el administrador los confirme contra el
// extracto del banco (RF-REC-10). Cuentan igual en el saldo del cliente: la verificación es un control, no un
// requisito para que el pago valga.
@Injectable()
export class VerificacionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configuracion: ConfiguracionService,
  ) {}

  // Los más antiguos primero: son los que más urge confirmar.
  async listarPorVerificar(filtro: ListarPorVerificarQueryDto, usuario: UsuarioAutenticado) {
    const empresa = await this.configuracion.obtenerEmpresa();
    const donde = this.dondePorVerificar(usuario, filtro);
    const hoy = new Date();

    const [filas, agregado] = await Promise.all([
      this.prisma.abono.findMany({
        where: donde,
        include: {
          recibo: { select: { numeroTexto: true } },
          cuentaDestino: { select: { id: true, banco: true, alias: true } },
          registradoPor: { select: { nombre: true } },
          venta: {
            select: {
              id: true,
              cliente: { select: { id: true, nombre: true } },
              lote: { select: { numero: true, proyecto: { select: { id: true, nombre: true } } } },
            },
          },
        },
        orderBy: [{ createdAt: 'asc' }],
        take: LIMITE_LISTA,
      }),
      this.prisma.abono.aggregate({ where: donde, _count: { _all: true }, _sum: { valor: true }, _min: { createdAt: true } }),
    ]);

    const diasAlerta = empresa.diasAlertaVerificacion;
    return {
      total: agregado._count._all,
      valorTotal: agregado._sum.valor ?? new Prisma.Decimal(0),
      masAntiguaDias: agregado._min.createdAt ? diasDeEspera(agregado._min.createdAt, hoy) : 0,
      diasAlerta,
      abonos: filas.map((fila) => {
        const dias = diasDeEspera(fila.createdAt, hoy);
        return {
          id: fila.id,
          ventaId: fila.venta.id,
          cliente: fila.venta.cliente,
          lote: fila.venta.lote.numero,
          proyecto: fila.venta.lote.proyecto,
          valor: fila.valor,
          fecha: fila.fecha,
          medioPago: fila.medioPago,
          cuenta: fila.cuentaDestino,
          referencia: fila.referencia,
          recibo: fila.recibo?.numeroTexto ?? null,
          conSoporte: Boolean(fila.comprobanteUrl),
          registradoPor: fila.registradoPor?.nombre ?? null,
          registradoEn: fila.createdAt,
          diasEspera: dias,
          enAlerta: esperaEnAlerta(dias, diasAlerta),
        };
      }),
    };
  }

  // Resumen para el panel (RF-NOT-07 y RF-REP-02): cuántos hay, por cuánto y desde hace cuántos días el más antiguo.
  async resumenPorVerificar(usuario: UsuarioAutenticado, proyectoId?: string) {
    const empresa = await this.configuracion.obtenerEmpresa();
    const agregado = await this.prisma.abono.aggregate({
      where: this.dondePorVerificar(usuario, { proyectoId }),
      _count: { _all: true },
      _sum: { valor: true },
      _min: { createdAt: true },
    });
    const masAntiguaDias = agregado._min.createdAt ? diasDeEspera(agregado._min.createdAt, new Date()) : 0;
    return {
      cantidad: agregado._count._all,
      valor: agregado._sum.valor ?? new Prisma.Decimal(0),
      masAntiguaDias,
      enAlerta: agregado._count._all > 0 && esperaEnAlerta(masAntiguaDias, empresa.diasAlertaVerificacion),
    };
  }

  // Confirma uno o varios abonos en una sola transacción: si alguno no se puede verificar (anulado, ya verificado,
  // no requería verificación o fuera del alcance), no se verifica ninguno y se dice cuál fue el problema.
  async verificar(ids: string[], nota: string | undefined, usuario: UsuarioAutenticado) {
    const unicos = [...new Set(ids)];
    const textoNota = nota?.trim() || null;

    return this.prisma.$transaction(async (tx) => {
      const abonos = await tx.abono.findMany({
        where: { id: { in: unicos }, venta: filtroVenta(usuario) },
        include: { recibo: { select: { numeroTexto: true } }, venta: { select: { cliente: { select: { nombre: true } }, lote: { select: { numero: true } } } } },
      });
      if (abonos.length !== unicos.length) {
        throw new NotFoundException('Alguno de los abonos no existe');
      }

      const etiqueta = (abono: (typeof abonos)[number]) => `${abono.recibo?.numeroTexto ?? abono.id} (${abono.venta.cliente.nombre})`;
      for (const abono of abonos) {
        if (abono.estado === EstadoAbono.ANULADO) throw new ConflictException(`El abono ${etiqueta(abono)} está anulado: no se verifica`);
        if (abono.verificacion === EstadoVerificacion.VERIFICADO) throw new ConflictException(`El abono ${etiqueta(abono)} ya fue verificado`);
        if (abono.verificacion === EstadoVerificacion.NO_REQUIERE) throw new ConflictException(`El abono ${etiqueta(abono)} no requiere verificación`);
      }

      const ahora = new Date();
      for (const abono of abonos) {
        // La condición va en la misma escritura: si otra persona lo verificó o lo anuló un instante antes, no se pisa.
        const resultado = await tx.abono.updateMany({
          where: { id: abono.id, verificacion: EstadoVerificacion.POR_VERIFICAR, estado: EstadoAbono.ACTIVO },
          data: { verificacion: EstadoVerificacion.VERIFICADO, verificadoPorId: usuario.id, verificadoEn: ahora, notaVerificacion: textoNota },
        });
        if (resultado.count === 0) {
          throw new ConflictException(`El abono ${etiqueta(abono)} cambió mientras se verificaba: vuelve a cargar la lista`);
        }
        await registrarAuditoria(tx, {
          usuario,
          accion: 'ABONO_VERIFICAR',
          entidad: 'ABONO',
          entidadId: abono.id,
          resumen: `Verificó contra el extracto el abono de ${formatearCOP(abono.valor)} del lote ${abono.venta.lote.numero} (${abono.venta.cliente.nombre}), recibo ${abono.recibo?.numeroTexto ?? ''}`,
          antes: { verificacion: abono.verificacion },
          despues: { verificacion: EstadoVerificacion.VERIFICADO, nota: textoNota },
        });
      }

      return { verificados: abonos.length, recibos: abonos.map((abono) => abono.recibo?.numeroTexto ?? null) };
    });
  }

  private dondePorVerificar(usuario: UsuarioAutenticado, filtro: Partial<ListarPorVerificarQueryDto>): Prisma.AbonoWhereInput {
    return {
      estado: EstadoAbono.ACTIVO,
      verificacion: EstadoVerificacion.POR_VERIFICAR,
      // El alcance del usuario y, además, el proyecto elegido (las dos condiciones a la vez).
      AND: [{ venta: filtroVenta(usuario) }, ...(filtro.proyectoId ? [{ venta: { lote: { proyectoId: filtro.proyectoId } } }] : [])],
      ...(filtro.cuentaId ? { cuentaDestinoId: filtro.cuentaId } : {}),
      ...(filtro.desde || filtro.hasta
        ? { fecha: { ...(filtro.desde ? { gte: parsearFechaLocal(filtro.desde) } : {}), ...(filtro.hasta ? { lte: parsearFechaLocal(filtro.hasta) } : {}) } }
        : {}),
    };
  }
}
