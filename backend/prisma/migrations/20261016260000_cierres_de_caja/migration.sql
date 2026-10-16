-- CreateEnum
CREATE TYPE "TipoCierre" AS ENUM ('DIARIO', 'SEMANAL', 'QUINCENAL');

-- CreateEnum
CREATE TYPE "EstadoCierre" AS ENUM ('BORRADOR', 'CERRADO', 'APROBADO', 'DEVUELTO');

-- CreateTable
CREATE TABLE "CierreCaja" (
    "id" TEXT NOT NULL,
    "numero" INTEGER,
    "numeroTexto" TEXT,
    "tipo" "TipoCierre" NOT NULL,
    "desde" DATE NOT NULL,
    "hasta" DATE NOT NULL,
    "estado" "EstadoCierre" NOT NULL DEFAULT 'BORRADOR',
    "efectivoInicial" DECIMAL(14,2) NOT NULL,
    "efectivoEsperado" DECIMAL(14,2),
    "efectivoContado" DECIMAL(14,2),
    "diferencia" DECIMAL(14,2),
    "explicacionDiferencia" TEXT,
    "contenido" JSONB,
    "creadoPorId" TEXT NOT NULL,
    "cerradoPorId" TEXT,
    "cerradoEn" TIMESTAMP(3),
    "resueltoPorId" TEXT,
    "resueltoEn" TIMESTAMP(3),
    "observacionGerente" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CierreCaja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CierreCajaHistorial" (
    "id" TEXT NOT NULL,
    "cierreId" TEXT NOT NULL,
    "estadoAnterior" "EstadoCierre",
    "estadoNuevo" "EstadoCierre" NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "observacion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CierreCajaHistorial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CierreCaja_numero_key" ON "CierreCaja"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "CierreCaja_numeroTexto_key" ON "CierreCaja"("numeroTexto");

-- CreateIndex
CREATE INDEX "CierreCaja_estado_idx" ON "CierreCaja"("estado");

-- CreateIndex
CREATE INDEX "CierreCaja_desde_hasta_idx" ON "CierreCaja"("desde", "hasta");

-- CreateIndex
CREATE INDEX "CierreCajaHistorial_cierreId_idx" ON "CierreCajaHistorial"("cierreId");

-- AddForeignKey
ALTER TABLE "CierreCaja" ADD CONSTRAINT "CierreCaja_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CierreCaja" ADD CONSTRAINT "CierreCaja_cerradoPorId_fkey" FOREIGN KEY ("cerradoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CierreCaja" ADD CONSTRAINT "CierreCaja_resueltoPorId_fkey" FOREIGN KEY ("resueltoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CierreCajaHistorial" ADD CONSTRAINT "CierreCajaHistorial_cierreId_fkey" FOREIGN KEY ("cierreId") REFERENCES "CierreCaja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CierreCajaHistorial" ADD CONSTRAINT "CierreCajaHistorial_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------
-- Reglas que el esquema de Prisma no expresa (agregadas a mano).
-- ---------------------------------------------------------------------------------
ALTER TABLE "CierreCaja" ADD CONSTRAINT "CierreCaja_periodo_valido" CHECK ("desde" <= "hasta");
ALTER TABLE "CierreCaja" ADD CONSTRAINT "CierreCaja_efectivo_inicial_no_negativo" CHECK ("efectivoInicial" >= 0);

-- Dos cierres no pueden cubrir el mismo día: los períodos son consecutivos y sin solapes.
ALTER TABLE "CierreCaja" ADD CONSTRAINT "CierreCaja_sin_solape"
  EXCLUDE USING gist (daterange("desde", "hasta", '[]') WITH &&);

-- El número se asigna al cerrar por primera vez: un borrador no lo tiene y todo lo demás sí.
ALTER TABLE "CierreCaja" ADD CONSTRAINT "CierreCaja_numero_segun_estado" CHECK (
  ("estado" = 'BORRADOR') = ("numero" IS NULL AND "numeroTexto" IS NULL)
);

-- Un borrador no tiene efectivo contado ni fotografía; un cierre cerrado (o resuelto) tiene todo completo.
ALTER TABLE "CierreCaja" ADD CONSTRAINT "CierreCaja_cierre_completo" CHECK (
  ("estado" = 'BORRADOR' AND "efectivoEsperado" IS NULL AND "efectivoContado" IS NULL AND "diferencia" IS NULL
     AND "contenido" IS NULL AND "cerradoPorId" IS NULL AND "cerradoEn" IS NULL)
  OR ("estado" <> 'BORRADOR' AND "efectivoEsperado" IS NOT NULL AND "efectivoContado" IS NOT NULL AND "diferencia" IS NOT NULL
     AND "contenido" IS NOT NULL AND "cerradoPorId" IS NOT NULL AND "cerradoEn" IS NOT NULL)
);

-- La diferencia es siempre lo contado menos lo esperado, y si no es cero hay que explicarla.
ALTER TABLE "CierreCaja" ADD CONSTRAINT "CierreCaja_diferencia_coherente" CHECK (
  "diferencia" IS NULL OR "diferencia" = "efectivoContado" - "efectivoEsperado"
);
ALTER TABLE "CierreCaja" ADD CONSTRAINT "CierreCaja_diferencia_explicada" CHECK (
  "diferencia" IS NULL OR "diferencia" = 0 OR ("explicacionDiferencia" IS NOT NULL AND btrim("explicacionDiferencia") <> '')
);

-- Aprobado o devuelto lleva quién y cuándo lo resolvió; devuelto, además, la observación del gerente.
ALTER TABLE "CierreCaja" ADD CONSTRAINT "CierreCaja_resolucion_completa" CHECK (
  ("estado" IN ('APROBADO', 'DEVUELTO')) = ("resueltoPorId" IS NOT NULL AND "resueltoEn" IS NOT NULL)
);
ALTER TABLE "CierreCaja" ADD CONSTRAINT "CierreCaja_devuelto_con_observacion" CHECK (
  "estado" <> 'DEVUELTO' OR ("observacionGerente" IS NOT NULL AND btrim("observacionGerente") <> '')
);

-- ---------------------------------------------------------------------------------
-- Inmutabilidad en la base de datos: el flujo del cierre es el único camino permitido.
--   borrador -> cerrado | cerrado -> aprobado o devuelto | devuelto -> cerrado | aprobado: no cambia nunca.
-- Solo un borrador se puede descartar; el período, el tipo y el efectivo inicial no cambian jamás.
-- ---------------------------------------------------------------------------------
CREATE FUNCTION "proteger_cierre_caja"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."estado" <> 'BORRADOR' THEN
      RAISE EXCEPTION 'Solo se puede descartar un cierre de caja en borrador';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD."estado" = 'APROBADO' THEN
    RAISE EXCEPTION 'Un cierre de caja aprobado no se puede modificar';
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."tipo" IS DISTINCT FROM OLD."tipo"
     OR NEW."desde" IS DISTINCT FROM OLD."desde"
     OR NEW."hasta" IS DISTINCT FROM OLD."hasta"
     OR NEW."efectivoInicial" IS DISTINCT FROM OLD."efectivoInicial"
     OR NEW."creadoPorId" IS DISTINCT FROM OLD."creadoPorId" THEN
    RAISE EXCEPTION 'El período, el tipo y el efectivo inicial de un cierre de caja no se pueden cambiar';
  END IF;

  IF OLD."estado" = 'BORRADOR' AND NEW."estado" NOT IN ('BORRADOR', 'CERRADO') THEN
    RAISE EXCEPTION 'Un cierre de caja en borrador solo se puede cerrar';
  END IF;
  IF OLD."estado" = 'CERRADO' THEN
    IF NEW."estado" NOT IN ('APROBADO', 'DEVUELTO') THEN
      RAISE EXCEPTION 'Un cierre de caja cerrado solo se puede aprobar o devolver';
    END IF;
    IF NEW."numero" IS DISTINCT FROM OLD."numero"
       OR NEW."contenido" IS DISTINCT FROM OLD."contenido"
       OR NEW."efectivoEsperado" IS DISTINCT FROM OLD."efectivoEsperado"
       OR NEW."efectivoContado" IS DISTINCT FROM OLD."efectivoContado"
       OR NEW."diferencia" IS DISTINCT FROM OLD."diferencia"
       OR NEW."explicacionDiferencia" IS DISTINCT FROM OLD."explicacionDiferencia"
       OR NEW."cerradoPorId" IS DISTINCT FROM OLD."cerradoPorId"
       OR NEW."cerradoEn" IS DISTINCT FROM OLD."cerradoEn" THEN
      RAISE EXCEPTION 'Los datos de un cierre de caja cerrado no se pueden cambiar: el gerente lo aprueba o lo devuelve';
    END IF;
  END IF;
  IF OLD."estado" = 'DEVUELTO' THEN
    IF NEW."estado" <> 'CERRADO' THEN
      RAISE EXCEPTION 'Un cierre de caja devuelto solo se puede volver a cerrar';
    END IF;
    IF NEW."numero" IS DISTINCT FROM OLD."numero" THEN
      RAISE EXCEPTION 'El número de un cierre de caja no se puede cambiar';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "CierreCaja_protegido" BEFORE UPDATE OR DELETE ON "CierreCaja"
  FOR EACH ROW EXECUTE FUNCTION "proteger_cierre_caja"();

-- El historial de pasos solo se agrega (la función ya existe desde la migración de recibos).
CREATE TRIGGER "CierreCajaHistorial_inmutable" BEFORE UPDATE OR DELETE ON "CierreCajaHistorial"
  FOR EACH ROW EXECUTE FUNCTION "proteger_solo_insercion"();

-- Permisos nuevos: el gerente tiene los tres; el administrador ve y cierra, pero no aprueba
-- (la app también sincroniza los roles del sistema al arrancar).
UPDATE "RolUsuario"
SET "permisos" = "permisos" || ARRAY(SELECT p FROM unnest(ARRAY['caja.ver', 'caja.cerrar', 'caja.aprobar']) AS p WHERE NOT (p = ANY("permisos")))
WHERE "clave" = 'GERENTE';
UPDATE "RolUsuario"
SET "permisos" = "permisos" || ARRAY(SELECT p FROM unnest(ARRAY['caja.ver', 'caja.cerrar']) AS p WHERE NOT (p = ANY("permisos")))
WHERE "clave" = 'ADMINISTRADOR';

