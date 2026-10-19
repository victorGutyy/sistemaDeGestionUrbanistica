-- CreateTable
CREATE TABLE "RegistroAuditoria" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" TEXT NOT NULL,
    "usuarioNombre" TEXT NOT NULL,
    "usuarioEmail" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT,
    "resumen" TEXT NOT NULL,
    "antes" JSONB,
    "despues" JSONB,

    CONSTRAINT "RegistroAuditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RegistroAuditoria_createdAt_idx" ON "RegistroAuditoria"("createdAt");

-- CreateIndex
CREATE INDEX "RegistroAuditoria_usuarioId_createdAt_idx" ON "RegistroAuditoria"("usuarioId", "createdAt");

-- CreateIndex
CREATE INDEX "RegistroAuditoria_entidad_createdAt_idx" ON "RegistroAuditoria"("entidad", "createdAt");

-- CreateIndex
CREATE INDEX "RegistroAuditoria_entidad_entidadId_idx" ON "RegistroAuditoria"("entidad", "entidadId");

-- AddForeignKey
ALTER TABLE "RegistroAuditoria" ADD CONSTRAINT "RegistroAuditoria_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------
-- Reglas que el esquema de Prisma no expresa (agregadas a mano).
-- ---------------------------------------------------------------------------------
ALTER TABLE "RegistroAuditoria" ADD CONSTRAINT "RegistroAuditoria_resumen_no_vacio" CHECK (btrim("resumen") <> '');

-- RF-AUD-03: nadie edita ni borra la auditoría, ni siquiera con acceso directo a la base de datos
-- (la función ya existe desde la migración de recibos).
CREATE TRIGGER "RegistroAuditoria_inmutable" BEFORE UPDATE OR DELETE ON "RegistroAuditoria"
  FOR EACH ROW EXECUTE FUNCTION "proteger_solo_insercion"();

-- Solo el gerente consulta la auditoría (la app también sincroniza los roles del sistema al arrancar).
UPDATE "RolUsuario"
SET "permisos" = array_append("permisos", 'auditoria.ver')
WHERE "clave" = 'GERENTE' AND NOT ('auditoria.ver' = ANY("permisos"));

