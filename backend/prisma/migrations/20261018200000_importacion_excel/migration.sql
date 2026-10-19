-- CreateTable
CREATE TABLE "Importacion" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" TEXT NOT NULL,
    "nombreArchivo" TEXT NOT NULL,
    "huella" TEXT NOT NULL,
    "resumen" JSONB NOT NULL,
    "conciliacion" JSONB NOT NULL,

    CONSTRAINT "Importacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Importacion_huella_key" ON "Importacion"("huella");

-- CreateIndex
CREATE INDEX "Importacion_createdAt_idx" ON "Importacion"("createdAt");

-- AddForeignKey
ALTER TABLE "Importacion" ADD CONSTRAINT "Importacion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------
-- Reglas que el esquema de Prisma no expresa (agregadas a mano).
-- ---------------------------------------------------------------------------------

-- Una importación solo se inserta: no se edita ni se borra (la función ya existe desde la migración de recibos).
CREATE TRIGGER "Importacion_inmutable" BEFORE UPDATE OR DELETE ON "Importacion"
  FOR EACH ROW EXECUTE FUNCTION "proteger_solo_insercion"();

-- Solo el gerente importa datos (la app también sincroniza los roles del sistema al arrancar).
UPDATE "RolUsuario"
SET "permisos" = array_append("permisos", 'importacion.gestionar')
WHERE "clave" = 'GERENTE' AND NOT ('importacion.gestionar' = ANY("permisos"));
