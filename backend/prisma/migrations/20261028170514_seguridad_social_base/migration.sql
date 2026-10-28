-- CreateEnum
CREATE TYPE "SexoTrabajador" AS ENUM ('FEMENINO', 'MASCULINO', 'OTRO');

-- CreateEnum
CREATE TYPE "TipoContrato" AS ENUM ('OBRA_LABOR', 'TERMINO_FIJO', 'TERMINO_INDEFINIDO', 'PRESTACION_SERVICIOS');

-- CreateEnum
CREATE TYPE "TipoEntidadSS" AS ENUM ('EPS', 'AFP', 'CESANTIAS', 'ARL', 'CAJA');

-- CreateEnum
CREATE TYPE "TipoDocumentoTrabajador" AS ENUM ('CERTIFICADO_AFILIACION', 'AUTORIZACION_DATOS', 'CONTRATO', 'OTRO');

-- AlterTable
ALTER TABLE "Trabajador" ADD COLUMN     "apellidos" TEXT,
ADD COLUMN     "area" TEXT,
ADD COLUMN     "autorizaDatosSalud" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autorizacionSaludRegistradaPorId" TEXT,
ADD COLUMN     "celular" TEXT,
ADD COLUMN     "fechaAutorizacionSalud" TIMESTAMP(3),
ADD COLUMN     "fechaNacimiento" TIMESTAMP(3),
ADD COLUMN     "fechaRetiro" TIMESTAMP(3),
ADD COLUMN     "motivoRetiro" TEXT,
ADD COLUMN     "nombres" TEXT,
ADD COLUMN     "sexo" "SexoTrabajador",
ADD COLUMN     "tipoContrato" "TipoContrato" NOT NULL DEFAULT 'OBRA_LABOR',
ADD COLUMN     "tipoDocumento" "TipoDocumento" NOT NULL DEFAULT 'CC';

-- CreateTable
CREATE TABLE "EntidadSS" (
    "id" TEXT NOT NULL,
    "tipo" "TipoEntidadSS" NOT NULL,
    "nombre" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntidadSS_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaseRiesgoArl" (
    "id" TEXT NOT NULL,
    "clase" INTEGER NOT NULL,
    "tasa" DECIMAL(6,3) NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClaseRiesgoArl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParametroLegal" (
    "id" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "smmlv" DECIMAL(14,2) NOT NULL,
    "auxilioTransporte" DECIMAL(14,2) NOT NULL,
    "topeAuxilioSmmlv" DECIMAL(5,2) NOT NULL DEFAULT 2,
    "porcentajeIncapacidadTramo1" DECIMAL(5,2) NOT NULL,
    "porcentajeIncapacidadTramo2" DECIMAL(5,2) NOT NULL,
    "porcentajeIncapacidadLaboral" DECIMAL(5,2) NOT NULL,
    "diasEmpleador" INTEGER NOT NULL,
    "diasTramo1Hasta" INTEGER NOT NULL,
    "diasTramo2Hasta" INTEGER NOT NULL,
    "diasBaseMes" INTEGER NOT NULL DEFAULT 30,
    "notas" TEXT,
    "validadoEn" TIMESTAMP(3),
    "validadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParametroLegal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AfiliacionTrabajador" (
    "id" TEXT NOT NULL,
    "trabajadorId" TEXT NOT NULL,
    "tipo" "TipoEntidadSS" NOT NULL,
    "entidadId" TEXT NOT NULL,
    "claseRiesgoId" TEXT,
    "fechaInicio" TIMESTAMP(3) NOT NULL,
    "fechaFin" TIMESTAMP(3),
    "registradaPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AfiliacionTrabajador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentoTrabajador" (
    "id" TEXT NOT NULL,
    "trabajadorId" TEXT NOT NULL,
    "tipo" "TipoDocumentoTrabajador" NOT NULL,
    "nombreOriginal" TEXT NOT NULL,
    "ruta" TEXT NOT NULL,
    "tipoMime" TEXT NOT NULL,
    "tamano" INTEGER NOT NULL,
    "descripcion" TEXT,
    "subidoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentoTrabajador_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EntidadSS_tipo_nombre_key" ON "EntidadSS"("tipo", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "ClaseRiesgoArl_clase_key" ON "ClaseRiesgoArl"("clase");

-- CreateIndex
CREATE UNIQUE INDEX "ParametroLegal_anio_key" ON "ParametroLegal"("anio");

-- CreateIndex
CREATE INDEX "AfiliacionTrabajador_trabajadorId_tipo_idx" ON "AfiliacionTrabajador"("trabajadorId", "tipo");

-- CreateIndex
CREATE INDEX "AfiliacionTrabajador_entidadId_idx" ON "AfiliacionTrabajador"("entidadId");

-- CreateIndex
CREATE INDEX "DocumentoTrabajador_trabajadorId_idx" ON "DocumentoTrabajador"("trabajadorId");

-- AddForeignKey
ALTER TABLE "Trabajador" ADD CONSTRAINT "Trabajador_autorizacionSaludRegistradaPorId_fkey" FOREIGN KEY ("autorizacionSaludRegistradaPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParametroLegal" ADD CONSTRAINT "ParametroLegal_validadoPorId_fkey" FOREIGN KEY ("validadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AfiliacionTrabajador" ADD CONSTRAINT "AfiliacionTrabajador_trabajadorId_fkey" FOREIGN KEY ("trabajadorId") REFERENCES "Trabajador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AfiliacionTrabajador" ADD CONSTRAINT "AfiliacionTrabajador_entidadId_fkey" FOREIGN KEY ("entidadId") REFERENCES "EntidadSS"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AfiliacionTrabajador" ADD CONSTRAINT "AfiliacionTrabajador_claseRiesgoId_fkey" FOREIGN KEY ("claseRiesgoId") REFERENCES "ClaseRiesgoArl"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AfiliacionTrabajador" ADD CONSTRAINT "AfiliacionTrabajador_registradaPorId_fkey" FOREIGN KEY ("registradaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoTrabajador" ADD CONSTRAINT "DocumentoTrabajador_trabajadorId_fkey" FOREIGN KEY ("trabajadorId") REFERENCES "Trabajador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoTrabajador" ADD CONSTRAINT "DocumentoTrabajador_subidoPorId_fkey" FOREIGN KEY ("subidoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------
-- Reglas que el esquema de Prisma no expresa (agregadas a mano). Esta migración solo agrega: no cambia ni borra
-- nada de lo que ya existe (los trabajadores actuales reciben tipo de documento CC y contrato por obra o labor).
-- ---------------------------------------------------------------------------------

-- Nombres no vacíos en los catálogos.
ALTER TABLE "EntidadSS" ADD CONSTRAINT "EntidadSS_nombre_no_vacio" CHECK (btrim("nombre") <> '');

-- Clase de riesgo de la ARL: de I a V, con una tasa entre 0 y 100 %.
ALTER TABLE "ClaseRiesgoArl" ADD CONSTRAINT "ClaseRiesgoArl_clase_valida" CHECK ("clase" BETWEEN 1 AND 5);
ALTER TABLE "ClaseRiesgoArl" ADD CONSTRAINT "ClaseRiesgoArl_tasa_valida" CHECK ("tasa" >= 0 AND "tasa" <= 100);

-- Parámetros legales (RF-CFG-13): año razonable, valores positivos, porcentajes de 0 a 100 y tramos en orden.
ALTER TABLE "ParametroLegal" ADD CONSTRAINT "ParametroLegal_anio_valido" CHECK ("anio" BETWEEN 2000 AND 2100);
ALTER TABLE "ParametroLegal" ADD CONSTRAINT "ParametroLegal_valores_positivos" CHECK (
  "smmlv" > 0 AND "auxilioTransporte" >= 0 AND "topeAuxilioSmmlv" > 0 AND "diasBaseMes" BETWEEN 28 AND 31
);
ALTER TABLE "ParametroLegal" ADD CONSTRAINT "ParametroLegal_porcentajes_validos" CHECK (
  "porcentajeIncapacidadTramo1" BETWEEN 0 AND 100
  AND "porcentajeIncapacidadTramo2" BETWEEN 0 AND 100
  AND "porcentajeIncapacidadLaboral" BETWEEN 0 AND 100
);
ALTER TABLE "ParametroLegal" ADD CONSTRAINT "ParametroLegal_tramos_en_orden" CHECK (
  "diasEmpleador" >= 0 AND "diasEmpleador" < "diasTramo1Hasta" AND "diasTramo1Hasta" < "diasTramo2Hasta"
);
-- Validar es un acto de una persona y en una fecha: las dos cosas juntas o ninguna.
ALTER TABLE "ParametroLegal" ADD CONSTRAINT "ParametroLegal_validacion_completa" CHECK (
  ("validadoEn" IS NULL AND "validadoPorId" IS NULL) OR ("validadoEn" IS NOT NULL AND "validadoPorId" IS NOT NULL)
);

-- Afiliaciones (RF-PER-04): la clase de riesgo va solo en las de ARL y siempre en ellas; la fecha de fin no es
-- anterior a la de inicio.
ALTER TABLE "AfiliacionTrabajador" ADD CONSTRAINT "Afiliacion_clase_solo_en_arl" CHECK (("tipo" = 'ARL') = ("claseRiesgoId" IS NOT NULL));
ALTER TABLE "AfiliacionTrabajador" ADD CONSTRAINT "Afiliacion_fechas_en_orden" CHECK ("fechaFin" IS NULL OR "fechaFin" >= "fechaInicio");
-- Una sola afiliación vigente (sin fecha de fin) por trabajador y tipo.
CREATE UNIQUE INDEX "Afiliacion_una_vigente_por_tipo" ON "AfiliacionTrabajador" ("trabajadorId", "tipo") WHERE "fechaFin" IS NULL;

-- La entidad de una afiliación es del mismo tipo que la afiliación (una EPS no se registra como fondo de pensión).
CREATE FUNCTION "validar_entidad_de_afiliacion"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT "tipo" FROM "EntidadSS" WHERE "id" = NEW."entidadId") IS DISTINCT FROM NEW."tipo" THEN
    RAISE EXCEPTION 'La entidad elegida no es del tipo de la afiliación';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "Afiliacion_entidad_del_tipo" BEFORE INSERT OR UPDATE ON "AfiliacionTrabajador"
  FOR EACH ROW EXECUTE FUNCTION "validar_entidad_de_afiliacion"();

-- Documentos del trabajador: tamaño positivo y nombre no vacío.
ALTER TABLE "DocumentoTrabajador" ADD CONSTRAINT "DocumentoTrabajador_tamano_valido" CHECK ("tamano" > 0);
ALTER TABLE "DocumentoTrabajador" ADD CONSTRAINT "DocumentoTrabajador_nombre_no_vacio" CHECK (btrim("nombreOriginal") <> '');

-- Ficha del trabajador (RF-PER-17): el retiro lleva fecha y motivo juntos; la autorización de datos de salud lleva
-- fecha y quién la registró cuando está marcada, y ninguno de los dos cuando no.
ALTER TABLE "Trabajador" ADD CONSTRAINT "Trabajador_retiro_completo" CHECK (
  ("fechaRetiro" IS NULL AND "motivoRetiro" IS NULL) OR ("fechaRetiro" IS NOT NULL AND "motivoRetiro" IS NOT NULL AND btrim("motivoRetiro") <> '')
);
ALTER TABLE "Trabajador" ADD CONSTRAINT "Trabajador_autorizacion_salud_completa" CHECK (
  ("autorizaDatosSalud" AND "fechaAutorizacionSalud" IS NOT NULL AND "autorizacionSaludRegistradaPorId" IS NOT NULL)
  OR (NOT "autorizaDatosSalud" AND "fechaAutorizacionSalud" IS NULL)
);

-- La información no se borra (CLAUDE.md): ni afiliaciones, ni documentos, ni catálogos de seguridad social ni
-- parámetros legales, ni siquiera con acceso directo a la base de datos. Las entidades se desactivan; una afiliación
-- se cierra con fecha de fin; un parámetro de un año se corrige, no se borra.
CREATE FUNCTION "proteger_seguridad_social"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Los datos de seguridad social no se borran: se desactivan, se cierran con fecha de fin o se corrigen';
END
$$;

CREATE TRIGGER "AfiliacionTrabajador_sin_borrado" BEFORE DELETE ON "AfiliacionTrabajador"
  FOR EACH ROW EXECUTE FUNCTION "proteger_seguridad_social"();
CREATE TRIGGER "DocumentoTrabajador_sin_borrado" BEFORE DELETE ON "DocumentoTrabajador"
  FOR EACH ROW EXECUTE FUNCTION "proteger_seguridad_social"();
CREATE TRIGGER "EntidadSS_sin_borrado" BEFORE DELETE ON "EntidadSS"
  FOR EACH ROW EXECUTE FUNCTION "proteger_seguridad_social"();
CREATE TRIGGER "ClaseRiesgoArl_sin_borrado" BEFORE DELETE ON "ClaseRiesgoArl"
  FOR EACH ROW EXECUTE FUNCTION "proteger_seguridad_social"();
CREATE TRIGGER "ParametroLegal_sin_borrado" BEFORE DELETE ON "ParametroLegal"
  FOR EACH ROW EXECUTE FUNCTION "proteger_seguridad_social"();
