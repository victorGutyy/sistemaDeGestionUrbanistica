import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { crearAbonoEnTx } from '../abonos/crear-abono-tx.js';
import { exigirProyecto, filtroCliente, filtroVenta } from '../auth/alcance.js';
import { PERMISOS } from '../auth/permisos.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { parsearFechaLocal } from '../common/fecha.util.js';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoLote, EstadoVenta, FormaPago } from '../generated/prisma/enums.js';
import { aplicarAccionLote } from '../lotes/aplicar-accion.js';
import { puedeAplicar } from '../lotes/estado-lote.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CrearVentaDto } from './dto/crear-venta.dto.js';
import { calcularEstadoCuenta } from './estado-cuenta.js';
import { generarPlanDePagos } from './plan-de-pagos.js';
import { calcularCuotaInicial, evaluarExcepcion, type ParametrosVenta } from './reglas-venta.js';

const ESTADOS_VIGENTES = [EstadoVenta.PENDIENTE_APROBACION, EstadoVenta.ACTIVA];

interface DatosParaCuotas {
  id: string;
  valorTotal: Prisma.Decimal;
  cuotaInicial: Prisma.Decimal;
  numeroCuotas: number | null;
  tasaInteres: Prisma.Decimal | null;
  formaPago: FormaPago;
  fechaVenta: Date;
  fechaCuotaInicial: Date | null;
}

@Injectable()
export class VentasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configuracion: ConfiguracionService,
  ) {}

  // Lo que necesita la pantalla de venta nueva: los valores por defecto del negocio y si quien
  // registra puede autorizar excepciones por sí mismo.
  async parametros(usuario: UsuarioAutenticado) {
    const parametros = await this.leerParametros();
    return {
      porcentajeCuotaInicial: parametros.porcentajeCuotaInicial.toString(),
      plazoMaximoMeses: parametros.plazoMaximoMeses,
      tasaFinanciacionMensual: parametros.tasaFinanciacionMensual.toString(),
      puedeAutorizar: usuario.permisos.includes(PERMISOS.VENTAS_AUTORIZAR),
    };
  }

  async crear(dto: CrearVentaDto, usuario: UsuarioAutenticado) {
    if (!dto.clienteId && !dto.clienteNuevo) {
      throw new BadRequestException('Debes enviar clienteId o clienteNuevo');
    }
    if (dto.clienteId && dto.clienteNuevo) {
      throw new BadRequestException('Envía solo uno de los dos: clienteId o clienteNuevo, no ambos');
    }
    if (dto.vendedorId && dto.vendedorNuevo) {
      throw new BadRequestException('Envía solo uno de los dos: vendedorId o vendedorNuevo, no ambos');
    }

    const parametros = await this.leerParametros();
    const valorTotal = new Prisma.Decimal(dto.valorTotal);
    if (valorTotal.lessThanOrEqualTo(0)) {
      throw new BadRequestException('El valor total debe ser mayor a cero');
    }
    if (dto.formaPago === FormaPago.FINANCIADO && !dto.numeroCuotas) {
      throw new BadRequestException('Una venta financiada necesita numeroCuotas');
    }

    const cuotaInicial = calcularCuotaInicial(
      {
        formaPago: dto.formaPago,
        valorTotal,
        cuotaInicial: dto.cuotaInicial ? new Prisma.Decimal(dto.cuotaInicial) : undefined,
        cuotaInicialPorcentaje: dto.cuotaInicialPorcentaje ? new Prisma.Decimal(dto.cuotaInicialPorcentaje) : undefined,
      },
      parametros,
    );
    if (cuotaInicial.greaterThan(valorTotal)) {
      throw new BadRequestException('La cuota inicial no puede ser mayor al valor total');
    }
    if (dto.formaPago === FormaPago.FINANCIADO && cuotaInicial.equals(valorTotal)) {
      throw new BadRequestException('La cuota inicial cubre todo el valor: registra la venta como de contado');
    }

    // RF-VEN-05: cuota inicial baja o plazo largo = excepción, con motivo y autorización del gerente.
    const numeroCuotas = dto.formaPago === FormaPago.FINANCIADO ? (dto.numeroCuotas ?? null) : null;
    const evaluacion = evaluarExcepcion({ formaPago: dto.formaPago, valorTotal, cuotaInicial, numeroCuotas }, parametros);
    const motivoExcepcion = dto.motivoExcepcion?.trim();
    if (evaluacion.esExcepcion && !motivoExcepcion) {
      throw new BadRequestException({
        message: `Esta venta es una excepción y necesita un motivo. ${evaluacion.razones.join(' ')}`,
        codigo: 'EXCEPCION_REQUIERE_MOTIVO',
        razones: evaluacion.razones,
      });
    }
    // Quien no puede autorizar deja la venta pendiente de aprobación del gerente.
    const puedeAutorizar = usuario.permisos.includes(PERMISOS.VENTAS_AUTORIZAR);
    const pendiente = evaluacion.esExcepcion && !puedeAutorizar;

    if (dto.cuotaInicialRecibida) {
      if (pendiente) {
        throw new BadRequestException(
          'Una venta con excepción pendiente de aprobación no puede registrar el pago de la cuota inicial todavía: se registra después de aprobada',
        );
      }
      if (!dto.medioPago) {
        throw new BadRequestException('Indica el medio de pago con el que se recibió la cuota inicial');
      }
      if (cuotaInicial.lessThanOrEqualTo(0)) {
        throw new BadRequestException('No hay cuota inicial por recibir');
      }
      await this.configuracion.exigirMedioPagoActivo(dto.medioPago);
    }

    const fechaVenta = dto.fechaVenta ? parsearFechaLocal(dto.fechaVenta) : new Date();
    const fechaCuotaInicial = dto.fechaLimiteCuotaInicial ? parsearFechaLocal(dto.fechaLimiteCuotaInicial) : fechaVenta;
    const tasaInteres =
      dto.formaPago === FormaPago.FINANCIADO && parametros.tasaFinanciacionMensual.greaterThan(0)
        ? parametros.tasaFinanciacionMensual
        : null;

    return this.prisma.$transaction(async (tx) => {
      const lote = await tx.lote.findUnique({ where: { id: dto.loteId } });
      if (!lote) {
        throw new NotFoundException(`No existe el lote ${dto.loteId}`);
      }
      exigirProyecto(usuario, lote.proyectoId, `No existe el lote ${dto.loteId}`);

      // Se puede vender un lote disponible o separado; cualquier otro estado lo impide.
      if (!puedeAplicar(lote.estado, 'VENDER')) {
        throw new ConflictException(`El lote ${lote.numero} no está disponible (estado: ${lote.estado})`);
      }
      const ventaVigente = await tx.venta.findFirst({ where: { loteId: dto.loteId, estado: { in: ESTADOS_VIGENTES } } });
      if (ventaVigente) {
        throw new ConflictException(`El lote ${lote.numero} ya tiene una venta en curso`);
      }

      let clienteId = dto.clienteId;
      if (dto.clienteNuevo) {
        const clienteExistente = await tx.cliente.findUnique({ where: { documento: dto.clienteNuevo.documento } });
        if (clienteExistente) {
          throw new ConflictException(`Ya existe un cliente con el documento ${dto.clienteNuevo.documento}`);
        }
        const clienteCreado = await tx.cliente.create({ data: dto.clienteNuevo });
        clienteId = clienteCreado.id;
      } else if (clienteId) {
        // Con alcance restringido solo se pueden usar clientes que ya tienen ventas en sus proyectos.
        const cliente = await tx.cliente.findFirst({ where: { id: clienteId, ...filtroCliente(usuario) } });
        if (!cliente) {
          throw new NotFoundException(`No existe el cliente ${clienteId}`);
        }
      }

      const vendedorId = await this.resolverVendedor(tx, dto);

      const venta = await tx.venta.create({
        data: {
          loteId: dto.loteId,
          clienteId: clienteId!,
          vendedorId,
          valorTotal,
          cuotaInicial,
          numeroCuotas,
          tasaInteres,
          formaPago: dto.formaPago,
          fechaVenta,
          fechaCuotaInicial,
          estado: pendiente ? EstadoVenta.PENDIENTE_APROBACION : EstadoVenta.ACTIVA,
          registradaPorId: usuario.id,
          esExcepcion: evaluacion.esExcepcion,
          motivoExcepcion: evaluacion.esExcepcion ? motivoExcepcion : null,
          // Si quien registra puede autorizar, la excepción queda autorizada por él mismo y así consta.
          resueltaPorId: evaluacion.esExcepcion && !pendiente ? usuario.id : null,
          resueltaEn: evaluacion.esExcepcion && !pendiente ? new Date() : null,
        },
      });

      if (pendiente) {
        // El lote queda separado mientras el gerente decide, para que nadie más lo tome.
        if (lote.estado === EstadoLote.DISPONIBLE) {
          await aplicarAccionLote(tx, lote, 'SEPARAR', usuario.id, {
            motivo: 'Venta con excepción pendiente de aprobación',
            ventaId: venta.id,
          });
          await tx.venta.update({ where: { id: venta.id }, data: { separoElLote: true } });
        }
      } else {
        const cuotaInicialId = await this.crearPlanDeCuotas(tx, venta);
        // El cambio de estado pasa por la máquina de estados: valida, deja historial y evita vender dos veces el mismo lote.
        await aplicarAccionLote(tx, lote, 'VENDER', usuario.id, { ventaId: venta.id });

        if (dto.cuotaInicialRecibida && cuotaInicialId) {
          await crearAbonoEnTx(tx, {
            ventaId: venta.id,
            cuotaId: cuotaInicialId,
            fecha: fechaVenta,
            valor: cuotaInicial,
            medioPago: dto.medioPago!,
          });
        }
      }

      return tx.venta.findUniqueOrThrow({
        where: { id: venta.id },
        include: { cuotas: { orderBy: { numero: 'asc' } }, cliente: true, lote: true, vendedor: true },
      });
    });
  }

  // El gerente aprueba una excepción: la venta pasa a ACTIVA, se genera su plan de cuotas y el lote queda vendido.
  async aprobar(id: string, usuario: UsuarioAutenticado) {
    return this.prisma.$transaction(async (tx) => {
      const venta = await this.obtenerPendiente(tx, id, usuario);

      const { count } = await tx.venta.updateMany({
        where: { id, estado: EstadoVenta.PENDIENTE_APROBACION },
        data: { estado: EstadoVenta.ACTIVA, resueltaPorId: usuario.id, resueltaEn: new Date() },
      });
      if (count === 0) {
        throw new ConflictException('Otra persona ya resolvió esta venta');
      }

      await this.crearPlanDeCuotas(tx, venta);
      await aplicarAccionLote(tx, venta.lote, 'VENDER', usuario.id, { ventaId: id, motivo: 'Excepción aprobada' });

      return tx.venta.findUniqueOrThrow({
        where: { id },
        include: { cuotas: { orderBy: { numero: 'asc' } }, cliente: true, lote: true, vendedor: true },
      });
    });
  }

  // El gerente rechaza la excepción: la venta queda RECHAZADA (no se borra) y el lote se libera si esta venta lo había separado.
  async rechazar(id: string, motivo: string, usuario: UsuarioAutenticado) {
    return this.prisma.$transaction(async (tx) => {
      const venta = await this.obtenerPendiente(tx, id, usuario);

      const { count } = await tx.venta.updateMany({
        where: { id, estado: EstadoVenta.PENDIENTE_APROBACION },
        data: { estado: EstadoVenta.RECHAZADA, resueltaPorId: usuario.id, resueltaEn: new Date(), motivoRechazo: motivo.trim() },
      });
      if (count === 0) {
        throw new ConflictException('Otra persona ya resolvió esta venta');
      }

      if (venta.separoElLote && venta.lote.estado === EstadoLote.SEPARADO) {
        await aplicarAccionLote(tx, venta.lote, 'LIBERAR', usuario.id, { ventaId: id, motivo: 'Excepción rechazada' });
      }

      return tx.venta.findUniqueOrThrow({ where: { id }, include: { cliente: true, lote: true, vendedor: true } });
    });
  }

  async buscarPorId(id: string, usuario: UsuarioAutenticado) {
    const venta = await this.prisma.venta.findFirst({
      where: { id, ...filtroVenta(usuario) },
      include: {
        cuotas: { orderBy: { numero: 'asc' } },
        abonos: { orderBy: { fecha: 'asc' } },
        cliente: true,
        lote: { include: { proyecto: true, manzana: true } },
        vendedor: true,
        registradaPor: { select: { nombre: true } },
        resueltaPor: { select: { nombre: true } },
      },
    });
    if (!venta) {
      throw new NotFoundException(`No existe la venta ${id}`);
    }

    return {
      ...venta,
      estadoCuenta: calcularEstadoCuenta(venta),
    };
  }

  listar(usuario: UsuarioAutenticado, estado?: EstadoVenta) {
    return this.prisma.venta.findMany({
      where: { ...filtroVenta(usuario), estado },
      include: { cliente: true, lote: { include: { proyecto: true, manzana: true } }, vendedor: true },
      orderBy: { fechaVenta: 'desc' },
    });
  }

  listarVendedores() {
    return this.prisma.vendedor.findMany({ orderBy: { nombre: 'asc' } });
  }

  // La tasa de financiación, el porcentaje de cuota inicial y el plazo máximo los define el gerente en Configuración.
  private async leerParametros(): Promise<ParametrosVenta> {
    const empresa = await this.configuracion.obtenerEmpresa();
    return {
      porcentajeCuotaInicial: new Prisma.Decimal(empresa.porcentajeCuotaInicial),
      plazoMaximoMeses: empresa.plazoMaximoMeses,
      tasaFinanciacionMensual: new Prisma.Decimal(empresa.tasaFinanciacionMensual),
    };
  }

  private async resolverVendedor(tx: Prisma.TransactionClient, dto: CrearVentaDto): Promise<string | null> {
    if (dto.vendedorId) {
      const vendedor = await tx.vendedor.findUnique({ where: { id: dto.vendedorId } });
      if (!vendedor) {
        throw new NotFoundException(`No existe el vendedor ${dto.vendedorId}`);
      }
      return vendedor.id;
    }
    if (dto.vendedorNuevo) {
      // El documento identifica a la persona: si ya existe se reutiliza, no se duplica.
      const existente = await tx.vendedor.findUnique({ where: { documento: dto.vendedorNuevo.documento } });
      if (existente) return existente.id;
      const creado = await tx.vendedor.create({ data: dto.vendedorNuevo });
      return creado.id;
    }
    return null;
  }

  private async obtenerPendiente(tx: Prisma.TransactionClient, id: string, usuario: UsuarioAutenticado) {
    const venta = await tx.venta.findFirst({ where: { id, ...filtroVenta(usuario) }, include: { lote: true } });
    if (!venta) {
      throw new NotFoundException(`No existe la venta ${id}`);
    }
    if (venta.estado !== EstadoVenta.PENDIENTE_APROBACION) {
      throw new ConflictException('Esta venta no está pendiente de aprobación');
    }
    return venta;
  }

  // Crea la cuota 0 (cuota inicial) y las cuotas del plan. Devuelve el id de la cuota 0, o null si no hay cuota inicial.
  private async crearPlanDeCuotas(tx: Prisma.TransactionClient, venta: DatosParaCuotas): Promise<string | null> {
    let cuotaInicialId: string | null = null;

    if (venta.cuotaInicial.greaterThan(0)) {
      const cuotaCero = await tx.cuota.create({
        data: {
          ventaId: venta.id,
          numero: 0,
          fechaVencimiento: venta.fechaCuotaInicial ?? venta.fechaVenta,
          valor: venta.cuotaInicial,
        },
      });
      cuotaInicialId = cuotaCero.id;
    }

    if (venta.formaPago === FormaPago.FINANCIADO && venta.numeroCuotas) {
      const plan = generarPlanDePagos({
        valorTotal: venta.valorTotal,
        cuotaInicial: venta.cuotaInicial,
        numeroCuotas: venta.numeroCuotas,
        tasaInteres: venta.tasaInteres,
        fechaVenta: venta.fechaVenta,
      });

      await tx.cuota.createMany({
        data: plan.map((cuota) => ({
          ventaId: venta.id,
          numero: cuota.numero,
          fechaVencimiento: cuota.fechaVencimiento,
          valor: cuota.valor,
        })),
      });
    }

    return cuotaInicialId;
  }
}
