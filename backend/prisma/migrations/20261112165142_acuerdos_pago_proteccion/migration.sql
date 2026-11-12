-- Protecciones de los acuerdos de pago (CC-07). Un acuerdo es historial: no se borra, no se le cambia lo esencial (la venta,
-- el motivo, el día de inicio, quién lo creó) y, una vez finalizado, ya no cambia. Para corregir algo, se finaliza y se
-- registra el correcto. Datos coherentes: motivo con texto, fecha final no anterior a la inicial, y finalizar siempre
-- deja quién lo hizo y cuándo.
ALTER TABLE "AcuerdoPago" ADD CONSTRAINT "AcuerdoPago_motivo_no_vacio" CHECK (btrim("motivo") <> '');
ALTER TABLE "AcuerdoPago" ADD CONSTRAINT "AcuerdoPago_hasta_no_anterior" CHECK ("hastaPrevista" IS NULL OR "hastaPrevista" >= "desde");
ALTER TABLE "AcuerdoPago" ADD CONSTRAINT "AcuerdoPago_finalizacion_completa" CHECK (("finalizadoEn" IS NULL) = ("finalizadoPorId" IS NULL));

CREATE FUNCTION "proteger_acuerdo_pago"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Un acuerdo de pago no se borra: finalízalo para que deje de aplicar';
  END IF;
  IF NEW."ventaId" IS DISTINCT FROM OLD."ventaId"
     OR NEW."motivo" IS DISTINCT FROM OLD."motivo"
     OR NEW."desde" IS DISTINCT FROM OLD."desde"
     OR NEW."hastaPrevista" IS DISTINCT FROM OLD."hastaPrevista"
     OR NEW."creadoPorId" IS DISTINCT FROM OLD."creadoPorId" THEN
    RAISE EXCEPTION 'Un acuerdo de pago no se edita: finalízalo y registra el correcto';
  END IF;
  IF OLD."finalizadoEn" IS NOT NULL THEN
    RAISE EXCEPTION 'El acuerdo de pago ya está finalizado y no se puede cambiar';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "AcuerdoPago_protegido" BEFORE UPDATE OR DELETE ON "AcuerdoPago"
  FOR EACH ROW EXECUTE FUNCTION "proteger_acuerdo_pago"();
