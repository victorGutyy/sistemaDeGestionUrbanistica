-- AlterEnum
ALTER TYPE "TipoNovedad" ADD VALUE 'ANTICIPO';

-- AlterTable
ALTER TABLE "PagoNomina" ADD COLUMN     "dias" DECIMAL(4,1),
ADD COLUMN     "horasExtra" DECIMAL(5,1),
ADD COLUMN     "observaciones" TEXT,
ADD COLUMN     "proyectoId" TEXT,
ADD COLUMN     "valorDevengado" DECIMAL(14,2),
ADD COLUMN     "valorDia" DECIMAL(14,2),
ADD COLUMN     "valorHoraExtra" DECIMAL(14,2),
ADD COLUMN     "valorHorasExtra" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "Trabajador" ADD COLUMN     "banco" TEXT,
ADD COLUMN     "cargoNominaId" TEXT,
ADD COLUMN     "numeroCuenta" TEXT,
ADD COLUMN     "tipoCuenta" TEXT,
ADD COLUMN     "valorDia" DECIMAL(14,2);

-- CreateTable
CREATE TABLE "CargoNomina" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "valorDia" DECIMAL(14,2) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CargoNomina_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CargoNomina_nombre_key" ON "CargoNomina"("nombre");

-- CreateIndex
CREATE INDEX "PagoNomina_proyectoId_periodoInicio_idx" ON "PagoNomina"("proyectoId", "periodoInicio");

-- CreateIndex
CREATE INDEX "PagoNomina_trabajadorId_periodoInicio_idx" ON "PagoNomina"("trabajadorId", "periodoInicio");

-- AddForeignKey
ALTER TABLE "Trabajador" ADD CONSTRAINT "Trabajador_cargoNominaId_fkey" FOREIGN KEY ("cargoNominaId") REFERENCES "CargoNomina"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoNomina" ADD CONSTRAINT "PagoNomina_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE SET NULL ON UPDATE CASCADE;
