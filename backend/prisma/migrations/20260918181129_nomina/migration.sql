-- CreateEnum
CREATE TYPE "EstadoTrabajador" AS ENUM ('ACTIVO', 'INACTIVO');

-- CreateEnum
CREATE TYPE "TipoNovedad" AS ENUM ('HORAS_EXTRA', 'DESCUENTO', 'INCAPACIDAD');

-- CreateTable
CREATE TABLE "Trabajador" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "documento" TEXT NOT NULL,
    "cargo" TEXT NOT NULL,
    "salarioBase" DECIMAL(14,2) NOT NULL,
    "fechaIngreso" TIMESTAMP(3) NOT NULL,
    "telefono" TEXT,
    "email" TEXT,
    "estado" "EstadoTrabajador" NOT NULL DEFAULT 'ACTIVO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trabajador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PagoNomina" (
    "id" TEXT NOT NULL,
    "trabajadorId" TEXT NOT NULL,
    "periodoInicio" TIMESTAMP(3) NOT NULL,
    "periodoFin" TIMESTAMP(3) NOT NULL,
    "salarioBase" DECIMAL(14,2) NOT NULL,
    "valorPagado" DECIMAL(14,2) NOT NULL,
    "fechaPago" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PagoNomina_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NovedadNomina" (
    "id" TEXT NOT NULL,
    "pagoId" TEXT NOT NULL,
    "tipo" "TipoNovedad" NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "descripcion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NovedadNomina_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Trabajador_documento_key" ON "Trabajador"("documento");

-- AddForeignKey
ALTER TABLE "PagoNomina" ADD CONSTRAINT "PagoNomina_trabajadorId_fkey" FOREIGN KEY ("trabajadorId") REFERENCES "Trabajador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NovedadNomina" ADD CONSTRAINT "NovedadNomina_pagoId_fkey" FOREIGN KEY ("pagoId") REFERENCES "PagoNomina"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
