import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { registrarAuditoria } from '../auditoria/auditoria.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { formatearCOP } from '../common/formato.util.js';
import { parsearFechaLocal } from '../common/fecha.util.js';
import { detectarTipoDocumento } from '../common/tipo-archivo.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { formatearNumeroRecibo, siguienteConsecutivo, PREFIJO_CIERRE_CAJA, SERIE_CIERRE_CAJA } from '../consecutivos/consecutivo.js';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoAbono, EstadoCierre, EstadoMovimiento, TipoCierre } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { calcularCierre, type DatosCierre, type ResultadoCierre } from './calcular-cierre.js';
import { AprobarCierreDto, DevolverCierreDto } from './dto/resolver-cierre.dto.js';
import { CerrarCierreDto } from './dto/cerrar-cierre.dto.js';
import { CrearCierreDto } from './dto/crear-cierre.dto.js';
import { bloquearRegistrosParaCierreEnTx } from './fecha-abierta.js';
import { generarPdfCierre } from './generar-pdf-cierre.js';
import { diaDeColumnaDate, esFechaISOValida, finDelPeriodo, formatearDiaDDMMAAAA, hoyISO, sumarDias } from './periodo.js';

const INCLUIR_USUARIOS = {
  creadoPor: { select: { nombre: true } },
  cerradoPor: { select: { nombre: true } },
  resueltoPor: { select: { nombre: true } },
} satisfies Prisma.CierreCajaInclude;

type CierreConUsuarios = Prisma.CierreCajaGetPayload<{ include: typeof INCLUIR_USUARIOS }>;

// El cierre tal como lo ve la API: fechas como "YYYY-MM-DD" y sin la fotografía (que se entrega aparte).
function presentar(cierre: CierreConUsuarios) {
  const { contenido: _contenido, desde, hasta, ...resto } = cierre;
  return { ...resto, desde: diaDeColumnaDate(desde), hasta: diaDeColumnaDate(hasta) };
}

type ClienteBd = Prisma.TransactionClient;

@Injectable()
export class CierresCajaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configuracion: ConfiguracionService,
    private readonly storage: StorageService,
  ) {}

  // ---------- Consulta ----------

  async listar() {
    const cierres = await this.prisma.cierreCaja.findMany({ include: INCLUIR_USUARIOS, orderBy: { desde: 'desc' } });
    return cierres.map(presentar);
  }

  // Detalle: un borrador (o devuelto) se calcula en vivo con lo que hay hoy en la base; uno cerrado o aprobado
  // muestra la fotografía que se congeló al cerrar.
  async obtener(id: string) {
    const cierre = await this.prisma.cierreCaja.findUnique({
      where: { id },
      include: { ...INCLUIR_USUARIOS, historial: { include: { usuario: { select: { nombre: true } } }, orderBy: { createdAt: 'asc' } } },
    });
    if (!cierre) {
      throw new NotFoundException(`No existe el cierre de caja ${id}`);
    }

    const enVivo = cierre.estado === EstadoCierre.BORRADOR || cierre.estado === EstadoCierre.DEVUELTO;
    const resumen = enVivo
      ? await this.calcular(this.prisma, diaDeColumnaDate(cierre.desde), diaDeColumnaDate(cierre.hasta), cierre.efectivoInicial)
      : (cierre.contenido as unknown as ResultadoCierre);

    const { historial, ...base } = cierre;
    return {
      ...presentar(base),
      enVivo,
      resumen,
      historial: historial.map((paso) => ({
        estadoAnterior: paso.estadoAnterior,
        estadoNuevo: paso.estadoNuevo,
        usuario: paso.usuario.nombre,
        observacion: paso.observacion,
        fecha: paso.createdAt,
      })),
    };
  }

  // PDF del cierre (RF-CAJ-06). Un cierre cerrado o aprobado se dibuja desde su fotografía; un borrador o un devuelto,
  // desde el cálculo en vivo, y el documento lo dice para que nadie lo tome por definitivo.
  async obtenerPdf(id: string) {
    const cierre = await this.obtener(id);
    const empresa = await this.configuracion.obtenerEmpresa();

    // El logo se lee del almacenamiento; pdfkit solo dibuja PNG y JPG (un WebP se omite sin impedir el PDF).
    let logo: Buffer | undefined;
    if (empresa.logoRuta) {
      try {
        const buffer = await this.storage.leer(empresa.logoRuta);
        const tipo = detectarTipoDocumento(buffer);
        logo = tipo === 'png' || tipo === 'jpg' ? buffer : undefined;
      } catch {
        logo = undefined;
      }
    }

    const buffer = await generarPdfCierre(
      {
        numeroTexto: cierre.numeroTexto,
        tipo: cierre.tipo,
        desde: cierre.desde,
        hasta: cierre.hasta,
        estado: cierre.estado,
        creadoPor: cierre.creadoPor.nombre,
        cerradoPor: cierre.cerradoPor?.nombre ?? null,
        cerradoEn: cierre.cerradoEn,
        resueltoPor: cierre.resueltoPor?.nombre ?? null,
        resueltoEn: cierre.resueltoEn,
        observacionGerente: cierre.observacionGerente,
        efectivoContado: cierre.efectivoContado?.toString() ?? null,
        diferencia: cierre.diferencia?.toString() ?? null,
        explicacionDiferencia: cierre.explicacionDiferencia,
        resumen: cierre.resumen,
      },
      { empresa, logo },
    );
    return { buffer, nombreArchivo: `cierre-de-caja-${cierre.numeroTexto ?? 'borrador'}.pdf` };
  }

  // Lo que necesita la pantalla de "nuevo cierre": desde cuándo empieza el siguiente y con cuánto efectivo.
  async proximo(tipo?: TipoCierre) {
    const ultimo = await this.prisma.cierreCaja.findFirst({ orderBy: { hasta: 'desc' }, include: { creadoPor: { select: { nombre: true } } } });
    if (!ultimo) {
      return { esPrimero: true, puedeCrear: true, motivo: null, desde: null, hasta: null, efectivoInicial: null };
    }

    const desde = sumarDias(diaDeColumnaDate(ultimo.hasta), 1);
    const hasta = tipo ? finDelPeriodo(tipo, desde) : null;
    const pendiente = this.motivoPendiente(ultimo);
    const futuro = hasta !== null && hasta > hoyISO() ? `El período termina el ${formatearDiaDDMMAAAA(hasta)}: todavía no se puede cerrar` : null;
    return {
      esPrimero: false,
      puedeCrear: !pendiente && !futuro,
      motivo: pendiente ?? futuro,
      desde,
      hasta,
      efectivoInicial: ultimo.efectivoContado?.toString() ?? null,
    };
  }

  // ---------- Flujo ----------

  // RF-CAJ-01: el administrador genera el cierre (queda en borrador).
  async crear(dto: CrearCierreDto, usuario: UsuarioAutenticado) {
    const ultimo = await this.prisma.cierreCaja.findFirst({ orderBy: { hasta: 'desc' } });

    let desde: string;
    let efectivoInicial: Prisma.Decimal;
    if (ultimo) {
      const pendiente = this.motivoPendiente(ultimo);
      if (pendiente) {
        throw new ConflictException(pendiente);
      }
      desde = sumarDias(diaDeColumnaDate(ultimo.hasta), 1);
      if (dto.desde && dto.desde !== desde) {
        throw new BadRequestException(`El nuevo cierre empieza el ${formatearDiaDDMMAAAA(desde)}, el día siguiente al último: no se elige la fecha`);
      }
      efectivoInicial = ultimo.efectivoContado ?? new Prisma.Decimal(0);
    } else {
      // El primer cierre de la empresa: el administrador dice desde qué día y con cuánto efectivo en la caja.
      if (!dto.desde || !esFechaISOValida(dto.desde)) {
        throw new BadRequestException('Es el primer cierre de caja: indica desde qué día empieza (desde)');
      }
      if (dto.efectivoInicial === undefined) {
        throw new BadRequestException('Es el primer cierre de caja: indica el efectivo que hay en la caja ese día (efectivoInicial, puede ser 0)');
      }
      desde = dto.desde;
      efectivoInicial = new Prisma.Decimal(dto.efectivoInicial);
    }

    const hasta = finDelPeriodo(dto.tipo, desde);
    if (hasta > hoyISO()) {
      throw new BadRequestException(`El período termina el ${formatearDiaDDMMAAAA(hasta)}: todavía no se puede cerrar`);
    }

    try {
      const creado = await this.prisma.$transaction(async (tx) => {
        const fila = await tx.cierreCaja.create({
          data: {
            tipo: dto.tipo,
            desde: new Date(`${desde}T00:00:00.000Z`),
            hasta: new Date(`${hasta}T00:00:00.000Z`),
            efectivoInicial,
            creadoPorId: usuario.id,
          },
        });
        await registrarAuditoria(tx, {
          usuario,
          accion: 'CIERRE_CREAR',
          entidad: 'CIERRE_CAJA',
          entidadId: fila.id,
          resumen: `Generó un cierre de caja ${dto.tipo.toLowerCase()} del ${formatearDiaDDMMAAAA(desde)} al ${formatearDiaDDMMAAAA(hasta)}`,
          despues: { tipo: dto.tipo, desde, hasta, efectivoInicial },
        });
        return fila;
      });
      return this.obtener(creado.id);
    } catch (error) {
      // Dos personas creando el cierre al mismo tiempo: la base de datos no deja solapar períodos.
      if (error instanceof Error && error.message.includes('CierreCaja_sin_solape')) {
        throw new ConflictException('Ya existe un cierre de caja que cubre esos días');
      }
      throw error;
    }
  }

  // RF-CAJ-03 y 04: el administrador cuenta el efectivo y cierra. Aquí se congela la fotografía.
  async cerrar(id: string, dto: CerrarCierreDto, usuario: UsuarioAutenticado) {
    await this.prisma.$transaction(async (tx) => {
      // Espera a que terminen los registros de dinero en curso y detiene los nuevos hasta que este cierre termine:
      // lo que se calcula es exactamente lo que queda congelado.
      await bloquearRegistrosParaCierreEnTx(tx);

      const cierre = await tx.cierreCaja.findUnique({ where: { id } });
      if (!cierre) {
        throw new NotFoundException(`No existe el cierre de caja ${id}`);
      }
      if (cierre.estado !== EstadoCierre.BORRADOR && cierre.estado !== EstadoCierre.DEVUELTO) {
        throw new ConflictException(
          cierre.estado === EstadoCierre.APROBADO ? 'Este cierre ya fue aprobado y no se puede modificar' : 'Este cierre ya está cerrado: espera la decisión del gerente',
        );
      }

      const desde = diaDeColumnaDate(cierre.desde);
      const hasta = diaDeColumnaDate(cierre.hasta);
      if (hasta > hoyISO()) {
        throw new BadRequestException(`El período termina el ${formatearDiaDDMMAAAA(hasta)}: todavía no se puede cerrar`);
      }

      const resumen = await this.calcular(tx, desde, hasta, cierre.efectivoInicial);
      const contado = new Prisma.Decimal(dto.efectivoContado);
      const esperado = new Prisma.Decimal(resumen.efectivo.esperado);
      const diferencia = contado.minus(esperado);
      const explicacion = dto.explicacionDiferencia?.trim() || null;
      if (!diferencia.isZero() && (!explicacion || explicacion.length < 5)) {
        throw new BadRequestException({
          message: `El efectivo contado no coincide con el esperado (diferencia de ${diferencia.toString()}): explica la diferencia`,
          codigo: 'DIFERENCIA_SIN_EXPLICACION',
        });
      }

      // El número se asigna la primera vez que se cierra; al volver a cerrar un cierre devuelto se conserva.
      let numero = cierre.numero;
      if (numero === null) {
        numero = await siguienteConsecutivo(tx, SERIE_CIERRE_CAJA);
      }

      await tx.cierreCaja.update({
        where: { id },
        data: {
          estado: EstadoCierre.CERRADO,
          numero,
          numeroTexto: cierre.numeroTexto ?? formatearNumeroRecibo(PREFIJO_CIERRE_CAJA, numero),
          efectivoEsperado: esperado,
          efectivoContado: contado,
          diferencia,
          explicacionDiferencia: diferencia.isZero() ? null : explicacion,
          contenido: resumen as unknown as Prisma.InputJsonValue,
          cerradoPorId: usuario.id,
          cerradoEn: new Date(),
          // Si venía devuelto, la decisión anterior del gerente queda en el historial.
          resueltoPorId: null,
          resueltoEn: null,
          observacionGerente: null,
        },
      });
      await tx.cierreCajaHistorial.create({
        data: { cierreId: id, estadoAnterior: cierre.estado, estadoNuevo: EstadoCierre.CERRADO, usuarioId: usuario.id, observacion: explicacion },
      });
      const numeroTexto = cierre.numeroTexto ?? formatearNumeroRecibo(PREFIJO_CIERRE_CAJA, numero);
      await registrarAuditoria(tx, {
        usuario,
        accion: 'CIERRE_CERRAR',
        entidad: 'CIERRE_CAJA',
        entidadId: id,
        resumen: `Cerró la caja ${numeroTexto} (${formatearDiaDDMMAAAA(desde)} al ${formatearDiaDDMMAAAA(hasta)}): esperado ${formatearCOP(esperado)}, contado ${formatearCOP(contado)}, diferencia ${formatearCOP(diferencia)}`,
        antes: { estado: cierre.estado },
        despues: {
          estado: EstadoCierre.CERRADO,
          numero: numeroTexto,
          efectivoEsperado: esperado,
          efectivoContado: contado,
          diferencia,
          explicacionDiferencia: diferencia.isZero() ? null : explicacion,
          entradas: resumen.totales.entradas,
          salidas: resumen.totales.salidas,
        },
      });
    });
    return this.obtener(id);
  }

  // RF-CAJ-04: el gerente aprueba. Desde ese momento el cierre no cambia nunca.
  async aprobar(id: string, dto: AprobarCierreDto, usuario: UsuarioAutenticado) {
    return this.resolver(id, EstadoCierre.APROBADO, dto.observacion?.trim() || null, usuario);
  }

  // El gerente devuelve el cierre con una observación; el administrador corrige y lo vuelve a cerrar.
  async devolver(id: string, dto: DevolverCierreDto, usuario: UsuarioAutenticado) {
    return this.resolver(id, EstadoCierre.DEVUELTO, dto.observacion.trim(), usuario);
  }

  // Solo un borrador se descarta; un cierre que ya se cerró queda para siempre (aunque se devuelva).
  async descartar(id: string, usuario: UsuarioAutenticado) {
    const existente = await this.prisma.cierreCaja.findUnique({
      where: { id },
      select: { id: true, estado: true, tipo: true, desde: true, hasta: true, efectivoInicial: true },
    });
    if (!existente) {
      throw new NotFoundException(`No existe el cierre de caja ${id}`);
    }
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.cierreCaja.deleteMany({ where: { id, estado: EstadoCierre.BORRADOR } });
      if (count === 0) {
        throw new ConflictException('Solo se puede descartar un cierre en borrador');
      }
      const desde = diaDeColumnaDate(existente.desde);
      const hasta = diaDeColumnaDate(existente.hasta);
      await registrarAuditoria(tx, {
        usuario,
        accion: 'CIERRE_DESCARTAR',
        entidad: 'CIERRE_CAJA',
        entidadId: id,
        resumen: `Descartó el borrador del cierre de caja del ${formatearDiaDDMMAAAA(desde)} al ${formatearDiaDDMMAAAA(hasta)}`,
        antes: { estado: existente.estado, tipo: existente.tipo, desde, hasta, efectivoInicial: existente.efectivoInicial },
      });
    });
    return { descartado: true };
  }

  // ---------- Internos ----------

  private async resolver(id: string, nuevo: 'APROBADO' | 'DEVUELTO', observacion: string | null, usuario: UsuarioAutenticado) {
    await this.prisma.$transaction(async (tx) => {
      const cierre = await tx.cierreCaja.findUnique({ where: { id }, select: { estado: true, numeroTexto: true, desde: true, hasta: true, efectivoContado: true, diferencia: true } });
      if (!cierre) {
        throw new NotFoundException(`No existe el cierre de caja ${id}`);
      }
      // Condicionado al estado: si otra persona lo resolvió al mismo tiempo, esta no pisa su decisión.
      const { count } = await tx.cierreCaja.updateMany({
        where: { id, estado: EstadoCierre.CERRADO },
        data: { estado: nuevo, resueltoPorId: usuario.id, resueltoEn: new Date(), observacionGerente: observacion },
      });
      if (count === 0) {
        throw new ConflictException('Solo se puede aprobar o devolver un cierre que está cerrado y pendiente de decisión');
      }
      await tx.cierreCajaHistorial.create({
        data: { cierreId: id, estadoAnterior: EstadoCierre.CERRADO, estadoNuevo: nuevo, usuarioId: usuario.id, observacion },
      });
      await registrarAuditoria(tx, {
        usuario,
        accion: nuevo === EstadoCierre.APROBADO ? 'CIERRE_APROBAR' : 'CIERRE_DEVOLVER',
        entidad: 'CIERRE_CAJA',
        entidadId: id,
        resumen: `${nuevo === EstadoCierre.APROBADO ? 'Aprobó' : 'Devolvió'} el cierre de caja ${cierre.numeroTexto} (${formatearDiaDDMMAAAA(diaDeColumnaDate(cierre.desde))} al ${formatearDiaDDMMAAAA(diaDeColumnaDate(cierre.hasta))})${observacion ? `: ${observacion}` : ''}`,
        antes: { estado: EstadoCierre.CERRADO },
        despues: { estado: nuevo, observacion, efectivoContado: cierre.efectivoContado, diferencia: cierre.diferencia },
      });
    });
    return this.obtener(id);
  }

  // Un cierre anterior sin aprobar impide crear el siguiente: el efectivo inicial de cada cierre es el contado del
  // anterior ya aprobado, así que la cadena tiene que ir en orden.
  private motivoPendiente(ultimo: { estado: EstadoCierre; numeroTexto: string | null; desde: Date; hasta: Date }): string | null {
    if (ultimo.estado === EstadoCierre.APROBADO) return null;
    const periodo = `del ${formatearDiaDDMMAAAA(diaDeColumnaDate(ultimo.desde))} al ${formatearDiaDDMMAAAA(diaDeColumnaDate(ultimo.hasta))}`;
    switch (ultimo.estado) {
      case EstadoCierre.BORRADOR:
        return `Primero termina o descarta el cierre en borrador ${periodo}`;
      case EstadoCierre.CERRADO:
        return `Primero debe aprobarse el cierre ${ultimo.numeroTexto} (${periodo}): espera la decisión del gerente`;
      default:
        return `Primero debe corregirse y volver a cerrarse el cierre ${ultimo.numeroTexto} (${periodo}), que el gerente devolvió`;
    }
  }

  // Lee de la base los movimientos del período y los pasa por el cálculo puro.
  private async calcular(db: ClienteBd | PrismaService, desde: string, hasta: string, efectivoInicial: Prisma.Decimal): Promise<ResultadoCierre> {
    const inicio = parsearFechaLocal(desde);
    const fin = parsearFechaLocal(hasta);
    // Una anulación es un instante: se busca desde el comienzo del primer día hasta antes del día siguiente al último.
    const finExclusivo = parsearFechaLocal(sumarDias(hasta, 1));

    const [abonos, movimientos, nominas] = await Promise.all([
      db.abono.findMany({
        where: { OR: [{ fecha: { gte: inicio, lte: fin } }, { estado: EstadoAbono.ANULADO, anuladoEn: { gte: inicio, lt: finExclusivo } }] },
        include: {
          recibo: { select: { numeroTexto: true } },
          cuentaDestino: { select: { id: true, alias: true, banco: true } },
          venta: { select: { cliente: { select: { nombre: true } }, lote: { select: { numero: true, proyecto: { select: { nombre: true } } } } } },
        },
      }),
      db.movimientoFinanciero.findMany({
        where: { OR: [{ fecha: { gte: inicio, lte: fin } }, { estado: EstadoMovimiento.ANULADO, anuladoEn: { gte: inicio, lt: finExclusivo } }] },
        include: {
          categoriaGasto: { select: { nombre: true } },
          categoriaIngreso: { select: { nombre: true } },
          cuenta: { select: { id: true, alias: true, banco: true } },
          proyecto: { select: { nombre: true } },
        },
      }),
      db.pagoNomina.findMany({
        where: { fechaPago: { gte: inicio, lte: fin } },
        include: { trabajador: { select: { nombre: true } }, cuenta: { select: { id: true, alias: true, banco: true } } },
      }),
    ]);

    const datos: DatosCierre = {
      abonos: abonos.map((abono) => ({
        id: abono.id,
        fecha: abono.fecha,
        valor: abono.valor,
        medioPago: abono.medioPago,
        cuenta: abono.cuentaDestino,
        estado: abono.estado,
        anuladoEn: abono.anuladoEn,
        recibo: abono.recibo?.numeroTexto ?? null,
        verificacion: abono.verificacion,
        cliente: abono.venta.cliente.nombre,
        lote: abono.venta.lote.numero,
        proyecto: abono.venta.lote.proyecto.nombre,
      })),
      movimientos: movimientos.map((movimiento) => ({
        id: movimiento.id,
        tipo: movimiento.tipo,
        fecha: movimiento.fecha,
        valor: movimiento.valor,
        medioPago: movimiento.medioPago,
        cuenta: movimiento.cuenta,
        estado: movimiento.estado,
        anuladoEn: movimiento.anuladoEn,
        descripcion: movimiento.descripcion,
        categoria: (movimiento.categoriaGasto ?? movimiento.categoriaIngreso)?.nombre ?? '—',
        proyecto: movimiento.proyecto?.nombre ?? null,
      })),
      nominas: nominas.map((pago) => ({
        id: pago.id,
        fechaPago: pago.fechaPago,
        valorPagado: pago.valorPagado,
        medioPago: pago.medioPago,
        cuenta: pago.cuenta,
        trabajador: pago.trabajador.nombre,
      })),
    };

    return calcularCierre({ desde, hasta, efectivoInicial }, datos);
  }
}
