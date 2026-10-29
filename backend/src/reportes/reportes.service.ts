import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { exigirProyecto, filtroLote, filtroMovimiento, filtroProyecto, filtroVenta, tieneAlcanceTotal } from '../auth/alcance.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { diaLocal, formatearDiaDDMMAAAA, hoyISO } from '../cierres-caja/periodo.js';
import { parsearFechaLocal } from '../common/fecha.util.js';
import { ETIQUETA_MEDIO_PAGO } from '../common/medio-pago.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoAbono, EstadoMovimiento, EstadoVenta, TipoMovimiento, TipoProyecto } from '../generated/prisma/enums.js';
import { ComisionesService } from '../comisiones/comisiones.service.js';
import { ETIQUETA_ESTADO_COMISION } from '../comisiones/reglas-comision.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { CATALOGO_REPORTES, definicionDe, type DefinicionReporte } from './catalogo.js';
import { construirCarteraPorEdades } from './constructores/cartera-edades.js';
import { construirComisiones } from './constructores/comisiones.js';
import { construirEgresos, type EgresoParaReporte } from './constructores/egresos.js';
import { construirFlujoDeCaja, ETIQUETA_GRANULARIDAD, type Granularidad, type PartidaDeCaja } from './constructores/flujo-caja.js';
import { construirInformeProyecto } from './constructores/informe-proyecto.js';
import { construirInventario, ETIQUETA_ESTADO_LOTE } from './constructores/inventario.js';
import { construirMaquinariaPorEquipo } from './constructores/maquinaria.js';
import { construirRecaudo } from './constructores/recaudo.js';
import type { ConsultaReporteDto, ExportarReporteDto } from './dto/consulta-reporte.dto.js';
import { generarExcelReporte, nombreDeArchivo } from './generar-excel.js';
import { generarPdfReporte } from './generar-pdf.js';
import { leerLogoParaPdf } from './logo-pdf.js';
import type { ClaveReporte, ReporteGenerado, SeccionReporte } from './modelo.js';

const CONTENT_TYPE = {
  pdf: 'application/pdf',
  excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
} as const;

type Filtros = ConsultaReporteDto;

@Injectable()
export class ReportesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configuracion: ConfiguracionService,
    private readonly storage: StorageService,
    private readonly comisiones: ComisionesService,
  ) {}

  // Reportes que este usuario puede pedir: los de su permiso y alcance.
  private puedeUsar(definicion: DefinicionReporte, usuario: UsuarioAutenticado): boolean {
    return definicion.permisosExtra.every((permiso) => usuario.permisos.includes(permiso)) && (!definicion.soloAlcanceTotal || tieneAlcanceTotal(usuario));
  }

  // El catálogo con lo que el formulario de filtros necesita para ofrecer opciones (todo dentro del alcance del usuario).
  async catalogo(usuario: UsuarioAutenticado) {
    const total = tieneAlcanceTotal(usuario);
    const verComisiones = usuario.permisos.includes('comisiones.ver');
    const [proyectos, cuentas, usuarios, categoriasGasto, vendedores] = await Promise.all([
      this.prisma.proyecto.findMany({ where: filtroProyecto(usuario), select: { id: true, nombre: true }, orderBy: { nombre: 'asc' } }),
      // Las cuentas, los usuarios y las categorías son de toda la empresa: no se ofrecen a quien está limitado a proyectos.
      total ? this.prisma.cuentaBancaria.findMany({ select: { id: true, alias: true, banco: true }, orderBy: { alias: 'asc' } }) : Promise.resolve([]),
      total ? this.prisma.usuario.findMany({ select: { id: true, nombre: true }, orderBy: { nombre: 'asc' } }) : Promise.resolve([]),
      total ? this.prisma.categoriaGasto.findMany({ select: { id: true, nombre: true }, orderBy: { nombre: 'asc' } }) : Promise.resolve([]),
      // Los vendedores solo los ve quien puede consultar comisiones.
      verComisiones ? this.prisma.vendedor.findMany({ select: { id: true, nombre: true }, orderBy: { nombre: 'asc' } }) : Promise.resolve([]),
    ]);
    return {
      reportes: CATALOGO_REPORTES.filter((definicion) => this.puedeUsar(definicion, usuario)),
      opciones: {
        proyectos,
        cuentas,
        usuarios,
        categoriasGasto,
        vendedores,
        estadosComision: Object.entries(ETIQUETA_ESTADO_COMISION).map(([valor, etiqueta]) => ({ valor, etiqueta: etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1) })),
        fechasPor: [
          { valor: 'venta', etiqueta: 'La venta' },
          { valor: 'pago', etiqueta: 'El pago de la comisión' },
        ],
        mediosPago: Object.entries(ETIQUETA_MEDIO_PAGO).map(([valor, etiqueta]) => ({ valor, etiqueta })),
        estadosLote: Object.entries(ETIQUETA_ESTADO_LOTE).map(([valor, etiqueta]) => ({ valor, etiqueta })),
        granularidades: Object.entries(ETIQUETA_GRANULARIDAD).map(([valor, etiqueta]) => ({ valor, etiqueta })),
      },
    };
  }

  async generar(clave: string, filtros: Filtros, usuario: UsuarioAutenticado): Promise<ReporteGenerado> {
    const definicion = definicionDe(clave);
    if (!definicion) {
      throw new NotFoundException(`No existe el reporte "${clave}"`);
    }
    if (!this.puedeUsar(definicion, usuario)) {
      throw new ForbiddenException('No tienes permiso para este reporte');
    }
    if (filtros.proyectoId) {
      exigirProyecto(usuario, filtros.proyectoId, `No existe el proyecto ${filtros.proyectoId}`);
    }
    if (filtros.desde && filtros.hasta && filtros.desde > filtros.hasta) {
      throw new BadRequestException('La fecha inicial no puede ser posterior a la final');
    }

    if (definicion.filtros.some((filtro) => filtro.clave === 'proyectoId' && filtro.obligatorio) && !filtros.proyectoId) {
      throw new BadRequestException('Elige el proyecto del informe');
    }

    const secciones = await this.construir(definicion.clave, filtros, usuario);
    return {
      clave: definicion.clave,
      titulo: definicion.titulo,
      descripcion: definicion.descripcion,
      filtros: await this.describirFiltros(definicion, filtros),
      generadoEn: new Date().toISOString(),
      secciones,
    };
  }

  async exportar(clave: string, filtros: ExportarReporteDto, usuario: UsuarioAutenticado) {
    const reporte = await this.generar(clave, filtros, usuario);
    const empresa = await this.configuracion.obtenerEmpresa();

    if (filtros.formato === 'excel') {
      const buffer = await generarExcelReporte(reporte, empresa);
      return { buffer, contentType: CONTENT_TYPE.excel, nombreArchivo: nombreDeArchivo(reporte, 'xlsx', filtros.desde, filtros.hasta) };
    }

    const logo = await leerLogoParaPdf(this.storage, empresa.logoRuta);
    const buffer = await generarPdfReporte(reporte, { empresa, logo });
    return { buffer, contentType: CONTENT_TYPE.pdf, nombreArchivo: nombreDeArchivo(reporte, 'pdf', filtros.desde, filtros.hasta) };
  }

  // ---------- Consultas de cada reporte ----------

  private rango(filtros: Filtros): Prisma.DateTimeFilter | undefined {
    if (!filtros.desde && !filtros.hasta) return undefined;
    return { gte: filtros.desde ? parsearFechaLocal(filtros.desde) : undefined, lte: filtros.hasta ? parsearFechaLocal(filtros.hasta) : undefined };
  }

  private construir(clave: ClaveReporte, filtros: Filtros, usuario: UsuarioAutenticado): Promise<SeccionReporte[]> {
    switch (clave) {
      case 'recaudo':
        return this.recaudo(filtros, usuario);
      case 'cartera-edades':
        return this.carteraPorEdades(filtros, usuario);
      case 'egresos':
        return this.egresos(filtros, usuario);
      case 'inventario-lotes':
        return this.inventario(filtros, usuario);
      case 'flujo-caja':
        return this.flujoDeCaja(filtros, usuario);
      case 'comisiones':
        return this.comisionesReporte(filtros, usuario);
      case 'informe-proyecto':
        return this.informeProyecto(filtros, usuario);
      case 'maquinaria-equipos':
        return this.maquinaria(filtros, usuario);
    }
  }

  private async recaudo(filtros: Filtros, usuario: UsuarioAutenticado): Promise<SeccionReporte[]> {
    const abonos = await this.prisma.abono.findMany({
      where: {
        estado: EstadoAbono.ACTIVO,
        fecha: this.rango(filtros),
        medioPago: filtros.medioPago,
        cuentaDestinoId: filtros.cuentaId,
        registradoPorId: filtros.usuarioId,
        venta: { AND: [filtroVenta(usuario), ...(filtros.proyectoId ? [{ lote: { proyectoId: filtros.proyectoId } }] : [])] },
      },
      include: {
        recibo: { select: { numeroTexto: true } },
        cuentaDestino: { select: { alias: true } },
        registradoPor: { select: { nombre: true } },
        venta: { select: { cliente: { select: { nombre: true } }, lote: { select: { numero: true, manzana: { select: { nombre: true } }, proyecto: { select: { nombre: true } } } } } },
      },
    });
    return construirRecaudo(
      abonos.map((abono) => ({
        fecha: diaLocal(abono.fecha),
        recibo: abono.recibo?.numeroTexto ?? null,
        cliente: abono.venta.cliente.nombre,
        proyecto: abono.venta.lote.proyecto.nombre,
        lote: abono.venta.lote.manzana ? `${abono.venta.lote.manzana.nombre}-${abono.venta.lote.numero}` : abono.venta.lote.numero,
        medioPago: abono.medioPago,
        cuenta: abono.cuentaDestino?.alias ?? null,
        referencia: abono.referencia,
        valor: abono.valor,
        registradoPor: abono.registradoPor?.nombre ?? null,
        verificacion: abono.verificacion,
      })),
    );
  }

  private async carteraPorEdades(filtros: Filtros, usuario: UsuarioAutenticado): Promise<SeccionReporte[]> {
    const [empresa, ventas] = await Promise.all([
      this.configuracion.obtenerEmpresa(),
      this.prisma.venta.findMany({
        where: { estado: EstadoVenta.ACTIVA, AND: [filtroVenta(usuario), ...(filtros.proyectoId ? [{ lote: { proyectoId: filtros.proyectoId } }] : [])] },
        include: {
          cliente: { select: { nombre: true } },
          lote: { select: { numero: true, manzana: { select: { nombre: true } }, proyecto: { select: { nombre: true } } } },
          cuotas: { include: { aplicaciones: { where: { abono: { estado: EstadoAbono.ACTIVO } }, select: { valor: true } } } },
        },
      }),
    ]);
    return construirCarteraPorEdades(
      ventas.map((venta) => ({
        cliente: venta.cliente.nombre,
        proyecto: venta.lote.proyecto.nombre,
        lote: venta.lote.manzana ? `${venta.lote.manzana.nombre}-${venta.lote.numero}` : venta.lote.numero,
        cuotas: venta.cuotas.map((cuota) => ({ estado: cuota.estado, fechaVencimiento: cuota.fechaVencimiento, valor: cuota.valor, abonado: cuota.aplicaciones })),
      })),
      new Date(),
      { tasaMoraMensual: empresa.tasaMoraMensual, diasGracia: empresa.diasGraciaMora },
    );
  }

  // Los pagos de nómina son un gasto real de la empresa que no pertenece a ningún proyecto (igual que en el consolidado de
  // caja): solo con alcance total y cuando el reporte no se limita a un proyecto o a una categoría.
  private async nomina(filtros: Filtros, usuario: UsuarioAutenticado, rango: Prisma.DateTimeFilter | undefined) {
    if (!tieneAlcanceTotal(usuario) || filtros.proyectoId || filtros.categoriaId) return [];
    return this.prisma.pagoNomina.findMany({ where: { fechaPago: rango }, select: { fechaPago: true, valorPagado: true } });
  }

  private async egresos(filtros: Filtros, usuario: UsuarioAutenticado): Promise<SeccionReporte[]> {
    const rango = this.rango(filtros);
    const [movimientos, pagosNomina] = await Promise.all([
      this.prisma.movimientoFinanciero.findMany({
        where: {
          tipo: TipoMovimiento.GASTO,
          estado: EstadoMovimiento.ACTIVO,
          fecha: rango,
          proyectoId: filtros.proyectoId,
          categoriaGastoId: filtros.categoriaId,
          AND: [filtroMovimiento(usuario)],
        },
        select: { valor: true, categoriaGasto: { select: { nombre: true } }, proyecto: { select: { nombre: true } } },
      }),
      this.nomina(filtros, usuario, rango),
    ]);
    const egresos: EgresoParaReporte[] = [
      ...movimientos.map((m) => ({ categoria: m.categoriaGasto?.nombre ?? 'Sin categoría', proyecto: m.proyecto?.nombre ?? null, valor: m.valor })),
      ...pagosNomina.map((pago) => ({ categoria: 'Nómina', proyecto: null, valor: pago.valorPagado })),
    ];
    return construirEgresos(egresos);
  }

  private async inventario(filtros: Filtros, usuario: UsuarioAutenticado): Promise<SeccionReporte[]> {
    const lotes = await this.prisma.lote.findMany({
      where: { AND: [filtroLote(usuario)], proyectoId: filtros.proyectoId },
      select: { numero: true, area: true, valorVenta: true, estado: true, manzana: { select: { nombre: true } }, proyecto: { select: { nombre: true } } },
    });
    return construirInventario(
      lotes.map((lote) => ({ proyecto: lote.proyecto.nombre, manzana: lote.manzana?.nombre ?? null, numero: lote.numero, area: lote.area, valorVenta: lote.valorVenta, estado: lote.estado })),
      filtros.estadoLote,
    );
  }

  private async flujoDeCaja(filtros: Filtros, usuario: UsuarioAutenticado): Promise<SeccionReporte[]> {
    if (!filtros.desde || !filtros.hasta) {
      throw new BadRequestException('Indica las fechas desde y hasta del flujo de caja');
    }
    // Todo lo anterior al rango también se trae: de ahí sale el saldo inicial.
    const hastaRango: Prisma.DateTimeFilter = { lte: parsearFechaLocal(filtros.hasta) };
    const proyecto = filtros.proyectoId ? [{ lote: { proyectoId: filtros.proyectoId } }] : [];
    const [abonos, movimientos, pagosNomina] = await Promise.all([
      this.prisma.abono.findMany({
        where: { estado: EstadoAbono.ACTIVO, fecha: hastaRango, venta: { AND: [filtroVenta(usuario), ...proyecto] } },
        select: { fecha: true, valor: true },
      }),
      this.prisma.movimientoFinanciero.findMany({
        where: { estado: EstadoMovimiento.ACTIVO, fecha: hastaRango, proyectoId: filtros.proyectoId, AND: [filtroMovimiento(usuario)] },
        select: { fecha: true, valor: true, tipo: true },
      }),
      this.nomina(filtros, usuario, hastaRango),
    ]);
    const partidas: PartidaDeCaja[] = [
      ...abonos.map((a): PartidaDeCaja => ({ dia: diaLocal(a.fecha), tipo: 'INGRESO_VENTA', valor: a.valor })),
      ...movimientos.map((m): PartidaDeCaja => ({ dia: diaLocal(m.fecha), tipo: m.tipo === TipoMovimiento.GASTO ? 'EGRESO' : 'INGRESO_OTRO', valor: m.valor })),
      ...pagosNomina.map((p): PartidaDeCaja => ({ dia: diaLocal(p.fechaPago), tipo: 'EGRESO', valor: p.valorPagado })),
    ];
    return construirFlujoDeCaja(partidas, { desde: filtros.desde, hasta: filtros.hasta, granularidad: (filtros.granularidad ?? 'MES') as Granularidad });
  }

  private async comisionesReporte(filtros: Filtros, usuario: UsuarioAutenticado): Promise<SeccionReporte[]> {
    const { comisiones } = await this.comisiones.listar(
      { vendedorId: filtros.vendedorId, estado: filtros.estadoComision, proyectoId: filtros.proyectoId, desde: filtros.desde, hasta: filtros.hasta, fechaPor: filtros.fechaPor },
      usuario,
    );
    return construirComisiones(
      comisiones.map((comision) => ({
        fechaVenta: diaLocal(comision.venta.fechaVenta),
        proyecto: comision.venta.lote.proyecto.nombre,
        lote: comision.venta.lote.manzana ? `${comision.venta.lote.manzana.nombre}-${comision.venta.lote.numero}` : comision.venta.lote.numero,
        cliente: comision.venta.cliente.nombre,
        vendedor: comision.vendedor.nombre,
        tipoVendedor: comision.tipoVendedor,
        valor: comision.valor,
        estado: comision.estado,
        fechaPago: comision.movimiento ? diaLocal(comision.movimiento.fecha) : null,
        medioPago: comision.movimiento?.medioPago ?? null,
        motivoAnulacion: comision.motivoAnulacion,
      })),
    );
  }

  // Informe de un proyecto para el socio (RF-REP-09). Ventas, cartera e inventario son "a hoy"; ingresos y egresos, del período.
  private async informeProyecto(filtros: Filtros, usuario: UsuarioAutenticado): Promise<SeccionReporte[]> {
    const proyectoId = filtros.proyectoId!;
    const rango = this.rango(filtros);
    const [empresa, lotes, ventas, abonosDelPeriodo, movimientos] = await Promise.all([
      this.configuracion.obtenerEmpresa(),
      this.prisma.lote.findMany({
        where: { proyectoId },
        select: { numero: true, area: true, valorVenta: true, estado: true, manzana: { select: { nombre: true } }, proyecto: { select: { nombre: true } } },
      }),
      this.prisma.venta.findMany({
        where: { estado: EstadoVenta.ACTIVA, AND: [filtroVenta(usuario), { lote: { proyectoId } }] },
        include: {
          cliente: { select: { nombre: true } },
          lote: { select: { numero: true, manzana: { select: { nombre: true } }, proyecto: { select: { nombre: true } } } },
          abonos: { where: { estado: EstadoAbono.ACTIVO }, select: { valor: true } },
          cuotas: { include: { aplicaciones: { where: { abono: { estado: EstadoAbono.ACTIVO } }, select: { valor: true } } } },
        },
      }),
      this.prisma.abono.findMany({ where: { estado: EstadoAbono.ACTIVO, fecha: rango, venta: { lote: { proyectoId } } }, select: { valor: true } }),
      this.prisma.movimientoFinanciero.findMany({
        where: { estado: EstadoMovimiento.ACTIVO, proyectoId, fecha: rango, AND: [filtroMovimiento(usuario)] },
        select: { tipo: true, valor: true, categoriaGasto: { select: { nombre: true } }, proyecto: { select: { nombre: true } } },
      }),
    ]);
    const suma = (valores: { valor: Prisma.Decimal }[]) => valores.reduce((total, v) => total.plus(v.valor), new Prisma.Decimal(0));
    return construirInformeProyecto({
      lotes: lotes.map((lote) => ({ proyecto: lote.proyecto.nombre, manzana: lote.manzana?.nombre ?? null, numero: lote.numero, area: lote.area, valorVenta: lote.valorVenta, estado: lote.estado })),
      ventas: ventas.map((venta) => ({ valorTotal: venta.valorTotal, pagado: suma(venta.abonos) })),
      ingresosPorVentas: suma(abonosDelPeriodo),
      otrosIngresos: suma(movimientos.filter((m) => m.tipo === TipoMovimiento.INGRESO)),
      egresos: movimientos
        .filter((m) => m.tipo === TipoMovimiento.GASTO)
        .map((m) => ({ categoria: m.categoriaGasto?.nombre ?? 'Sin categoría', proyecto: m.proyecto?.nombre ?? null, valor: m.valor })),
      ventasParaEdades: ventas.map((venta) => ({
        cliente: venta.cliente.nombre,
        proyecto: venta.lote.proyecto.nombre,
        lote: venta.lote.manzana ? `${venta.lote.manzana.nombre}-${venta.lote.numero}` : venta.lote.numero,
        cuotas: venta.cuotas.map((cuota) => ({ estado: cuota.estado, fechaVencimiento: cuota.fechaVencimiento, valor: cuota.valor, abonado: cuota.aplicaciones })),
      })),
      hoy: new Date(),
      mora: { tasaMoraMensual: empresa.tasaMoraMensual, diasGracia: empresa.diasGraciaMora },
    });
  }

  // Utilidad por equipo en un rango de fechas (RF-MAQ-05).
  private async maquinaria(filtros: Filtros, usuario: UsuarioAutenticado): Promise<SeccionReporte[]> {
    const [equipos, movimientos] = await Promise.all([
      this.prisma.equipo.findMany({
        where: { proyectoId: filtros.proyectoId, proyecto: { tipo: TipoProyecto.MAQUINARIA, AND: [filtroProyecto(usuario)] } },
        select: { id: true, nombre: true, placaSerie: true, estado: true, bajaEn: true, tipoEquipo: { select: { nombre: true } }, proyecto: { select: { nombre: true } } },
      }),
      this.prisma.movimientoFinanciero.findMany({
        where: {
          estado: EstadoMovimiento.ACTIVO,
          fecha: this.rango(filtros),
          proyectoId: filtros.proyectoId,
          proyecto: { tipo: TipoProyecto.MAQUINARIA },
          OR: [{ equipoId: { not: null } }, { flota: true }],
          AND: [filtroMovimiento(usuario)],
        },
        select: { equipoId: true, tipo: true, valor: true, proyecto: { select: { nombre: true } } },
      }),
    ]);
    return construirMaquinariaPorEquipo(
      equipos.map((equipo) => ({ id: equipo.id, proyecto: equipo.proyecto.nombre, nombre: equipo.nombre, placaSerie: equipo.placaSerie, tipo: equipo.tipoEquipo.nombre, estado: equipo.estado, baja: equipo.bajaEn !== null })),
      movimientos.map((movimiento) => ({ equipoId: movimiento.equipoId, proyecto: movimiento.proyecto?.nombre ?? '—', tipo: movimiento.tipo, valor: movimiento.valor })),
    );
  }

  // Los filtros en palabras, para que el papel diga de qué es.
  private async describirFiltros(definicion: DefinicionReporte, filtros: Filtros): Promise<{ etiqueta: string; valor: string }[]> {
    const lista: { etiqueta: string; valor: string }[] = [];
    const usa = (clave: string) => definicion.filtros.some((filtro) => filtro.clave === clave);

    if (usa('desde') || usa('hasta')) {
      lista.push({ etiqueta: 'Período', valor: `${filtros.desde ? formatearDiaDDMMAAAA(filtros.desde) : 'desde el inicio'} a ${filtros.hasta ? formatearDiaDDMMAAAA(filtros.hasta) : formatearDiaDDMMAAAA(hoyISO())}` });
    }
    if (usa('proyectoId') && filtros.proyectoId) {
      const proyecto = await this.prisma.proyecto.findUnique({ where: { id: filtros.proyectoId }, select: { nombre: true } });
      lista.push({ etiqueta: 'Proyecto', valor: proyecto?.nombre ?? '—' });
    }
    if (usa('medioPago') && filtros.medioPago) lista.push({ etiqueta: 'Medio de pago', valor: ETIQUETA_MEDIO_PAGO[filtros.medioPago] });
    if (usa('cuentaId') && filtros.cuentaId) {
      const cuenta = await this.prisma.cuentaBancaria.findUnique({ where: { id: filtros.cuentaId }, select: { alias: true } });
      lista.push({ etiqueta: 'Cuenta', valor: cuenta?.alias ?? '—' });
    }
    if (usa('usuarioId') && filtros.usuarioId) {
      const registrante = await this.prisma.usuario.findUnique({ where: { id: filtros.usuarioId }, select: { nombre: true } });
      lista.push({ etiqueta: 'Registrado por', valor: registrante?.nombre ?? '—' });
    }
    if (usa('categoriaId') && filtros.categoriaId) {
      const categoria = await this.prisma.categoriaGasto.findUnique({ where: { id: filtros.categoriaId }, select: { nombre: true } });
      lista.push({ etiqueta: 'Categoría', valor: categoria?.nombre ?? '—' });
    }
    if (usa('estadoLote') && filtros.estadoLote) lista.push({ etiqueta: 'Estado del lote', valor: ETIQUETA_ESTADO_LOTE[filtros.estadoLote] });
    if (usa('vendedorId') && filtros.vendedorId) {
      const vendedor = await this.prisma.vendedor.findUnique({ where: { id: filtros.vendedorId }, select: { nombre: true } });
      lista.push({ etiqueta: 'Vendedor', valor: vendedor?.nombre ?? '—' });
    }
    if (usa('estadoComision') && filtros.estadoComision) lista.push({ etiqueta: 'Estado', valor: ETIQUETA_ESTADO_COMISION[filtros.estadoComision] });
    if (usa('fechaPor') && (filtros.desde || filtros.hasta)) lista.push({ etiqueta: 'Las fechas son de', valor: filtros.fechaPor === 'pago' ? 'el pago de la comisión' : 'la venta' });
    if (usa('granularidad')) lista.push({ etiqueta: 'Agrupado por', valor: ETIQUETA_GRANULARIDAD[(filtros.granularidad ?? 'MES') as Granularidad] });
    if (definicion.clave === 'cartera-edades') lista.push({ etiqueta: 'Al día', valor: formatearDiaDDMMAAAA(hoyISO()) });
    return lista;
  }
}

