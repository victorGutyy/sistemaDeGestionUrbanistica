-- Una venta vigente por lote: un lote no puede tener dos ventas pendientes o activas a la vez
-- (por ejemplo, dos personas vendiéndolo en el mismo instante). Una venta rechazada o desistida
-- deja el lote libre para volver a venderse.
CREATE UNIQUE INDEX "Venta_lote_vigente_key" ON "Venta"("loteId") WHERE "estado" IN ('PENDIENTE_APROBACION', 'ACTIVA');

-- El gerente recibe el permiso nuevo de autorizar excepciones (la app también lo sincroniza al arrancar).
UPDATE "RolUsuario"
SET "permisos" = array_append("permisos", 'ventas.autorizar')
WHERE "clave" = 'GERENTE' AND NOT ('ventas.autorizar' = ANY("permisos"));
