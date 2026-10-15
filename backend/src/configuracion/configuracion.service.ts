import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { MedioPago, TipoVendedor } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { ActualizarEmpresaDto } from './dto/actualizar-empresa.dto.js';
import { ActualizarParametrosDto } from './dto/actualizar-parametros.dto.js';
import { ActualizarCategoriaGastoDto, CrearCategoriaGastoDto } from './dto/categoria-gasto.dto.js';
import { ActualizarCuentaBancariaDto, CrearCuentaBancariaDto } from './dto/cuenta-bancaria.dto.js';

// La configuración es una sola fila; el CHECK de la migración impide otro id.
const ID_UNICO = 1;

// Medios habilitados cuando todavía nadie ha tocado la configuración.
// CHEQUE y TARJETA existen solo para no invalidar abonos antiguos.
export const MEDIOS_ACTIVOS_POR_DEFECTO: Record<MedioPago, boolean> = {
  EFECTIVO: true,
  CONSIGNACION: true,
  TRANSFERENCIA: true,
  NEQUI: true,
  DAVIPLATA: true,
  CHEQUE: false,
  TARJETA: false,
};

const ETIQUETA_MEDIO_PAGO: Record<MedioPago, string> = {
  EFECTIVO: 'Efectivo',
  CONSIGNACION: 'Consignación',
  TRANSFERENCIA: 'Transferencia',
  NEQUI: 'Nequi',
  DAVIPLATA: 'Daviplata',
  CHEQUE: 'Cheque',
  TARJETA: 'Tarjeta',
};

export type TipoImagen = 'png' | 'jpg' | 'webp';

// El tipo que declara el navegador lo puede falsear quien sube el archivo;
// los primeros bytes del archivo no.
export function detectarTipoImagen(buffer: Buffer): TipoImagen | null {
  if (buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpg';
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'webp';
  }
  return null;
}

const CONTENT_TYPE_IMAGEN: Record<TipoImagen, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
};

@Injectable()
export class ConfiguracionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // ---------- Empresa y parámetros ----------

  // Si nadie ha configurado nada todavía, crea la fila con valores neutros:
  // la app nunca debe fallar por no tener configuración.
  async obtenerEmpresa() {
    const existente = await this.prisma.configuracionEmpresa.findUnique({ where: { id: ID_UNICO } });
    if (existente) return existente;

    try {
      return await this.prisma.configuracionEmpresa.create({
        data: { id: ID_UNICO, razonSocial: 'Mi empresa', nombreComercial: 'Mi empresa', nit: 'Por configurar' },
      });
    } catch {
      // Otra petición la creó en el mismo instante.
      return this.prisma.configuracionEmpresa.findUniqueOrThrow({ where: { id: ID_UNICO } });
    }
  }

  // Lo mínimo que necesita la pantalla de ingreso, antes de tener sesión.
  async obtenerPublica() {
    const empresa = await this.obtenerEmpresa();
    return {
      nombreComercial: empresa.nombreComercial,
      nombreProducto: empresa.nombreProducto,
      colorPrimario: empresa.colorPrimario,
      tieneLogo: empresa.logoRuta !== null,
      // Cambia cada vez que se edita la configuración: sirve para que el
      // navegador no muestre un logo viejo desde su caché.
      version: empresa.updatedAt.getTime(),
    };
  }

  async obtenerCompleta() {
    const [empresa, cuentas, mediosPago, categoriasGasto, comisiones] = await Promise.all([
      this.obtenerEmpresa(),
      this.listarCuentas(),
      this.listarMediosPago(),
      this.listarCategoriasGasto(),
      this.listarComisiones(),
    ]);
    return { empresa, cuentas, mediosPago, categoriasGasto, comisiones };
  }

  async actualizarEmpresa(dto: ActualizarEmpresaDto) {
    await this.obtenerEmpresa();
    return this.prisma.configuracionEmpresa.update({
      where: { id: ID_UNICO },
      data: {
        razonSocial: dto.razonSocial,
        nombreComercial: dto.nombreComercial,
        nit: dto.nit,
        direccion: dto.direccion ?? null,
        telefonos: dto.telefonos ?? null,
        correo: dto.correo ?? null,
        colorPrimario: dto.colorPrimario.toLowerCase(),
        textoLegalRecibo: dto.textoLegalRecibo ?? null,
      },
    });
  }

  async actualizarParametros(dto: ActualizarParametrosDto) {
    await this.obtenerEmpresa();
    return this.prisma.configuracionEmpresa.update({
      where: { id: ID_UNICO },
      data: {
        porcentajeCuotaInicial: new Prisma.Decimal(dto.porcentajeCuotaInicial),
        plazoMaximoMeses: dto.plazoMaximoMeses,
        tasaFinanciacionMensual: new Prisma.Decimal(dto.tasaFinanciacionMensual),
        tasaMoraMensual: dto.tasaMoraMensual === null ? null : new Prisma.Decimal(dto.tasaMoraMensual),
        diasGraciaMora: dto.diasGraciaMora,
        diasSemaforoAmarillo: dto.diasSemaforoAmarillo,
        diasAntesRecordatorio: dto.diasAntesRecordatorio,
      },
    });
  }

  // ---------- Logo ----------

  async guardarLogo(archivo: Express.Multer.File) {
    const tipo = detectarTipoImagen(archivo.buffer);
    if (!tipo) {
      throw new BadRequestException('El logo debe ser una imagen PNG, JPG o WebP');
    }

    await this.obtenerEmpresa();
    // El nombre lo fijamos nosotros según el tipo real del archivo.
    const { rutaRelativa } = await this.storage.guardar('empresa', `logo.${tipo}`, archivo.buffer);
    await this.prisma.configuracionEmpresa.update({ where: { id: ID_UNICO }, data: { logoRuta: rutaRelativa } });
    return this.obtenerPublica();
  }

  // Solo desasocia el logo: el archivo anterior se conserva en el almacenamiento.
  async quitarLogo() {
    await this.obtenerEmpresa();
    await this.prisma.configuracionEmpresa.update({ where: { id: ID_UNICO }, data: { logoRuta: null } });
    return this.obtenerPublica();
  }

  async leerLogo() {
    const empresa = await this.obtenerEmpresa();
    if (!empresa.logoRuta) {
      throw new NotFoundException('La empresa no tiene logo configurado');
    }
    const buffer = await this.storage.leer(empresa.logoRuta);
    const tipo = detectarTipoImagen(buffer) ?? 'png';
    return { buffer, contentType: CONTENT_TYPE_IMAGEN[tipo] };
  }

  // ---------- Cuentas de recaudo ----------

  listarCuentas() {
    return this.prisma.cuentaBancaria.findMany({ orderBy: [{ banco: 'asc' }, { alias: 'asc' }] });
  }

  async crearCuenta(dto: CrearCuentaBancariaDto) {
    const existente = await this.prisma.cuentaBancaria.findUnique({
      where: { banco_numero: { banco: dto.banco, numero: dto.numero } },
    });
    if (existente) {
      throw new ConflictException(`Ya existe una cuenta de ${dto.banco} con el número ${dto.numero}`);
    }
    return this.prisma.cuentaBancaria.create({ data: dto });
  }

  async actualizarCuenta(id: string, dto: ActualizarCuentaBancariaDto) {
    const cuenta = await this.prisma.cuentaBancaria.findUnique({ where: { id } });
    if (!cuenta) {
      throw new NotFoundException(`No existe la cuenta ${id}`);
    }

    const banco = dto.banco ?? cuenta.banco;
    const numero = dto.numero ?? cuenta.numero;
    if (banco !== cuenta.banco || numero !== cuenta.numero) {
      const duplicada = await this.prisma.cuentaBancaria.findUnique({
        where: { banco_numero: { banco, numero } },
      });
      if (duplicada && duplicada.id !== id) {
        throw new ConflictException(`Ya existe una cuenta de ${banco} con el número ${numero}`);
      }
    }

    return this.prisma.cuentaBancaria.update({ where: { id }, data: dto });
  }

  // ---------- Medios de pago ----------

  async listarMediosPago() {
    const todos = Object.values(MedioPago);
    let existentes = await this.prisma.medioPagoConfig.findMany();

    const faltantes = todos.filter((medio) => !existentes.some((fila) => fila.medio === medio));
    if (faltantes.length > 0) {
      await this.prisma.medioPagoConfig.createMany({
        data: faltantes.map((medio) => ({ medio, activo: MEDIOS_ACTIVOS_POR_DEFECTO[medio] })),
        skipDuplicates: true,
      });
      existentes = await this.prisma.medioPagoConfig.findMany();
    }

    return existentes
      .sort((a, b) => todos.indexOf(a.medio) - todos.indexOf(b.medio))
      .map((fila) => ({ ...fila, etiqueta: ETIQUETA_MEDIO_PAGO[fila.medio] }));
  }

  async actualizarMedioPago(medio: MedioPago, activo: boolean) {
    await this.listarMediosPago();

    if (!activo) {
      const otrosActivos = await this.prisma.medioPagoConfig.count({ where: { activo: true, medio: { not: medio } } });
      if (otrosActivos === 0) {
        throw new BadRequestException('Debe quedar al menos un medio de pago activo');
      }
    }

    await this.prisma.medioPagoConfig.update({ where: { medio }, data: { activo } });
    return this.listarMediosPago();
  }

  // Validación del lado del servidor: ocultar un medio en la pantalla no
  // basta, quien llame directo a la API también debe recibir el rechazo.
  async exigirMedioPagoActivo(medio: MedioPago) {
    const medios = await this.listarMediosPago();
    const configurado = medios.find((fila) => fila.medio === medio);
    if (!configurado?.activo) {
      throw new BadRequestException(`El medio de pago "${ETIQUETA_MEDIO_PAGO[medio]}" no está habilitado`);
    }
  }

  // ---------- Categorías de gasto ----------

  listarCategoriasGasto() {
    return this.prisma.categoriaGasto.findMany({ orderBy: [{ esSistema: 'desc' }, { nombre: 'asc' }] });
  }

  async crearCategoriaGasto(dto: CrearCategoriaGastoDto) {
    const nombre = dto.nombre.trim();
    await this.exigirNombreDeCategoriaLibre(nombre);
    return this.prisma.categoriaGasto.create({ data: { nombre } });
  }

  async actualizarCategoriaGasto(id: string, dto: ActualizarCategoriaGastoDto) {
    const categoria = await this.prisma.categoriaGasto.findUnique({ where: { id } });
    if (!categoria) {
      throw new NotFoundException(`No existe la categoría ${id}`);
    }

    const nombre = dto.nombre?.trim();
    if (categoria.esSistema && ((nombre !== undefined && nombre !== categoria.nombre) || dto.activa === false)) {
      throw new BadRequestException(
        `La categoría "${categoria.nombre}" la usa el sistema automáticamente: no se puede renombrar ni desactivar`,
      );
    }
    if (nombre !== undefined && nombre !== categoria.nombre) {
      await this.exigirNombreDeCategoriaLibre(nombre, id);
    }

    return this.prisma.categoriaGasto.update({ where: { id }, data: { nombre, activa: dto.activa } });
  }

  private async exigirNombreDeCategoriaLibre(nombre: string, ignorarId?: string) {
    const existente = await this.prisma.categoriaGasto.findFirst({
      where: { nombre: { equals: nombre, mode: 'insensitive' } },
    });
    if (existente && existente.id !== ignorarId) {
      throw new ConflictException(`Ya existe la categoría "${existente.nombre}"`);
    }
  }

  // ---------- Comisiones ----------

  async listarComisiones() {
    const tipos = Object.values(TipoVendedor);
    let existentes = await this.prisma.comisionTipoVendedor.findMany();

    const faltantes = tipos.filter((tipo) => !existentes.some((fila) => fila.tipo === tipo));
    if (faltantes.length > 0) {
      await this.prisma.comisionTipoVendedor.createMany({
        data: faltantes.map((tipo) => ({ tipo, valor: new Prisma.Decimal(0) })),
        skipDuplicates: true,
      });
      existentes = await this.prisma.comisionTipoVendedor.findMany();
    }

    return existentes.sort((a, b) => tipos.indexOf(a.tipo) - tipos.indexOf(b.tipo));
  }

  async actualizarComision(tipo: TipoVendedor, valor: string) {
    await this.listarComisiones();
    return this.prisma.comisionTipoVendedor.update({ where: { tipo }, data: { valor: new Prisma.Decimal(valor) } });
  }
}
