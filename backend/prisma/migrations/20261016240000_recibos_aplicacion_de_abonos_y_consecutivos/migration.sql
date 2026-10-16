-- CreateEnum
CREATE TYPE "EstadoAbono" AS ENUM ('ACTIVO', 'ANULADO');

-- AlterTable
ALTER TABLE "Abono"
ADD COLUMN     "anuladoEn" TIMESTAMP(3),
ADD COLUMN     "anuladoPorId" TEXT,
ADD COLUMN     "cuentaDestinoId" TEXT,
ADD COLUMN     "estado" "EstadoAbono" NOT NULL DEFAULT 'ACTIVO',
ADD COLUMN     "motivoAnulacion" TEXT,
ADD COLUMN     "referencia" TEXT,
ADD COLUMN     "registradoPorId" TEXT;

-- AlterTable
ALTER TABLE "ConfiguracionEmpresa" ADD COLUMN     "prefijoRecibo" TEXT NOT NULL DEFAULT 'RC-';

-- CreateTable
CREATE TABLE "AplicacionAbono" (
    "id" TEXT NOT NULL,
    "abonoId" TEXT NOT NULL,
    "cuotaId" TEXT NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "AplicacionAbono_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consecutivo" (
    "serie" TEXT NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Consecutivo_pkey" PRIMARY KEY ("serie")
);

-- CreateTable
CREATE TABLE "Recibo" (
    "id" TEXT NOT NULL,
    "serie" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "numeroTexto" TEXT NOT NULL,
    "abonoId" TEXT NOT NULL,
    "esHistorico" BOOLEAN NOT NULL DEFAULT false,
    "contenido" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recibo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AplicacionAbono_abonoId_idx" ON "AplicacionAbono"("abonoId");

-- CreateIndex
CREATE INDEX "AplicacionAbono_cuotaId_idx" ON "AplicacionAbono"("cuotaId");

-- CreateIndex
CREATE UNIQUE INDEX "Recibo_numeroTexto_key" ON "Recibo"("numeroTexto");

-- CreateIndex
CREATE UNIQUE INDEX "Recibo_abonoId_key" ON "Recibo"("abonoId");

-- CreateIndex
CREATE UNIQUE INDEX "Recibo_serie_numero_key" ON "Recibo"("serie", "numero");

-- CreateIndex
CREATE INDEX "Abono_ventaId_estado_idx" ON "Abono"("ventaId", "estado");

-- AddForeignKey
ALTER TABLE "Abono" ADD CONSTRAINT "Abono_cuentaDestinoId_fkey" FOREIGN KEY ("cuentaDestinoId") REFERENCES "CuentaBancaria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Abono" ADD CONSTRAINT "Abono_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Abono" ADD CONSTRAINT "Abono_anuladoPorId_fkey" FOREIGN KEY ("anuladoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AplicacionAbono" ADD CONSTRAINT "AplicacionAbono_abonoId_fkey" FOREIGN KEY ("abonoId") REFERENCES "Abono"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AplicacionAbono" ADD CONSTRAINT "AplicacionAbono_cuotaId_fkey" FOREIGN KEY ("cuotaId") REFERENCES "Cuota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recibo" ADD CONSTRAINT "Recibo_abonoId_fkey" FOREIGN KEY ("abonoId") REFERENCES "Abono"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------
-- Cada abono existente conserva su efecto: se copia a una aplicación sobre la misma cuota.
-- Si hubiera algún abono sin cuota (no se sabría a qué cuota aplicarlo), la migración se
-- detiene en vez de perder ese dato en silencio.
-- ---------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Abono" WHERE "cuotaId" IS NULL) THEN
    RAISE EXCEPTION 'Hay abonos sin cuota asignada: aplicarlos a una cuota antes de migrar';
  END IF;
END $$;

INSERT INTO "AplicacionAbono" ("id", "abonoId", "cuotaId", "valor")
SELECT gen_random_uuid()::text, a."id", a."cuotaId", a."valor"
FROM "Abono" a
WHERE a."cuotaId" IS NOT NULL;

-- Ya copiado: se elimina la columna vieja.
ALTER TABLE "Abono" DROP CONSTRAINT "Abono_cuotaId_fkey";
ALTER TABLE "Abono" DROP COLUMN "cuotaId";

-- ---------------------------------------------------------------------------------
-- Reglas que el esquema de Prisma no expresa (agregadas a mano).
-- ---------------------------------------------------------------------------------
ALTER TABLE "Abono" ADD CONSTRAINT "Abono_valor_positivo" CHECK ("valor" > 0);
ALTER TABLE "AplicacionAbono" ADD CONSTRAINT "AplicacionAbono_valor_positivo" CHECK ("valor" > 0);
ALTER TABLE "Consecutivo" ADD CONSTRAINT "Consecutivo_ultimo_no_negativo" CHECK ("ultimo" >= 0);
ALTER TABLE "ConfiguracionEmpresa" ADD CONSTRAINT "ConfiguracionEmpresa_prefijo_recibo_valido" CHECK ("prefijoRecibo" ~ '^[A-Z0-9-]{1,10}$');

-- Un abono anulado siempre tiene quién, cuándo y por qué; uno activo no tiene datos de anulación.
ALTER TABLE "Abono" ADD CONSTRAINT "Abono_anulacion_completa" CHECK (
  ("estado" = 'ANULADO') = ("anuladoEn" IS NOT NULL AND "motivoAnulacion" IS NOT NULL AND "anuladoPorId" IS NOT NULL)
);

-- La misma referencia de transacción no puede registrarse dos veces (activa) en la misma cuenta.
CREATE UNIQUE INDEX "Abono_referencia_cuenta_activa_key"
  ON "Abono"("cuentaDestinoId", lower(btrim("referencia")))
  WHERE "estado" = 'ACTIVO' AND "referencia" IS NOT NULL AND "cuentaDestinoId" IS NOT NULL;

-- ---------------------------------------------------------------------------------
-- Inmutabilidad en la base de datos: ni la aplicación ni alguien con acceso directo pueden
-- editar o borrar un recibo emitido, borrar un abono o editarlo (solo se anula), ni tocar
-- cómo se aplicó un abono. Una corrección se hace anulando y registrando de nuevo.
-- ---------------------------------------------------------------------------------
CREATE FUNCTION "proteger_solo_insercion"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Los registros de % no se pueden editar ni borrar', TG_TABLE_NAME;
END
$$;

CREATE TRIGGER "Recibo_inmutable" BEFORE UPDATE OR DELETE ON "Recibo"
  FOR EACH ROW EXECUTE FUNCTION "proteger_solo_insercion"();
CREATE TRIGGER "AplicacionAbono_inmutable" BEFORE UPDATE OR DELETE ON "AplicacionAbono"
  FOR EACH ROW EXECUTE FUNCTION "proteger_solo_insercion"();

CREATE FUNCTION "proteger_abono"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Un abono no se puede borrar: se anula indicando el motivo';
  END IF;
  IF NEW."ventaId" IS DISTINCT FROM OLD."ventaId"
     OR NEW."fecha" IS DISTINCT FROM OLD."fecha"
     OR NEW."valor" IS DISTINCT FROM OLD."valor"
     OR NEW."medioPago" IS DISTINCT FROM OLD."medioPago"
     OR NEW."cuentaDestinoId" IS DISTINCT FROM OLD."cuentaDestinoId"
     OR NEW."referencia" IS DISTINCT FROM OLD."referencia"
     OR NEW."comprobanteUrl" IS DISTINCT FROM OLD."comprobanteUrl"
     OR NEW."registradoPorId" IS DISTINCT FROM OLD."registradoPorId" THEN
    RAISE EXCEPTION 'Un abono no se puede editar: si hay un error, se anula y se registra uno nuevo';
  END IF;
  IF OLD."estado" = 'ANULADO' AND (
       NEW."estado" IS DISTINCT FROM OLD."estado"
       OR NEW."anuladoPorId" IS DISTINCT FROM OLD."anuladoPorId"
       OR NEW."anuladoEn" IS DISTINCT FROM OLD."anuladoEn"
       OR NEW."motivoAnulacion" IS DISTINCT FROM OLD."motivoAnulacion") THEN
    RAISE EXCEPTION 'Un abono anulado no se puede modificar';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "Abono_protegido" BEFORE UPDATE OR DELETE ON "Abono"
  FOR EACH ROW EXECUTE FUNCTION "proteger_abono"();

-- El gerente recibe el permiso nuevo de anular recibos (la app también lo sincroniza al arrancar).
UPDATE "RolUsuario"
SET "permisos" = array_append("permisos", 'abonos.anular')
WHERE "clave" = 'GERENTE' AND NOT ('abonos.anular' = ANY("permisos"));

