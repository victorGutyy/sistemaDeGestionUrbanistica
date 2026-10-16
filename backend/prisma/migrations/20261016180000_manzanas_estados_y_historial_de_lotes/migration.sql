-- CreateEnum
CREATE TYPE "TipoProyecto" AS ENUM ('LOTES', 'REMODELACION', 'MAQUINARIA');

-- CreateEnum
CREATE TYPE "TipoEventoLote" AS ENUM ('CREACION', 'CAMBIO_ESTADO', 'CAMBIO_PRECIO');

-- AlterEnum (el estado RESERVADO pasa a llamarse SEPARADO; los lotes que lo tuvieran lo conservan)
ALTER TYPE "EstadoLote" RENAME VALUE 'RESERVADO' TO 'SEPARADO';
ALTER TYPE "EstadoLote" ADD VALUE 'ESCRITURADO';
ALTER TYPE "EstadoLote" ADD VALUE 'DESISTIDO';

-- DropIndex
DROP INDEX "Lote_proyectoId_numero_key";

-- AlterTable
ALTER TABLE "Lote" ADD COLUMN     "escrituraFecha" TIMESTAMP(3),
ADD COLUMN     "escrituraNotaria" TEXT,
ADD COLUMN     "escrituraNumero" TEXT,
ADD COLUMN     "linderos" TEXT,
ADD COLUMN     "manzanaId" TEXT,
ADD COLUMN     "valorPorM2" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "Proyecto" ADD COLUMN     "municipio" TEXT,
ADD COLUMN     "tipo" "TipoProyecto" NOT NULL DEFAULT 'LOTES';

-- CreateTable
CREATE TABLE "Manzana" (
    "id" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Manzana_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoteHistorial" (
    "id" TEXT NOT NULL,
    "loteId" TEXT NOT NULL,
    "tipo" "TipoEventoLote" NOT NULL,
    "estadoAnterior" "EstadoLote",
    "estadoNuevo" "EstadoLote",
    "valorAnterior" DECIMAL(14,2),
    "valorNuevo" DECIMAL(14,2),
    "motivo" TEXT,
    "ventaId" TEXT,
    "usuarioId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoteHistorial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Manzana_proyectoId_nombre_key" ON "Manzana"("proyectoId", "nombre");

-- CreateIndex
CREATE INDEX "LoteHistorial_loteId_createdAt_idx" ON "LoteHistorial"("loteId", "createdAt");

-- CreateIndex
CREATE INDEX "Lote_manzanaId_idx" ON "Lote"("manzanaId");

-- CreateIndex
CREATE UNIQUE INDEX "Lote_proyectoId_manzanaId_numero_key" ON "Lote"("proyectoId", "manzanaId", "numero");

-- AddForeignKey
ALTER TABLE "Manzana" ADD CONSTRAINT "Manzana_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lote" ADD CONSTRAINT "Lote_manzanaId_fkey" FOREIGN KEY ("manzanaId") REFERENCES "Manzana"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoteHistorial" ADD CONSTRAINT "LoteHistorial_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "Lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoteHistorial" ADD CONSTRAINT "LoteHistorial_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reglas que el esquema de Prisma no expresa (agregadas a mano).
-- Los lotes sin manzana (manzanaId nulo) no quedan cubiertos por el índice único de arriba
-- (en PostgreSQL los nulos se consideran distintos entre sí), así que se agrega uno parcial:
-- dentro de un proyecto sin manzanas, el número de lote no se repite.
CREATE UNIQUE INDEX "Lote_proyecto_numero_sin_manzana_key" ON "Lote"("proyectoId", "numero") WHERE "manzanaId" IS NULL;

