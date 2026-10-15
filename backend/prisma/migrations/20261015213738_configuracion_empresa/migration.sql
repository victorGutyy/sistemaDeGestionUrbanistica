-- CreateEnum
CREATE TYPE "TipoCuenta" AS ENUM ('AHORROS', 'CORRIENTE', 'BILLETERA_DIGITAL');

-- CreateEnum
CREATE TYPE "TipoVendedor" AS ENUM ('ASESOR_INMOBILIARIO', 'REFERIDO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MedioPago" ADD VALUE 'CONSIGNACION';
ALTER TYPE "MedioPago" ADD VALUE 'NEQUI';
ALTER TYPE "MedioPago" ADD VALUE 'DAVIPLATA';

-- CreateTable
CREATE TABLE "ConfiguracionEmpresa" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "razonSocial" TEXT NOT NULL,
    "nombreComercial" TEXT NOT NULL,
    "nit" TEXT NOT NULL,
    "direccion" TEXT,
    "telefonos" TEXT,
    "correo" TEXT,
    "logoRuta" TEXT,
    "colorPrimario" TEXT NOT NULL DEFAULT '#2563eb',
    "textoLegalRecibo" TEXT,
    "nombreProducto" TEXT NOT NULL DEFAULT 'Urbanix',
    "porcentajeCuotaInicial" DECIMAL(5,2) NOT NULL DEFAULT 30,
    "plazoMaximoMeses" INTEGER NOT NULL DEFAULT 12,
    "tasaFinanciacionMensual" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tasaMoraMensual" DECIMAL(5,2),
    "diasGraciaMora" INTEGER NOT NULL DEFAULT 0,
    "diasSemaforoAmarillo" INTEGER NOT NULL DEFAULT 5,
    "diasAntesRecordatorio" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracionEmpresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CuentaBancaria" (
    "id" TEXT NOT NULL,
    "banco" TEXT NOT NULL,
    "tipo" "TipoCuenta" NOT NULL,
    "numero" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CuentaBancaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoriaGasto" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "esSistema" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoriaGasto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedioPagoConfig" (
    "medio" "MedioPago" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedioPagoConfig_pkey" PRIMARY KEY ("medio")
);

-- CreateTable
CREATE TABLE "ComisionTipoVendedor" (
    "tipo" "TipoVendedor" NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComisionTipoVendedor_pkey" PRIMARY KEY ("tipo")
);

-- CreateIndex
CREATE UNIQUE INDEX "CuentaBancaria_banco_numero_key" ON "CuentaBancaria"("banco", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "CategoriaGasto_nombre_key" ON "CategoriaGasto"("nombre");

-- Reglas que el esquema de Prisma no expresa (agregadas a mano): una sola
-- fila de configuración y valores dentro de rango, para que ni un error de
-- la aplicación ni un acceso directo a la base puedan dejar datos absurdos.
ALTER TABLE "ConfiguracionEmpresa"
    ADD CONSTRAINT "ConfiguracionEmpresa_una_sola_fila" CHECK ("id" = 1),
    ADD CONSTRAINT "ConfiguracionEmpresa_porcentajes_validos" CHECK (
        "porcentajeCuotaInicial" BETWEEN 0 AND 100
        AND "tasaFinanciacionMensual" BETWEEN 0 AND 100
        AND ("tasaMoraMensual" IS NULL OR "tasaMoraMensual" BETWEEN 0 AND 100)
    ),
    ADD CONSTRAINT "ConfiguracionEmpresa_plazos_validos" CHECK (
        "plazoMaximoMeses" >= 1
        AND "diasGraciaMora" >= 0
        AND "diasSemaforoAmarillo" >= 0
        AND "diasAntesRecordatorio" >= 0
    );

ALTER TABLE "ComisionTipoVendedor"
    ADD CONSTRAINT "ComisionTipoVendedor_valor_no_negativo" CHECK ("valor" >= 0);
