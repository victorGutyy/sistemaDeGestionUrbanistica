-- CreateEnum
CREATE TYPE "MotivoEntregaEpp" AS ENUM ('DOTACION_INICIAL', 'REPOSICION_VIDA_UTIL', 'REPOSICION_DANO', 'PERDIDA', 'CAMBIO_CARGO');

-- CreateEnum
CREATE TYPE "CicloPhva" AS ENUM ('PLANEAR', 'HACER', 'VERIFICAR', 'ACTUAR');

-- CreateEnum
CREATE TYPE "EstadoActividadSst" AS ENUM ('PROGRAMADA', 'EN_EJECUCION', 'EJECUTADA', 'REPROGRAMADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "ModalidadCapacitacion" AS ENUM ('PRESENCIAL', 'VIRTUAL', 'MIXTA');

-- CreateEnum
CREATE TYPE "EjecutorCapacitacion" AS ENUM ('INTERNO', 'ARL', 'EXTERNO', 'SENA');

-- CreateEnum
CREATE TYPE "TipoAvisoSst" AS ENUM ('EPP', 'ACTIVIDAD_PLAN', 'CAPACITACION');

-- AlterTable
ALTER TABLE "ConfiguracionEmpresa" ADD COLUMN     "correoAvisosSst" TEXT,
ADD COLUMN     "diasAlertaSst" INTEGER NOT NULL DEFAULT 15;

-- CreateTable
CREATE TABLE "ElementoEpp" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "vidaUtilDias" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ElementoEpp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntregaEpp" (
    "id" TEXT NOT NULL,
    "trabajadorId" TEXT NOT NULL,
    "elementoId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "tallaReferencia" TEXT,
    "motivo" "MotivoEntregaEpp" NOT NULL,
    "entregadoPor" TEXT NOT NULL,
    "registradaPorId" TEXT NOT NULL,
    "firmoRecibido" BOOLEAN NOT NULL DEFAULT false,
    "vidaUtilDias" INTEGER NOT NULL,
    "proximaReposicion" TIMESTAMP(3) NOT NULL,
    "anulada" BOOLEAN NOT NULL DEFAULT false,
    "anuladaEn" TIMESTAMP(3),
    "anuladaPorId" TEXT,
    "motivoAnulacion" TEXT,
    "avisoPorReponerEn" TIMESTAMP(3),
    "avisoVencidaEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntregaEpp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActividadPlan" (
    "id" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "ciclo" "CicloPhva" NOT NULL,
    "estandar" TEXT NOT NULL,
    "actividad" TEXT NOT NULL,
    "meta" TEXT NOT NULL,
    "responsable" TEXT NOT NULL,
    "correoResponsable" TEXT NOT NULL,
    "fechaInicio" TIMESTAMP(3) NOT NULL,
    "fechaFin" TIMESTAMP(3) NOT NULL,
    "recursos" TEXT,
    "presupuesto" DECIMAL(14,2),
    "estado" "EstadoActividadSst" NOT NULL DEFAULT 'PROGRAMADA',
    "porcentajeAvance" INTEGER NOT NULL DEFAULT 0,
    "avisoProximaEn" TIMESTAMP(3),
    "avisoVencidaEn" TIMESTAMP(3),
    "creadaPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActividadPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Capacitacion" (
    "id" TEXT NOT NULL,
    "tema" TEXT NOT NULL,
    "objetivo" TEXT NOT NULL,
    "dirigidoA" TEXT NOT NULL,
    "modalidad" "ModalidadCapacitacion" NOT NULL,
    "horas" DECIMAL(5,2) NOT NULL,
    "fechaProgramada" TIMESTAMP(3) NOT NULL,
    "fechaEjecucion" TIMESTAMP(3),
    "responsable" TEXT NOT NULL,
    "correoResponsable" TEXT NOT NULL,
    "ejecutor" "EjecutorCapacitacion" NOT NULL,
    "asistentesProgramados" INTEGER NOT NULL,
    "estado" "EstadoActividadSst" NOT NULL DEFAULT 'PROGRAMADA',
    "evaluacionEficacia" DECIMAL(3,2),
    "avisoProximaEn" TIMESTAMP(3),
    "avisoVencidaEn" TIMESTAMP(3),
    "creadaPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Capacitacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AsistenciaCapacitacion" (
    "id" TEXT NOT NULL,
    "capacitacionId" TEXT NOT NULL,
    "trabajadorId" TEXT NOT NULL,
    "firmo" BOOLEAN NOT NULL DEFAULT false,
    "calificacion" DECIMAL(3,2),
    "anulada" BOOLEAN NOT NULL DEFAULT false,
    "anuladaEn" TIMESTAMP(3),
    "anuladaPorId" TEXT,
    "motivoAnulacion" TEXT,
    "registradaPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AsistenciaCapacitacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentoSst" (
    "id" TEXT NOT NULL,
    "entregaEppId" TEXT,
    "actividadPlanId" TEXT,
    "capacitacionId" TEXT,
    "nombreOriginal" TEXT NOT NULL,
    "ruta" TEXT NOT NULL,
    "tipoMime" TEXT NOT NULL,
    "tamano" INTEGER NOT NULL,
    "descripcion" TEXT,
    "subidoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentoSst_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvisoSst" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tipo" "TipoAvisoSst" NOT NULL,
    "estado" "EstadoNotificacion" NOT NULL,
    "destinatario" TEXT,
    "asunto" TEXT,
    "detalle" TEXT,
    "actividadPlanId" TEXT,
    "capacitacionId" TEXT,
    "cantidad" INTEGER,

    CONSTRAINT "AvisoSst_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ElementoEpp_nombre_key" ON "ElementoEpp"("nombre");

-- CreateIndex
CREATE INDEX "EntregaEpp_trabajadorId_elementoId_fecha_idx" ON "EntregaEpp"("trabajadorId", "elementoId", "fecha");

-- CreateIndex
CREATE INDEX "EntregaEpp_proximaReposicion_idx" ON "EntregaEpp"("proximaReposicion");

-- CreateIndex
CREATE INDEX "ActividadPlan_anio_fechaInicio_idx" ON "ActividadPlan"("anio", "fechaInicio");

-- CreateIndex
CREATE INDEX "Capacitacion_fechaProgramada_idx" ON "Capacitacion"("fechaProgramada");

-- CreateIndex
CREATE INDEX "AsistenciaCapacitacion_capacitacionId_idx" ON "AsistenciaCapacitacion"("capacitacionId");

-- CreateIndex
CREATE INDEX "AsistenciaCapacitacion_trabajadorId_idx" ON "AsistenciaCapacitacion"("trabajadorId");

-- CreateIndex
CREATE INDEX "DocumentoSst_entregaEppId_idx" ON "DocumentoSst"("entregaEppId");

-- CreateIndex
CREATE INDEX "DocumentoSst_actividadPlanId_idx" ON "DocumentoSst"("actividadPlanId");

-- CreateIndex
CREATE INDEX "DocumentoSst_capacitacionId_idx" ON "DocumentoSst"("capacitacionId");

-- CreateIndex
CREATE INDEX "AvisoSst_createdAt_idx" ON "AvisoSst"("createdAt");

-- CreateIndex
CREATE INDEX "AvisoSst_tipo_createdAt_idx" ON "AvisoSst"("tipo", "createdAt");

-- AddForeignKey
ALTER TABLE "EntregaEpp" ADD CONSTRAINT "EntregaEpp_trabajadorId_fkey" FOREIGN KEY ("trabajadorId") REFERENCES "Trabajador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntregaEpp" ADD CONSTRAINT "EntregaEpp_elementoId_fkey" FOREIGN KEY ("elementoId") REFERENCES "ElementoEpp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntregaEpp" ADD CONSTRAINT "EntregaEpp_registradaPorId_fkey" FOREIGN KEY ("registradaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntregaEpp" ADD CONSTRAINT "EntregaEpp_anuladaPorId_fkey" FOREIGN KEY ("anuladaPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActividadPlan" ADD CONSTRAINT "ActividadPlan_creadaPorId_fkey" FOREIGN KEY ("creadaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Capacitacion" ADD CONSTRAINT "Capacitacion_creadaPorId_fkey" FOREIGN KEY ("creadaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsistenciaCapacitacion" ADD CONSTRAINT "AsistenciaCapacitacion_capacitacionId_fkey" FOREIGN KEY ("capacitacionId") REFERENCES "Capacitacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsistenciaCapacitacion" ADD CONSTRAINT "AsistenciaCapacitacion_trabajadorId_fkey" FOREIGN KEY ("trabajadorId") REFERENCES "Trabajador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsistenciaCapacitacion" ADD CONSTRAINT "AsistenciaCapacitacion_anuladaPorId_fkey" FOREIGN KEY ("anuladaPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsistenciaCapacitacion" ADD CONSTRAINT "AsistenciaCapacitacion_registradaPorId_fkey" FOREIGN KEY ("registradaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoSst" ADD CONSTRAINT "DocumentoSst_entregaEppId_fkey" FOREIGN KEY ("entregaEppId") REFERENCES "EntregaEpp"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoSst" ADD CONSTRAINT "DocumentoSst_actividadPlanId_fkey" FOREIGN KEY ("actividadPlanId") REFERENCES "ActividadPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoSst" ADD CONSTRAINT "DocumentoSst_capacitacionId_fkey" FOREIGN KEY ("capacitacionId") REFERENCES "Capacitacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoSst" ADD CONSTRAINT "DocumentoSst_subidoPorId_fkey" FOREIGN KEY ("subidoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvisoSst" ADD CONSTRAINT "AvisoSst_actividadPlanId_fkey" FOREIGN KEY ("actividadPlanId") REFERENCES "ActividadPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvisoSst" ADD CONSTRAINT "AvisoSst_capacitacionId_fkey" FOREIGN KEY ("capacitacionId") REFERENCES "Capacitacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------
-- Reglas que el esquema de Prisma no expresa (agregadas a mano). Esta migración solo agrega: no cambia ni borra nada de
-- lo que ya existe (la configuración recibe dos columnas nuevas con valor por defecto).
-- ---------------------------------------------------------------------------------

-- Parámetros nuevos de la configuración: de 1 a 90 días de anticipación y, si hay correo de avisos, que parezca un correo.
ALTER TABLE "ConfiguracionEmpresa" ADD CONSTRAINT "ConfiguracionEmpresa_dias_alerta_sst" CHECK ("diasAlertaSst" BETWEEN 1 AND 90);
ALTER TABLE "ConfiguracionEmpresa" ADD CONSTRAINT "ConfiguracionEmpresa_correo_avisos_sst" CHECK (
  "correoAvisosSst" IS NULL OR "correoAvisosSst" ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
);

-- Catálogo de EPP: nombre no vacío y vida útil de al menos un día.
ALTER TABLE "ElementoEpp" ADD CONSTRAINT "ElementoEpp_nombre_no_vacio" CHECK (btrim("nombre") <> '');
ALTER TABLE "ElementoEpp" ADD CONSTRAINT "ElementoEpp_vida_util_valida" CHECK ("vidaUtilDias" >= 1);

-- Entrega de EPP (RF-SST-13 y 14): cantidad y vida útil positivas, la reposición es posterior a la entrega, y una
-- anulación siempre lleva fecha, quién y motivo (las tres cosas juntas o ninguna).
ALTER TABLE "EntregaEpp" ADD CONSTRAINT "EntregaEpp_cantidad_valida" CHECK ("cantidad" >= 1);
ALTER TABLE "EntregaEpp" ADD CONSTRAINT "EntregaEpp_vida_util_valida" CHECK ("vidaUtilDias" >= 1);
ALTER TABLE "EntregaEpp" ADD CONSTRAINT "EntregaEpp_reposicion_posterior" CHECK ("proximaReposicion" > "fecha");
ALTER TABLE "EntregaEpp" ADD CONSTRAINT "EntregaEpp_entregado_por_no_vacio" CHECK (btrim("entregadoPor") <> '');
ALTER TABLE "EntregaEpp" ADD CONSTRAINT "EntregaEpp_anulacion_completa" CHECK (
  ("anulada" AND "anuladaEn" IS NOT NULL AND "anuladaPorId" IS NOT NULL AND "motivoAnulacion" IS NOT NULL AND btrim("motivoAnulacion") <> '')
  OR (NOT "anulada" AND "anuladaEn" IS NULL AND "anuladaPorId" IS NULL AND "motivoAnulacion" IS NULL)
);

-- Una entrega no se borra ni se edita, ni siquiera con acceso directo a la base de datos: solo se anula (una vez, con
-- motivo), se marca que firmó el recibido y se anotan los avisos enviados. Una anulada ya no cambia.
CREATE FUNCTION "proteger_entrega_epp"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Una entrega de EPP no se puede borrar: se anula con motivo';
  END IF;
  IF NEW."trabajadorId" IS DISTINCT FROM OLD."trabajadorId"
     OR NEW."elementoId" IS DISTINCT FROM OLD."elementoId"
     OR NEW."fecha" IS DISTINCT FROM OLD."fecha"
     OR NEW."cantidad" IS DISTINCT FROM OLD."cantidad"
     OR NEW."tallaReferencia" IS DISTINCT FROM OLD."tallaReferencia"
     OR NEW."motivo" IS DISTINCT FROM OLD."motivo"
     OR NEW."entregadoPor" IS DISTINCT FROM OLD."entregadoPor"
     OR NEW."registradaPorId" IS DISTINCT FROM OLD."registradaPorId"
     OR NEW."vidaUtilDias" IS DISTINCT FROM OLD."vidaUtilDias"
     OR NEW."proximaReposicion" IS DISTINCT FROM OLD."proximaReposicion"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'Una entrega de EPP no se puede editar: se anula con motivo y se registra la correcta';
  END IF;
  IF OLD."anulada" AND (
       NEW."anulada" IS DISTINCT FROM OLD."anulada"
       OR NEW."anuladaEn" IS DISTINCT FROM OLD."anuladaEn"
       OR NEW."anuladaPorId" IS DISTINCT FROM OLD."anuladaPorId"
       OR NEW."motivoAnulacion" IS DISTINCT FROM OLD."motivoAnulacion"
       OR NEW."firmoRecibido" IS DISTINCT FROM OLD."firmoRecibido") THEN
    RAISE EXCEPTION 'Una entrega anulada no se puede modificar';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "EntregaEpp_protegida" BEFORE UPDATE OR DELETE ON "EntregaEpp"
  FOR EACH ROW EXECUTE FUNCTION "proteger_entrega_epp"();

-- Actividad del plan de trabajo (RF-SST-15): año razonable, fechas en orden, avance de 0 a 100 (y 100 si está ejecutada),
-- presupuesto sin signo, textos obligatorios y correo con forma de correo.
ALTER TABLE "ActividadPlan" ADD CONSTRAINT "ActividadPlan_anio_valido" CHECK ("anio" BETWEEN 2000 AND 2100);
ALTER TABLE "ActividadPlan" ADD CONSTRAINT "ActividadPlan_fechas_en_orden" CHECK ("fechaFin" >= "fechaInicio");
ALTER TABLE "ActividadPlan" ADD CONSTRAINT "ActividadPlan_avance_valido" CHECK ("porcentajeAvance" BETWEEN 0 AND 100);
ALTER TABLE "ActividadPlan" ADD CONSTRAINT "ActividadPlan_ejecutada_al_cien" CHECK ("estado" <> 'EJECUTADA' OR "porcentajeAvance" = 100);
ALTER TABLE "ActividadPlan" ADD CONSTRAINT "ActividadPlan_presupuesto_valido" CHECK ("presupuesto" IS NULL OR "presupuesto" >= 0);
ALTER TABLE "ActividadPlan" ADD CONSTRAINT "ActividadPlan_textos_no_vacios" CHECK (
  btrim("estandar") <> '' AND btrim("actividad") <> '' AND btrim("meta") <> '' AND btrim("responsable") <> ''
);
ALTER TABLE "ActividadPlan" ADD CONSTRAINT "ActividadPlan_correo_valido" CHECK ("correoResponsable" ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');

-- Capacitación (RF-SST-18): horas positivas, convocados sin signo, ejecutada solo con fecha de ejecución, eficacia de 1 a 5.
ALTER TABLE "Capacitacion" ADD CONSTRAINT "Capacitacion_horas_validas" CHECK ("horas" > 0);
ALTER TABLE "Capacitacion" ADD CONSTRAINT "Capacitacion_programados_validos" CHECK ("asistentesProgramados" >= 0);
ALTER TABLE "Capacitacion" ADD CONSTRAINT "Capacitacion_ejecutada_con_fecha" CHECK ("estado" <> 'EJECUTADA' OR "fechaEjecucion" IS NOT NULL);
ALTER TABLE "Capacitacion" ADD CONSTRAINT "Capacitacion_eficacia_valida" CHECK ("evaluacionEficacia" IS NULL OR "evaluacionEficacia" BETWEEN 1 AND 5);
ALTER TABLE "Capacitacion" ADD CONSTRAINT "Capacitacion_textos_no_vacios" CHECK (
  btrim("tema") <> '' AND btrim("objetivo") <> '' AND btrim("dirigidoA") <> '' AND btrim("responsable") <> ''
);
ALTER TABLE "Capacitacion" ADD CONSTRAINT "Capacitacion_correo_valido" CHECK ("correoResponsable" ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');

-- Asistencia (RF-SST-19): calificación de 0 a 5, anulación completa (fecha, quién y motivo, o nada) y una sola asistencia
-- vigente por trabajador y capacitación. Una asistencia anulada no vuelve a activarse.
ALTER TABLE "AsistenciaCapacitacion" ADD CONSTRAINT "Asistencia_calificacion_valida" CHECK ("calificacion" IS NULL OR "calificacion" BETWEEN 0 AND 5);
ALTER TABLE "AsistenciaCapacitacion" ADD CONSTRAINT "Asistencia_anulacion_completa" CHECK (
  ("anulada" AND "anuladaEn" IS NOT NULL AND "anuladaPorId" IS NOT NULL AND "motivoAnulacion" IS NOT NULL AND btrim("motivoAnulacion") <> '')
  OR (NOT "anulada" AND "anuladaEn" IS NULL AND "anuladaPorId" IS NULL AND "motivoAnulacion" IS NULL)
);
CREATE UNIQUE INDEX "Asistencia_una_vigente" ON "AsistenciaCapacitacion" ("capacitacionId", "trabajadorId") WHERE NOT "anulada";

CREATE FUNCTION "proteger_asistencia"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Una asistencia no se puede borrar: se anula con motivo';
  END IF;
  IF NEW."capacitacionId" IS DISTINCT FROM OLD."capacitacionId" OR NEW."trabajadorId" IS DISTINCT FROM OLD."trabajadorId" THEN
    RAISE EXCEPTION 'Una asistencia no puede cambiar de capacitación ni de trabajador';
  END IF;
  IF OLD."anulada" AND NOT NEW."anulada" THEN
    RAISE EXCEPTION 'Una asistencia anulada no se puede reactivar: se registra de nuevo';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "AsistenciaCapacitacion_protegida" BEFORE UPDATE OR DELETE ON "AsistenciaCapacitacion"
  FOR EACH ROW EXECUTE FUNCTION "proteger_asistencia"();

-- Adjunto SST (RF-SST-21): pertenece a exactamente uno de los tres registros posibles y pesa algo.
ALTER TABLE "DocumentoSst" ADD CONSTRAINT "DocumentoSst_un_solo_dueno" CHECK (
  ("entregaEppId" IS NOT NULL)::int + ("actividadPlanId" IS NOT NULL)::int + ("capacitacionId" IS NOT NULL)::int = 1
);
ALTER TABLE "DocumentoSst" ADD CONSTRAINT "DocumentoSst_tamano_valido" CHECK ("tamano" > 0);
ALTER TABLE "DocumentoSst" ADD CONSTRAINT "DocumentoSst_nombre_no_vacio" CHECK (btrim("nombreOriginal") <> '');

-- La información no se borra (CLAUDE.md): ni el catálogo de EPP, ni las actividades del plan, ni las capacitaciones, ni
-- los adjuntos. Los elementos se desactivan; las actividades y capacitaciones se cancelan.
CREATE FUNCTION "proteger_gestion_sst"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Los datos de gestión SST no se borran: se desactivan, se cancelan o se anulan con motivo';
END
$$;

CREATE TRIGGER "ElementoEpp_sin_borrado" BEFORE DELETE ON "ElementoEpp"
  FOR EACH ROW EXECUTE FUNCTION "proteger_gestion_sst"();
CREATE TRIGGER "ActividadPlan_sin_borrado" BEFORE DELETE ON "ActividadPlan"
  FOR EACH ROW EXECUTE FUNCTION "proteger_gestion_sst"();
CREATE TRIGGER "Capacitacion_sin_borrado" BEFORE DELETE ON "Capacitacion"
  FOR EACH ROW EXECUTE FUNCTION "proteger_gestion_sst"();
CREATE TRIGGER "DocumentoSst_sin_borrado" BEFORE DELETE ON "DocumentoSst"
  FOR EACH ROW EXECUTE FUNCTION "proteger_gestion_sst"();

-- El historial de avisos solo se inserta: nadie lo edita ni lo borra (misma función que el de avisos a clientes).
CREATE TRIGGER "AvisoSst_inmutable" BEFORE UPDATE OR DELETE ON "AvisoSst"
  FOR EACH ROW EXECUTE FUNCTION "proteger_solo_insercion"();
