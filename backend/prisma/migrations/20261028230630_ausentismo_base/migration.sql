-- CreateEnum
CREATE TYPE "ReglaAusentismo" AS ENUM ('INCAPACIDAD_GENERAL', 'ORIGEN_LABORAL', 'PAGA_EPS', 'PAGA_EMPLEADOR', 'DESCUENTO');

-- CreateEnum
CREATE TYPE "EstadoRecobro" AS ENUM ('PENDIENTE', 'RADICADA', 'PAGADA', 'RECHAZADA');

-- CreateEnum
CREATE TYPE "EntidadRecobro" AS ENUM ('EPS', 'ARL', 'AFP');

-- AlterTable
ALTER TABLE "DocumentoSst" ADD COLUMN     "ausentismoId" TEXT;

-- CreateTable
CREATE TABLE "TipoAusentismo" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "regla" "ReglaAusentismo" NOT NULL,
    "porcentaje" DECIMAL(5,2),
    "requiereDiagnostico" BOOLEAN NOT NULL DEFAULT false,
    "diaEventoComoLaborado" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TipoAusentismo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticoCie10" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiagnosticoCie10_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ausentismo" (
    "id" TEXT NOT NULL,
    "trabajadorId" TEXT NOT NULL,
    "tipoId" TEXT NOT NULL,
    "fechaInicio" TIMESTAMP(3) NOT NULL,
    "fechaFin" TIMESTAMP(3) NOT NULL,
    "dias" INTEGER NOT NULL,
    "anio" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "numeroDocumento" TEXT,
    "esProrroga" BOOLEAN NOT NULL DEFAULT false,
    "prorrogaDeId" TEXT,
    "diasPrevios" INTEGER NOT NULL DEFAULT 0,
    "diagnosticoId" TEXT,
    "observaciones" TEXT,
    "cargoFoto" TEXT NOT NULL,
    "salarioFoto" DECIMAL(14,2) NOT NULL,
    "epsFoto" TEXT,
    "arlFoto" TEXT,
    "afpFoto" TEXT,
    "baseDiaria" DECIMAL(14,2) NOT NULL,
    "pisoDiario" DECIMAL(14,2) NOT NULL,
    "parametrosLiquidacion" JSONB NOT NULL,
    "liquidacionCalculada" JSONB NOT NULL,
    "corregida" BOOLEAN NOT NULL DEFAULT false,
    "motivoCorreccion" TEXT,
    "corregidaEn" TIMESTAMP(3),
    "corregidaPorId" TEXT,
    "anulada" BOOLEAN NOT NULL DEFAULT false,
    "anuladaEn" TIMESTAMP(3),
    "anuladaPorId" TEXT,
    "motivoAnulacion" TEXT,
    "registradaPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ausentismo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AusentismoPeriodo" (
    "id" TEXT NOT NULL,
    "ausentismoId" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "dias" INTEGER NOT NULL,
    "diasEmpleador" INTEGER NOT NULL DEFAULT 0,
    "diasEps" INTEGER NOT NULL DEFAULT 0,
    "diasArl" INTEGER NOT NULL DEFAULT 0,
    "diasAfp" INTEGER NOT NULL DEFAULT 0,
    "diasLaborados" INTEGER NOT NULL DEFAULT 0,
    "diasDescuento" INTEGER NOT NULL DEFAULT 0,
    "valorEmpleador" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valorEps" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valorArl" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valorAfp" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valorDescuento" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AusentismoPeriodo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecobroAusentismo" (
    "id" TEXT NOT NULL,
    "ausentismoId" TEXT NOT NULL,
    "entidad" "EntidadRecobro" NOT NULL,
    "estado" "EstadoRecobro" NOT NULL DEFAULT 'PENDIENTE',
    "valorReconocido" DECIMAL(14,2),
    "fechaRadicacion" TIMESTAMP(3),
    "fechaPago" TIMESTAMP(3),
    "observaciones" TEXT,
    "actualizadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecobroAusentismo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TipoAusentismo_codigo_key" ON "TipoAusentismo"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "TipoAusentismo_nombre_key" ON "TipoAusentismo"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "DiagnosticoCie10_codigo_key" ON "DiagnosticoCie10"("codigo");

-- CreateIndex
CREATE INDEX "Ausentismo_trabajadorId_fechaInicio_idx" ON "Ausentismo"("trabajadorId", "fechaInicio");

-- CreateIndex
CREATE INDEX "Ausentismo_anio_mes_idx" ON "Ausentismo"("anio", "mes");

-- CreateIndex
CREATE INDEX "Ausentismo_prorrogaDeId_idx" ON "Ausentismo"("prorrogaDeId");

-- CreateIndex
CREATE INDEX "AusentismoPeriodo_anio_mes_idx" ON "AusentismoPeriodo"("anio", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "AusentismoPeriodo_ausentismoId_anio_mes_key" ON "AusentismoPeriodo"("ausentismoId", "anio", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "RecobroAusentismo_ausentismoId_entidad_key" ON "RecobroAusentismo"("ausentismoId", "entidad");

-- CreateIndex
CREATE INDEX "DocumentoSst_ausentismoId_idx" ON "DocumentoSst"("ausentismoId");

-- AddForeignKey
ALTER TABLE "DocumentoSst" ADD CONSTRAINT "DocumentoSst_ausentismoId_fkey" FOREIGN KEY ("ausentismoId") REFERENCES "Ausentismo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ausentismo" ADD CONSTRAINT "Ausentismo_trabajadorId_fkey" FOREIGN KEY ("trabajadorId") REFERENCES "Trabajador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ausentismo" ADD CONSTRAINT "Ausentismo_tipoId_fkey" FOREIGN KEY ("tipoId") REFERENCES "TipoAusentismo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ausentismo" ADD CONSTRAINT "Ausentismo_prorrogaDeId_fkey" FOREIGN KEY ("prorrogaDeId") REFERENCES "Ausentismo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ausentismo" ADD CONSTRAINT "Ausentismo_diagnosticoId_fkey" FOREIGN KEY ("diagnosticoId") REFERENCES "DiagnosticoCie10"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ausentismo" ADD CONSTRAINT "Ausentismo_corregidaPorId_fkey" FOREIGN KEY ("corregidaPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ausentismo" ADD CONSTRAINT "Ausentismo_anuladaPorId_fkey" FOREIGN KEY ("anuladaPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ausentismo" ADD CONSTRAINT "Ausentismo_registradaPorId_fkey" FOREIGN KEY ("registradaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AusentismoPeriodo" ADD CONSTRAINT "AusentismoPeriodo_ausentismoId_fkey" FOREIGN KEY ("ausentismoId") REFERENCES "Ausentismo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecobroAusentismo" ADD CONSTRAINT "RecobroAusentismo_ausentismoId_fkey" FOREIGN KEY ("ausentismoId") REFERENCES "Ausentismo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecobroAusentismo" ADD CONSTRAINT "RecobroAusentismo_actualizadoPorId_fkey" FOREIGN KEY ("actualizadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------
-- Reglas que el esquema de Prisma no expresa (agregadas a mano). Esta migración solo agrega tablas y una columna: lo
-- único que reemplaza es la regla "un solo dueño" de DocumentoSst, que ahora admite un cuarto dueño (el ausentismo).
-- ---------------------------------------------------------------------------------

-- Tipos de ausentismo (RF-CFG-14): clave en mayúsculas, nombre obligatorio, porcentaje solo en las reglas que lo usan
-- (de 0 a 100) y el día del evento como laborado solo en las de origen laboral.
ALTER TABLE "TipoAusentismo" ADD CONSTRAINT "TipoAusentismo_codigo_valido" CHECK ("codigo" ~ '^[A-Z][A-Z0-9_]*$');
ALTER TABLE "TipoAusentismo" ADD CONSTRAINT "TipoAusentismo_nombre_no_vacio" CHECK (btrim("nombre") <> '');
ALTER TABLE "TipoAusentismo" ADD CONSTRAINT "TipoAusentismo_porcentaje_segun_regla" CHECK (
  ("regla" IN ('PAGA_EPS', 'PAGA_EMPLEADOR', 'DESCUENTO') AND "porcentaje" IS NOT NULL AND "porcentaje" BETWEEN 0 AND 100)
  OR ("regla" IN ('INCAPACIDAD_GENERAL', 'ORIGEN_LABORAL') AND "porcentaje" IS NULL)
);
ALTER TABLE "TipoAusentismo" ADD CONSTRAINT "TipoAusentismo_dia_evento_solo_laboral" CHECK (NOT "diaEventoComoLaborado" OR "regla" = 'ORIGEN_LABORAL');

-- La clave y la regla de un tipo no cambian: los ausentismos ya liquidados con él perderían su sentido. Se desactiva y se
-- crea otro.
CREATE FUNCTION "proteger_tipo_ausentismo"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."codigo" IS DISTINCT FROM OLD."codigo" OR NEW."regla" IS DISTINCT FROM OLD."regla" THEN
    RAISE EXCEPTION 'La clave y la regla de un tipo de ausentismo no se pueden cambiar: desactívalo y crea otro';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "TipoAusentismo_protegido" BEFORE UPDATE ON "TipoAusentismo"
  FOR EACH ROW EXECUTE FUNCTION "proteger_tipo_ausentismo"();

-- Diagnósticos CIE-10: código con la forma del CIE-10 (letra, dos dígitos y, opcional, punto y uno o dos caracteres) y
-- descripción obligatoria. El código no cambia: los ausentismos lo referencian.
ALTER TABLE "DiagnosticoCie10" ADD CONSTRAINT "DiagnosticoCie10_codigo_valido" CHECK ("codigo" ~ '^[A-Z][0-9]{2}(\.[0-9A-Z]{1,2})?$');
ALTER TABLE "DiagnosticoCie10" ADD CONSTRAINT "DiagnosticoCie10_descripcion_no_vacia" CHECK (btrim("descripcion") <> '');

CREATE FUNCTION "proteger_diagnostico_cie10"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."codigo" IS DISTINCT FROM OLD."codigo" THEN
    RAISE EXCEPTION 'El código de un diagnóstico no se puede cambiar: desactívalo y crea el correcto';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "DiagnosticoCie10_protegido" BEFORE UPDATE ON "DiagnosticoCie10"
  FOR EACH ROW EXECUTE FUNCTION "proteger_diagnostico_cie10"();

-- Ausentismo (RF-SST-01 a 03): fechas en orden, días calendario que cuadran con las fechas, mes y año de inicio, prórroga
-- coherente, valores sin signo, y anulación y corrección completas (fecha, quién y motivo, o nada).
ALTER TABLE "Ausentismo" ADD CONSTRAINT "Ausentismo_fechas_en_orden" CHECK ("fechaFin" >= "fechaInicio");
ALTER TABLE "Ausentismo" ADD CONSTRAINT "Ausentismo_dias_cuadran" CHECK ("dias" >= 1 AND "dias" = ("fechaFin"::date - "fechaInicio"::date) + 1);
ALTER TABLE "Ausentismo" ADD CONSTRAINT "Ausentismo_anio_mes_validos" CHECK (
  "mes" BETWEEN 1 AND 12 AND "anio" = EXTRACT(YEAR FROM "fechaInicio")::int AND "mes" = EXTRACT(MONTH FROM "fechaInicio")::int
);
ALTER TABLE "Ausentismo" ADD CONSTRAINT "Ausentismo_prorroga_coherente" CHECK (
  "diasPrevios" >= 0
  AND ("prorrogaDeId" IS NULL OR ("esProrroga" AND "prorrogaDeId" <> "id"))
  AND ("esProrroga" OR "diasPrevios" = 0)
);
ALTER TABLE "Ausentismo" ADD CONSTRAINT "Ausentismo_valores_validos" CHECK ("salarioFoto" >= 0 AND "baseDiaria" >= 0 AND "pisoDiario" >= 0);
ALTER TABLE "Ausentismo" ADD CONSTRAINT "Ausentismo_textos_validos" CHECK (
  btrim("cargoFoto") <> '' AND ("numeroDocumento" IS NULL OR btrim("numeroDocumento") <> '')
);
ALTER TABLE "Ausentismo" ADD CONSTRAINT "Ausentismo_correccion_completa" CHECK (
  ("corregida" AND "corregidaEn" IS NOT NULL AND "corregidaPorId" IS NOT NULL AND "motivoCorreccion" IS NOT NULL AND btrim("motivoCorreccion") <> '')
  OR (NOT "corregida" AND "corregidaEn" IS NULL AND "corregidaPorId" IS NULL AND "motivoCorreccion" IS NULL)
);
ALTER TABLE "Ausentismo" ADD CONSTRAINT "Ausentismo_anulacion_completa" CHECK (
  ("anulada" AND "anuladaEn" IS NOT NULL AND "anuladaPorId" IS NOT NULL AND "motivoAnulacion" IS NOT NULL AND btrim("motivoAnulacion") <> '')
  OR (NOT "anulada" AND "anuladaEn" IS NULL AND "anuladaPorId" IS NULL AND "motivoAnulacion" IS NULL)
);

-- Reglas que dependen de otras filas, para que valgan aunque alguien escriba directo en la base de datos:
--  - un tipo que exige diagnóstico no se guarda sin él (RF-SST-02);
--  - un trabajador no tiene dos ausentismos vigentes que se traslapen (RF-SST-02), con un bloqueo por trabajador para que
--    dos registros simultáneos no se crucen;
--  - la prórroga continúa un ausentismo del mismo trabajador.
-- Y para que un ausentismo no se edite ni se borre: no cambian el trabajador, el tipo, las fechas, la foto ni la
-- liquidación calculada; solo se anula (una vez, con motivo), se corrige la liquidación o se completan el número, el
-- diagnóstico y las observaciones. Uno anulado ya no cambia.
CREATE FUNCTION "proteger_ausentismo"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  exige_diagnostico boolean;
BEGIN
  SELECT "requiereDiagnostico" INTO exige_diagnostico FROM "TipoAusentismo" WHERE "id" = NEW."tipoId";

  IF TG_OP = 'INSERT' THEN
    IF exige_diagnostico AND NEW."diagnosticoId" IS NULL THEN
      RAISE EXCEPTION 'Este tipo de ausentismo exige el diagnóstico CIE-10';
    END IF;
    IF NEW."prorrogaDeId" IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM "Ausentismo" p WHERE p."id" = NEW."prorrogaDeId" AND p."trabajadorId" = NEW."trabajadorId"
    ) THEN
      RAISE EXCEPTION 'Una prórroga debe continuar un ausentismo del mismo trabajador';
    END IF;
    IF NOT NEW."anulada" THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('ausentismo:' || NEW."trabajadorId", 0));
      IF EXISTS (
        SELECT 1 FROM "Ausentismo" a
        WHERE a."trabajadorId" = NEW."trabajadorId" AND NOT a."anulada" AND a."id" <> NEW."id"
          AND a."fechaInicio" <= NEW."fechaFin" AND a."fechaFin" >= NEW."fechaInicio"
      ) THEN
        RAISE EXCEPTION 'El trabajador ya tiene un ausentismo en esas fechas';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF OLD."anulada" THEN
    RAISE EXCEPTION 'Un ausentismo anulado no se puede modificar';
  END IF;
  IF NEW."trabajadorId" IS DISTINCT FROM OLD."trabajadorId"
     OR NEW."tipoId" IS DISTINCT FROM OLD."tipoId"
     OR NEW."fechaInicio" IS DISTINCT FROM OLD."fechaInicio"
     OR NEW."fechaFin" IS DISTINCT FROM OLD."fechaFin"
     OR NEW."dias" IS DISTINCT FROM OLD."dias"
     OR NEW."anio" IS DISTINCT FROM OLD."anio"
     OR NEW."mes" IS DISTINCT FROM OLD."mes"
     OR NEW."esProrroga" IS DISTINCT FROM OLD."esProrroga"
     OR NEW."prorrogaDeId" IS DISTINCT FROM OLD."prorrogaDeId"
     OR NEW."diasPrevios" IS DISTINCT FROM OLD."diasPrevios"
     OR NEW."cargoFoto" IS DISTINCT FROM OLD."cargoFoto"
     OR NEW."salarioFoto" IS DISTINCT FROM OLD."salarioFoto"
     OR NEW."epsFoto" IS DISTINCT FROM OLD."epsFoto"
     OR NEW."arlFoto" IS DISTINCT FROM OLD."arlFoto"
     OR NEW."afpFoto" IS DISTINCT FROM OLD."afpFoto"
     OR NEW."baseDiaria" IS DISTINCT FROM OLD."baseDiaria"
     OR NEW."pisoDiario" IS DISTINCT FROM OLD."pisoDiario"
     OR NEW."parametrosLiquidacion" IS DISTINCT FROM OLD."parametrosLiquidacion"
     OR NEW."liquidacionCalculada" IS DISTINCT FROM OLD."liquidacionCalculada"
     OR NEW."registradaPorId" IS DISTINCT FROM OLD."registradaPorId"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'Un ausentismo no se puede editar: se anula con motivo y se registra de nuevo';
  END IF;
  IF OLD."corregida" AND NOT NEW."corregida" THEN
    RAISE EXCEPTION 'Una corrección de la liquidación no se puede deshacer: se corrige de nuevo con su motivo';
  END IF;
  IF NOT NEW."anulada" AND exige_diagnostico AND NEW."diagnosticoId" IS NULL THEN
    RAISE EXCEPTION 'Este tipo de ausentismo exige el diagnóstico CIE-10';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "Ausentismo_protegido" BEFORE INSERT OR UPDATE ON "Ausentismo"
  FOR EACH ROW EXECUTE FUNCTION "proteger_ausentismo"();

-- La parte de cada mes (RF-SST-06): mes y año válidos, días y valores sin signo, y los días de cada pagador suman los días
-- del período. Mes, año y total de días no cambian; los valores y la distribución sí (corrección manual, RF-SST-08), salvo
-- en un ausentismo anulado.
ALTER TABLE "AusentismoPeriodo" ADD CONSTRAINT "AusentismoPeriodo_mes_valido" CHECK ("mes" BETWEEN 1 AND 12 AND "anio" BETWEEN 2000 AND 2100);
ALTER TABLE "AusentismoPeriodo" ADD CONSTRAINT "AusentismoPeriodo_dias_validos" CHECK (
  "dias" >= 1 AND "diasEmpleador" >= 0 AND "diasEps" >= 0 AND "diasArl" >= 0 AND "diasAfp" >= 0 AND "diasLaborados" >= 0 AND "diasDescuento" >= 0
  AND "diasEmpleador" + "diasEps" + "diasArl" + "diasAfp" + "diasLaborados" + "diasDescuento" = "dias"
);
ALTER TABLE "AusentismoPeriodo" ADD CONSTRAINT "AusentismoPeriodo_valores_validos" CHECK (
  "valorEmpleador" >= 0 AND "valorEps" >= 0 AND "valorArl" >= 0 AND "valorAfp" >= 0 AND "valorDescuento" >= 0
);

CREATE FUNCTION "proteger_periodo_ausentismo"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."ausentismoId" IS DISTINCT FROM OLD."ausentismoId" OR NEW."anio" IS DISTINCT FROM OLD."anio"
     OR NEW."mes" IS DISTINCT FROM OLD."mes" OR NEW."dias" IS DISTINCT FROM OLD."dias" THEN
    RAISE EXCEPTION 'El ausentismo, el mes y el total de días de un período no se pueden cambiar';
  END IF;
  IF EXISTS (SELECT 1 FROM "Ausentismo" WHERE "id" = OLD."ausentismoId" AND "anulada") THEN
    RAISE EXCEPTION 'Un ausentismo anulado no se puede modificar';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "AusentismoPeriodo_protegido" BEFORE UPDATE ON "AusentismoPeriodo"
  FOR EACH ROW EXECUTE FUNCTION "proteger_periodo_ausentismo"();

-- Recobro (RF-SST-09): cada estado exige sus datos. Pendiente no tiene fechas; radicada tiene la de radicación; pagada tiene
-- las dos y el valor reconocido; rechazada tiene la de radicación y el motivo en las observaciones. El pago no es anterior
-- a la radicación.
ALTER TABLE "RecobroAusentismo" ADD CONSTRAINT "Recobro_valor_valido" CHECK ("valorReconocido" IS NULL OR "valorReconocido" >= 0);
ALTER TABLE "RecobroAusentismo" ADD CONSTRAINT "Recobro_estado_coherente" CHECK (
  ("estado" = 'PENDIENTE' AND "fechaRadicacion" IS NULL AND "fechaPago" IS NULL)
  OR ("estado" = 'RADICADA' AND "fechaRadicacion" IS NOT NULL AND "fechaPago" IS NULL)
  OR ("estado" = 'PAGADA' AND "fechaRadicacion" IS NOT NULL AND "fechaPago" IS NOT NULL AND "valorReconocido" IS NOT NULL AND "fechaPago" >= "fechaRadicacion")
  OR ("estado" = 'RECHAZADA' AND "fechaRadicacion" IS NOT NULL AND "fechaPago" IS NULL AND "observaciones" IS NOT NULL AND btrim("observaciones") <> '')
);

CREATE FUNCTION "proteger_recobro"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."ausentismoId" IS DISTINCT FROM OLD."ausentismoId" OR NEW."entidad" IS DISTINCT FROM OLD."entidad" THEN
    RAISE EXCEPTION 'El ausentismo y la entidad de un recobro no se pueden cambiar';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "RecobroAusentismo_protegido" BEFORE UPDATE ON "RecobroAusentismo"
  FOR EACH ROW EXECUTE FUNCTION "proteger_recobro"();

-- El adjunto SST ahora pertenece a exactamente uno de cuatro registros (el certificado de un ausentismo es el cuarto).
ALTER TABLE "DocumentoSst" DROP CONSTRAINT "DocumentoSst_un_solo_dueno";
ALTER TABLE "DocumentoSst" ADD CONSTRAINT "DocumentoSst_un_solo_dueno" CHECK (
  ("entregaEppId" IS NOT NULL)::int + ("actividadPlanId" IS NOT NULL)::int + ("capacitacionId" IS NOT NULL)::int + ("ausentismoId" IS NOT NULL)::int = 1
);

-- La información no se borra (CLAUDE.md): ni los tipos, ni los diagnósticos, ni los ausentismos, ni sus períodos, ni sus
-- recobros. Los tipos y diagnósticos se desactivan; los ausentismos se anulan con motivo.
CREATE TRIGGER "TipoAusentismo_sin_borrado" BEFORE DELETE ON "TipoAusentismo"
  FOR EACH ROW EXECUTE FUNCTION "proteger_gestion_sst"();
CREATE TRIGGER "DiagnosticoCie10_sin_borrado" BEFORE DELETE ON "DiagnosticoCie10"
  FOR EACH ROW EXECUTE FUNCTION "proteger_gestion_sst"();
CREATE TRIGGER "Ausentismo_sin_borrado" BEFORE DELETE ON "Ausentismo"
  FOR EACH ROW EXECUTE FUNCTION "proteger_gestion_sst"();
CREATE TRIGGER "AusentismoPeriodo_sin_borrado" BEFORE DELETE ON "AusentismoPeriodo"
  FOR EACH ROW EXECUTE FUNCTION "proteger_gestion_sst"();
CREATE TRIGGER "RecobroAusentismo_sin_borrado" BEFORE DELETE ON "RecobroAusentismo"
  FOR EACH ROW EXECUTE FUNCTION "proteger_gestion_sst"();
