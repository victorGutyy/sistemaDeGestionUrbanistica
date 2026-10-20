import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { basename } from 'node:path';
import { crearAbonoEnTx, type ContextoRecibo } from '../abonos/crear-abono-tx.js';
import { exigirFechaNoFutura, validarCuentaDestino } from '../abonos/validar-pago.js';
import { registrarAuditoria, soloCampos } from '../auditoria/auditoria.js';
import { exigirProyecto, filtroCliente, filtroVenta } from '../auth/alcance.js';
import { resumirCartera } from '../cartera/cartera-venta.js';
import { datosDeAutorizacion } from '../clientes/autorizacion.js';
import { PERMISOS } from '../auth/permisos.js';
import { anularComisionEnTx } from '../comisiones/comision-tx.js';
import { generarComisionEnTx } from '../comisiones/generar-comision-tx.js';
import { categoriaDevolucionDesistimientoEnTx, crearMovimientoEnTx } from '../finanzas/crear-movimiento-tx.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { parsearFechaLocal } from '../common/fecha.util.js';
import { formatearCOP } from '../common/formato.util.js';
import { CONTENT_TYPE_DOCUMENTO, detectarTipoDocumento, type TipoDocumento } from '../common/tipo-archivo.js';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoAbono, EstadoComision, EstadoLote, EstadoVenta, FormaPago, OrigenMovimiento, TipoMovimiento } from '../generated/prisma/enums.js';
import { aplicarAccionLote } from '../lotes/aplicar-accion.js';
import { puedeAplicar } from '../lotes/estado-lote.js';
import { convertirSeparacionEnTx } from '../lotes/separacion.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { CrearVentaDto } from './dto/crear-venta.dto.js';
import { DesistirVentaDto } from './dto/desistir-venta.dto.js';
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
    private readonly storage: StorageService,
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

    let cuentaDestinoId: string | null = null;
    let contextoRecibo: ContextoRecibo | null = null;
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
      cuentaDestinoId = await validarCuentaDestino(this.prisma, dto.medioPago, dto.cuentaDestinoId);
      contextoRecibo = await this.construirContextoRecibo(usuario);
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
        const { autorizaDatos, ...datosCliente } = dto.clienteNuevo;
        const clienteCreado = await tx.cliente.create({ data: { ...datosCliente, ...(autorizaDatos ? datosDeAutorizacion(true, usuario) : {}) } });
        clienteId = clienteCreado.id;
        await registrarAuditoria(tx, {
          usuario,
          accion: 'CLIENTE_CREAR',
          entidad: 'CLIENTE',
          entidadId: clienteCreado.id,
          resumen: `Creó el cliente ${clienteCreado.nombre} (documento ${clienteCreado.documento}) junto con su venta`,
          despues: soloCampos(clienteCreado, ['nombre', 'documento', 'tipoDocumento', 'telefono', 'email', 'direccion', 'autorizaDatos']),
        });
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
          await aplicarAccionLote(tx, lote, 'SEPARAR', usuario, {
            motivo: 'Venta con excepción pendiente de aprobación',
            ventaId: venta.id,
          });
          await tx.venta.update({ where: { id: venta.id }, data: { separoElLote: true } });
        }
      } else {
        const cuotaInicialId = await this.crearPlanDeCuotas(tx, venta);
        // El cambio de estado pasa por la máquina de estados: valida, deja historial y evita vender dos veces el mismo lote.
        await aplicarAccionLote(tx, lote, 'VENDER', usuario, { ventaId: venta.id });
        await convertirSeparacionEnTx(tx, lote.id, venta.id);
        // RF-COM-01: la venta ya es ACTIVA, así que su comisión nace en esta misma transacción.
        await generarComisionEnTx(tx, { id: venta.id, vendedorId: venta.vendedorId, numeroLote: lote.numero }, usuario);

        if (dto.cuotaInicialRecibida && cuotaInicialId && contextoRecibo) {
          await crearAbonoEnTx(
            tx,
            {
              ventaId: venta.id,
              soloCuotaId: cuotaInicialId,
              fecha: fechaVenta,
              valor: cuotaInicial,
              medioPago: dto.medioPago!,
              cuentaDestinoId,
              referencia: dto.referencia,
              registradoPorId: usuario.id,
            },
            contextoRecibo,
          );
        }
      }

      await registrarAuditoria(tx, {
        usuario,
        accion: 'VENTA_CREAR',
        entidad: 'VENTA',
        entidadId: venta.id,
        resumen: `Registró la venta del lote ${lote.numero} por ${formatearCOP(valorTotal)}${pendiente ? ' (pendiente de aprobación del gerente)' : ''}`,
        despues: {
          ...soloCampos(venta, ['estado', 'loteId', 'clienteId', 'vendedorId', 'formaPago', 'valorTotal', 'cuotaInicial', 'numeroCuotas', 'tasaInteres', 'fechaVenta', 'esExcepcion', 'motivoExcepcion']),
          cuotaInicialRecibida: Boolean(dto.cuotaInicialRecibida && !pendiente),
        },
      });

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
      await aplicarAccionLote(tx, venta.lote, 'VENDER', usuario, { ventaId: id, motivo: 'Excepción aprobada' });
      await convertirSeparacionEnTx(tx, venta.lote.id, id);
      // RF-COM-01: la comisión de una excepción nace cuando el gerente la aprueba (si se rechaza, no hay comisión).
      await generarComisionEnTx(tx, { id, vendedorId: venta.vendedorId, numeroLote: venta.lote.numero }, usuario);

      await registrarAuditoria(tx, {
        usuario,
        accion: 'VENTA_APROBAR',
        entidad: 'VENTA',
        entidadId: id,
        resumen: `Aprobó la venta con excepción del lote ${venta.lote.numero} por ${formatearCOP(venta.valorTotal)}`,
        antes: { estado: EstadoVenta.PENDIENTE_APROBACION },
        despues: { estado: EstadoVenta.ACTIVA, motivoExcepcion: venta.motivoExcepcion },
      });

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
        await aplicarAccionLote(tx, venta.lote, 'LIBERAR', usuario, { ventaId: id, motivo: 'Excepción rechazada' });
      }

      await registrarAuditoria(tx, {
        usuario,
        accion: 'VENTA_RECHAZAR',
        entidad: 'VENTA',
        entidadId: id,
        resumen: `Rechazó la venta con excepción del lote ${venta.lote.numero}: ${motivo.trim()}`,
        antes: { estado: EstadoVenta.PENDIENTE_APROBACION },
        despues: { estado: EstadoVenta.RECHAZADA, motivoRechazo: motivo.trim() },
      });

      return tx.venta.findUniqueOrThrow({ where: { id }, include: { cliente: true, lote: true, vendedor: true } });
    });
  }

  async buscarPorId(id: string, usuario: UsuarioAutenticado) {
    const venta = await this.prisma.venta.findFirst({
      where: { id, ...filtroVenta(usuario) },
      include: {
        cuotas: {
          orderBy: { numero: 'asc' },
          include: { aplicaciones: { where: { abono: { estado: EstadoAbono.ACTIVO } }, select: { valor: true } } },
        },
        abonos: {
          orderBy: [{ fecha: 'asc' }, { createdAt: 'asc' }],
          include: {
            recibo: { select: { id: true, numeroTexto: true, esHistorico: true } },
            cuentaDestino: { select: { id: true, banco: true, alias: true } },
            registradoPor: { select: { nombre: true } },
            anuladoPor: { select: { nombre: true } },
          },
        },
        cliente: true,
        lote: { include: { proyecto: true, manzana: true } },
        vendedor: true,
        registradaPor: { select: { nombre: true } },
        resueltaPor: { select: { nombre: true } },
        documentos: { orderBy: { createdAt: 'asc' }, include: { subidoPor: { select: { nombre: true } } } },
        desistimiento: { include: { registradoPor: { select: { nombre: true } } } },
        // La comisión solo la ve quien tiene permiso para consultarlas (Consulta no).
        comision: usuario.permisos.includes(PERMISOS.COMISIONES_VER)
          ? { select: { id: true, estado: true, valor: true, tipoVendedor: true, motivoAnulacion: true } }
          : false,
      },
    });
    if (!venta) {
      throw new NotFoundException(`No existe la venta ${id}`);
    }

    // Lo pagado sale solo de abonos ACTIVOS; los anulados se muestran en el historial pero no cuentan.
    const abonosActivos = venta.abonos.filter((abono) => abono.estado === EstadoAbono.ACTIVO);
    // Cuotas vencidas, saldo vencido, interés de mora y semáforo de esta venta (RF-CAR-03): los mismos números de la cartera.
    const empresa = await this.configuracion.obtenerEmpresa();
    const cartera =
      venta.estado === EstadoVenta.ACTIVA
        ? resumirCartera(venta.cuotas, new Date(), { tasaMoraMensual: empresa.tasaMoraMensual, diasGracia: empresa.diasGraciaMora }, empresa.diasSemaforoAmarillo)
        : null;
    return {
      ...venta,
      cuotas: venta.cuotas.map(({ aplicaciones, ...cuota }) => ({
        ...cuota,
        pagado: aplicaciones.reduce((total, aplicacion) => total.plus(aplicacion.valor), new Prisma.Decimal(0)),
      })),
      estadoCuenta: {
        ...calcularEstadoCuenta({ valorTotal: venta.valorTotal, cuotas: venta.cuotas, abonos: abonosActivos }),
        cartera: cartera && {
          semaforo: cartera.semaforo,
          cuotasVencidas: cartera.cuotasVencidas,
          saldoVencido: cartera.saldoVencido,
          interesMora: cartera.interesMora,
          saldoPorVencer: cartera.saldoPorVencer,
          moraConfigurada: empresa.tasaMoraMensual !== null,
        },
      },
    };
  }

  listar(usuario: UsuarioAutenticado, estado?: EstadoVenta) {
    return this.prisma.venta.findMany({
      where: { ...filtroVenta(usuario), estado },
      include: { cliente: true, lote: { include: { proyecto: true, manzana: true } }, vendedor: true },
      orderBy: { fechaVenta: 'desc' },
    });
  }

  // Desistimiento (RF-VEN-08): decisión del gerente. La venta queda DESISTIDA y el lote DESISTIDO; no se
  // borra ningún abono ni recibo, y los valores a devolver o retener son datos que se registran a mano.
  async desistir(id: string, dto: DesistirVentaDto, usuario: UsuarioAutenticado) {
    const fecha = parsearFechaLocal(dto.fecha);

    // La devolución es un egreso real: necesita medio y cuenta de salida, que se validan antes de abrir la transacción.
    const valorADevolver = dto.valorDevolver ? new Prisma.Decimal(dto.valorDevolver) : null;
    let cuentaDevolucionId: string | null = null;
    if (valorADevolver?.greaterThan(0)) {
      if (!dto.medioPagoDevolucion) {
        throw new BadRequestException('Indica con qué medio de pago se devuelve el dinero');
      }
      exigirFechaNoFutura(fecha);
      await this.configuracion.exigirMedioPagoActivo(dto.medioPagoDevolucion);
      cuentaDevolucionId = await validarCuentaDestino(this.prisma, dto.medioPagoDevolucion, dto.cuentaDevolucionId, 'de donde sale el dinero');
    }

    return this.prisma.$transaction(async (tx) => {
      const venta = await tx.venta.findFirst({
        where: { id, ...filtroVenta(usuario) },
        include: { lote: true, cliente: true, abonos: { where: { estado: EstadoAbono.ACTIVO } } },
      });
      if (!venta) {
        throw new NotFoundException(`No existe la venta ${id}`);
      }
      if (venta.estado !== EstadoVenta.ACTIVA) {
        throw new ConflictException('Solo se puede registrar el desistimiento de una venta activa');
      }

      const pagado = venta.abonos.reduce((total, abono) => total.plus(abono.valor), new Prisma.Decimal(0));
      const valorDevolver = dto.valorDevolver ? new Prisma.Decimal(dto.valorDevolver) : null;
      const valorRetener = dto.valorRetener ? new Prisma.Decimal(dto.valorRetener) : null;
      if (valorDevolver?.greaterThan(pagado) || valorRetener?.greaterThan(pagado)) {
        throw new BadRequestException(`El valor a devolver o retener no puede superar lo pagado por el cliente (${pagado.toString()})`);
      }
      if (valorDevolver && valorRetener && valorDevolver.plus(valorRetener).greaterThan(pagado)) {
        throw new BadRequestException(`Lo que se devuelve más lo que se retiene supera lo pagado por el cliente (${pagado.toString()})`);
      }

      // RF-COM-04: si la comisión sigue pendiente, el gerente decide en este mismo acto si se anula; si ya se pagó, solo se avisa.
      const comision = await tx.comision.findUnique({ where: { ventaId: id }, select: { id: true, estado: true } });
      if (dto.anularComision && comision?.estado !== EstadoComision.PENDIENTE) {
        throw new BadRequestException('La comisión de esta venta no está pendiente: no hay nada que anular junto con el desistimiento');
      }

      const { count } = await tx.venta.updateMany({
        where: { id, estado: EstadoVenta.ACTIVA },
        data: { estado: EstadoVenta.DESISTIDA },
      });
      if (count === 0) {
        throw new ConflictException('Otra persona ya cambió el estado de esta venta');
      }

      // El lote pasa a DESISTIDO (solo desde VENDIDO: un lote ya escriturado no admite desistimiento).
      await aplicarAccionLote(tx, venta.lote, 'DESISTIR', usuario, { ventaId: id, motivo: dto.motivo.trim() });

      await tx.desistimiento.create({
        data: {
          ventaId: id,
          fecha,
          motivo: dto.motivo.trim(),
          valorDevolver,
          valorRetener,
          registradoPorId: usuario.id,
        },
      });

      // La devolución queda como egreso del proyecto, en la misma transacción: si algo falla, no se guarda nada.
      if (valorADevolver?.greaterThan(0) && dto.medioPagoDevolucion) {
        const categoria = await categoriaDevolucionDesistimientoEnTx(tx);
        await crearMovimientoEnTx(tx, {
          tipo: TipoMovimiento.GASTO,
          fecha,
          valor: valorADevolver,
          descripcion: `Devolución por desistimiento · Lote ${venta.lote.numero} · ${venta.cliente.nombre}`,
          proyectoId: venta.lote.proyectoId,
          categoriaId: categoria.id,
          medioPago: dto.medioPagoDevolucion,
          cuentaId: cuentaDevolucionId,
          referencia: dto.referenciaDevolucion,
          terceroNombre: venta.cliente.nombre,
          terceroDocumento: venta.cliente.documento,
          motivoSinSoporte: 'Devolución registrada junto con el desistimiento de la venta',
          origen: OrigenMovimiento.DEVOLUCION_DESISTIMIENTO,
          ventaId: id,
          usuario,
        });
      }

      if (dto.anularComision && comision) {
        await anularComisionEnTx(tx, comision.id, `Desistimiento de la venta: ${dto.motivo.trim()}`, usuario);
      }

      await registrarAuditoria(tx, {
        usuario,
        accion: 'VENTA_DESISTIR',
        entidad: 'VENTA',
        entidadId: id,
        resumen: `Registró el desistimiento de la venta del lote ${venta.lote.numero} (${venta.cliente.nombre}): ${dto.motivo.trim()}`,
        antes: { estado: EstadoVenta.ACTIVA, pagado },
        despues: { estado: EstadoVenta.DESISTIDA, fecha, motivo: dto.motivo.trim(), valorDevolver, valorRetener, medioPagoDevolucion: dto.medioPagoDevolucion },
      });

      return tx.venta.findUniqueOrThrow({ where: { id }, include: { cliente: true, lote: true, desistimiento: true, comision: true } });
    });
  }

  // Documentos firmados de la venta (RF-VEN-06): PDF o imágenes. Se valida el tipo real por los primeros bytes
  // y se valida todo antes de guardar, para no dejar la carga a medias.
  async subirDocumentos(
    ventaId: string,
    archivos: Express.Multer.File[] | undefined,
    descripcion: string | undefined,
    usuario: UsuarioAutenticado,
  ) {
    const venta = await this.prisma.venta.findFirst({ where: { id: ventaId, ...filtroVenta(usuario) }, select: { id: true } });
    if (!venta) {
      throw new NotFoundException(`No existe la venta ${ventaId}`);
    }
    if (!archivos || archivos.length === 0) {
      throw new BadRequestException('Adjunta al menos un archivo');
    }
    if (descripcion && descripcion.length > 300) {
      throw new BadRequestException('La descripción es demasiado larga (máximo 300 caracteres)');
    }

    const validados = archivos.map((archivo) => {
      const tipo = detectarTipoDocumento(archivo.buffer);
      if (!tipo) {
        throw new BadRequestException(`El archivo "${archivo.originalname}" no es un PDF ni una imagen PNG o JPG`);
      }
      return { archivo, tipo };
    });

    // Primero se guardan los archivos; luego los registros y su auditoría se crean juntos (todo o nada).
    const guardados: { archivo: Express.Multer.File; tipo: TipoDocumento; rutaRelativa: string }[] = [];
    for (const { archivo, tipo } of validados) {
      // El nombre en disco lo fija el servidor según el tipo real; el original solo se muestra.
      const { rutaRelativa } = await this.storage.guardar(`ventas/${ventaId}`, `documento.${tipo}`, archivo.buffer);
      guardados.push({ archivo, tipo, rutaRelativa });
    }

    const creados = await this.prisma.$transaction(async (tx) => {
      const filas = [];
      for (const { archivo, tipo, rutaRelativa } of guardados) {
        filas.push(
          await tx.documentoVenta.create({
            data: {
              ventaId,
              nombreOriginal: basename(archivo.originalname).slice(0, 200),
              ruta: rutaRelativa,
              tipoMime: CONTENT_TYPE_DOCUMENTO[tipo],
              tamano: archivo.buffer.length,
              descripcion: descripcion?.trim() || null,
              subidoPorId: usuario.id,
            },
          }),
        );
      }
      await registrarAuditoria(tx, {
        usuario,
        accion: 'VENTA_DOCUMENTO_SUBIR',
        entidad: 'VENTA',
        entidadId: ventaId,
        resumen: `Adjuntó ${filas.length} documento${filas.length === 1 ? '' : 's'} firmado${filas.length === 1 ? '' : 's'} a la venta`,
        despues: { documentos: filas.map((fila) => ({ id: fila.id, nombre: fila.nombreOriginal, tipo: fila.tipoMime, tamano: fila.tamano, descripcion: fila.descripcion })) },
      });
      return filas;
    });
    return creados;
  }

  // Solo con sesión y permiso sobre el proyecto de la venta (RNF-SEG-05).
  async leerDocumento(ventaId: string, documentoId: string, usuario: UsuarioAutenticado) {
    const documento = await this.prisma.documentoVenta.findFirst({
      where: { id: documentoId, ventaId, venta: filtroVenta(usuario) },
    });
    if (!documento) {
      throw new NotFoundException(`No existe el documento ${documentoId}`);
    }
    const buffer = await this.storage.leer(documento.ruta);
    return { buffer, contentType: documento.tipoMime, nombre: documento.nombreOriginal };
  }

  // Datos de la empresa y de quien recibe, con los que se emite el recibo de la cuota inicial.
  private async construirContextoRecibo(usuario: UsuarioAutenticado): Promise<ContextoRecibo> {
    return this.configuracion.contextoRecibo(usuario);
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
