# CLAUDE.md — Sistema de gestión de urbanismo (base Urbanix) · Cliente: Balder Ingeniería

## Qué es este proyecto
Urbanix es la base genérica de un sistema web para empresas que compran predios grandes, los subdividen en lotes y los venden de contado o financiados. Ahora la adaptamos para el primer cliente real: Balder Ingeniería y Mantenimiento SAS (NIT 901125081), ubicada en el Quindío, Colombia.

## Fuente de verdad: requerimientos
El alcance está en `docs/requerimientos.md` (112 requerimientos funcionales RF-XXX-00 y 32 no funcionales RNF-XXX-00, con prioridad Debe/Debería/Podría y etapa 1, 2 o 3). Reglas:
- Lee ese documento antes de planear cualquier paso, y cita los IDs que cada cambio cubre.
- Si algo del código, de un prompt o de una conversación contradice el documento, gana el documento y me avisas. Los cambios de alcance se registran ahí (control de cambios), no solo en el chat.
- Control de cambios: al final del documento. CC-02 (16 oct 2026) agrega 8 RF: proyectos tipo Maquinaria con catálogo de equipos y utilidad por equipo (no incluye contratos de alquiler, horómetro, cartera de alquileres ni alertas de mantenimiento). CC-01 (16 oct 2026) agrega 11 RF: proyectos de remodelación con ingresos y egresos propios, finanzas detalladas por proyecto, flujo de caja diario/semanal/quincenal/mensual, y préstamos a trabajadores con alerta previa a la nómina y carta de descuento (PDF, firma en papel, enlace de WhatsApp). Pendiente la confirmación comercial con el cliente.
- Reparto original: Etapa 1 = 77 RF (68 "Debe"), Etapa 2 = 24, Etapa 3 = 11. Una etapa se acepta cuando están todos sus "Debe"; los "Debería" y "Podría" se mueven primero si hay atraso.
- Restricciones: aplicación web en la nube, PostgreSQL, construida sobre la base Urbanix (el desarrollador conserva sus derechos), servicios en la nube y dominio a nombre de la empresa y pagados por ella, presupuesto $10.000.000 COP en tres etapas, unas 11 semanas.

## Actores y roles
- **Gerente**: control total (configuración, usuarios, aprobación de cierres y excepciones, auditoría).
- **Administrador**: operación diaria (ventas, abonos, egresos, cierres de caja, personal). Ve todos los proyectos.
- **Consulta**: solo lectura; acceso a todos los proyectos o restringido a uno o varios (caso: socio de La Floresta). Solo este rol se limita por proyecto.
- **Cliente comprador**: no ingresa al sistema; recibe recibos, recordatorios y avisos.
- **Sistema**: procesos automáticos (mora, recordatorios, consecutivos).
- Los roles son filas de una tabla con permisos tomados de un catálogo fijo (`backend/src/auth/permisos.ts`); cada endpoint declara el permiso que exige y una ruta sin declarar se rechaza para todos. El rol de mayor nivel ya se llama GERENTE (antes PROPIETARIO).

## Regla de arquitectura más importante
La base debe seguir siendo genérica y reutilizable con otros clientes (el desarrollador conserva los derechos sobre la base genérica). Por eso:
- Nada de "Balder" escrito a mano en el código. Nombre de la empresa, NIT, dirección, teléfonos, logo, colores y textos legales de los recibos van en una configuración de empresa (tabla de configuración en la base de datos o variables de entorno), editable por el rol GERENTE.
- Las reglas de negocio con números (porcentaje de cuota inicial, plazo máximo, tasa de mora, días del semáforo, valores de comisiones, categorías de gasto, cuentas bancarias, medios de pago) son parámetros configurables, nunca constantes fijas en el código.

## Reglas de trabajo (obligatorias)
- Antes de escribir código, explora y presenta un plan. Espera mi aprobación.
- Pídeme confirmación ANTES de: instalar paquetes o herramientas nuevas, eliminar o mover archivos, ejecutar migraciones que borren o cambien columnas con datos, y hacer commit o push en Git.
- Trabaja solo dentro de la carpeta de este proyecto.
- Trabaja en la rama de Git `feature/balder-adaptacion` (créala si no existe, pidiéndome confirmación).
- Al terminar cada paso, explícame en español, paso a paso, qué cambiaste y por qué. Quiero aprender, no solo recibir el código.
- No toques archivos .env con secretos reales; si hace falta una variable nueva, agrégala a .env.example y dime cuál es.
- Nunca uses datos personales reales en semillas o pruebas. Usa nombres y documentos inventados.

## Convenciones técnicas
- Interfaz y mensajes en español de Colombia. Zona horaria America/Bogota definida explícitamente (no depender de la hora del servidor), también para el cron de recordatorios.
- Dinero en pesos colombianos (COP): guárdalo como entero o Decimal, NUNCA como float. Formato de pantalla: $1.234.567. Fechas en pantalla: dd/mm/aaaa.
- Diseño adaptable al celular (responsive) desde 360 px de ancho; registrar un abono y consultar un estado de cuenta debe funcionar en un Android de gama media. Cada pantalla nueva nace responsive.
- Seguridad: los permisos se validan en el servidor en cada operación (no solo ocultando botones); Consulta restringido por proyecto no puede ver datos de otros proyectos por ningún medio; los adjuntos solo se descargan con sesión válida y permiso sobre el registro (nada de enlaces directos sin token); bloqueo temporal tras 5 intentos fallidos; cierre de sesión por inactividad configurable; HTTPS en producción; ningún secreto en el código.
- Consecutivos (recibos de caja, recibos históricos H-, recibos de nómina): un solo mecanismo genérico por serie, asignado dentro de una transacción con bloqueo o secuencia, sin repetidos ni saltos, y nunca reutilizado tras una anulación.
- Datos personales conforme a la Ley 1581 de 2012 (autorización registrada por cliente). La empresa debe poder exportar todos sus datos a Excel en cualquier momento.
- Cada requerimiento de dinero lleva pruebas automáticas (plan de cuotas, aplicación de abonos, anulación, mora, cierre, concurrencia del consecutivo).
- Archivos adjuntos (soportes, documentos firmados, certificados) con almacenamiento abstraído: disco local en desarrollo, servicio compatible con S3 en producción.
- La información de negocio no se borra: se anula, se desactiva o se finaliza, y queda en el historial.
- Toda acción sobre dinero (abonos, anulaciones, egresos, cierres, comisiones) queda registrada en auditoría: quién, cuándo, qué, valor anterior y valor nuevo.
- Lógica de dinero cubierta con pruebas automáticas.

## Negocio del cliente (resumen)
- 6 proyectos activos (entre ellos Arboleda, ya vendido, y La Floresta, organizada por manzanas). Lotes desde 90 m².
- Venta de contado o financiada por la empresa: cuota inicial de 30 % (puede variar), saldo a máximo 12 meses, SIN interés de financiación. SÍ cobran interés de mora.
- Firman un documento propio con el cliente y escrituran al terminar de pagar.
- Unos 60 clientes con saldo. Pagan en efectivo, por consignación o por transferencia a Bancolombia y Davivienda (también reciben Nequi y Daviplata).
- Hoy una sola persona recibe y registra el dinero, y no se concilia con el banco. Los soportes viven en WhatsApp. Ha habido descuadres y reclamos de abonos no registrados.
- Hay un socio en el proyecto La Floresta al que se le rinden cuentas.
- Comisiones de venta con valor fijo: $1.000.000 por asesor inmobiliario y $500.000 por otros referidos.
- Personal: unos 20 trabajadores por proyecto, contrato por obra o labor, pago semanal o quincenal.

## Fuera del alcance (no construir)
- Liquidación automática de nómina, seguridad social y prestaciones, y transmisión de nómina electrónica a la DIAN.
- Contabilidad general (la lleva un contador externo con su propio software).
- Facturación electrónica.
- Pagos en línea (PSE, tarjetas).
- Firma electrónica dentro de la plataforma (solo se adjuntan documentos ya firmados; también la carta de descuento de préstamos, CC-01). Envío automático por la API de WhatsApp Business.
- Portal del cliente, PQRS y app móvil nativa.
- Integración de la página web y registro de la línea de reformas de casas (se cotizan aparte). Excepción CC-01: solo el seguimiento de ingresos y egresos de los proyectos de remodelación; cotizaciones, avance y presupuesto de obra siguen fuera.

## Pendiente de confirmar con el cliente (NO inventar en el código)
Todo esto entra como configuración editable o valor provisional claramente marcado, nunca como constante:
- Tasa exacta de interés de mora y desde qué día se cobra (hoy es solo informativa y la tasa es un valor de referencia).
- Lista de los 6 proyectos con sus manzanas y lotes.
- Funciones de la abogada y si necesita un rol propio.
- Números de las cuentas de recaudo y uso de Nequi o Daviplata.
- Si habrá varios compradores por venta (RF-VEN-09, "Podría").
- Cómo se cobra el interés de mora: junto con la cuota o por separado (RF-CAR-06).
- Software contable del contador y formato de reportes que necesita.
- Logo de la empresa en buena calidad.
- El Excel real de la empresa (la copia llega a más tardar el martes 20/10/2026): la plantilla de importación (paso 2.9) es un BORRADOR y hay que ajustarla a ese archivo. Todo vive en `backend/src/importacion/plantilla-definicion.ts` (hojas, columnas, alias de encabezado). Definir también si el plan de cuotas real se carga en la hoja opcional Cuotas, y si las escrituras se importan (hoy no).
- Comisiones de las ventas que se importen del Excel: hoy las ventas importadas NO generan comisión (son historia y quizá ya se pagaron). Definir si el Excel real trae una columna de comisión (pagada o pendiente) y qué hacer con ella. También confirmar quién puede pagar comisiones (hoy gerente y administrador; solo el gerente las anula) y que una comisión sin valor configurado ($0) no se genera.
- Si CC-01 y CC-02 entran en el presupuesto o se cotiza adicional; si una remodelación guarda cliente de la obra y valor del contrato; si el préstamo se descuenta en una nómina o en cuotas y quién lo aprueba; definición de la quincena; concepto de la abogada sobre la carta de descuento; si el alquiler de maquinaria es siempre de contado y si se cobra el uso interno a proyectos propios.

## Deuda técnica conocida (quitar de aquí cuando se resuelva)
- Solo los clientes y los equipos de maquinaria se pueden editar. Proyectos, lotes (salvo precio y linderos), ventas, trabajadores y vendedores todavía no tienen pantalla de edición de datos. La auditoría (paso 2.8) ya existe: toda escritura nueva debe llamar a `registrarAuditoria` en su transacción; `backend/src/auditoria/cobertura.spec.ts` falla si un archivo escribe sin hacerlo (salvo la lista de exentos).
- Cierre de caja: la semana (lunes a domingo) y la quincena (1 al 15 y 16 al fin de mes) son definiciones PROVISIONALES a confirmar con el cliente (viven en `backend/src/cierres-caja/periodo.ts`). Los cierres son de toda la empresa y no hay cierre por proyecto. Los PDF (recibo, cierre, estado de cuenta y reportes) se vieron renderizados el 21/10/2026: se sirven por http desde la carpeta de trabajo y se abren en el visor de PDF del panel del navegador (el panel no abre `file://`).
- Las categorías de gasto del sistema (Nómina, Comisiones, Devolución por desistimiento) también aparecen en el formulario manual de egresos; elegir "Devolución por desistimiento" a mano no la liga a una venta. Decidir si se ocultan en el formulario.
- Los archivos de pantalla conservan su nombre original aunque cambió el texto (`ContabilidadPage.tsx` ahora es "Finanzas", ruta `/finanzas`; `/contabilidad` redirige). Renombrar el archivo requiere mover/borrar: pedir confirmación.
- Al anular un abono, lo que aplicaron los demás abonos no se reacomoda: la anulación devuelve el valor a las cuotas donde ese abono cayó. El total pagado y el saldo siempre cuadran, pero pueden quedar cuotas posteriores parcialmente pagadas con una anterior pendiente. Decidir con el cliente si prefiere reaplicar en orden.
- Los PDF con tablas recortan el texto largo con `common/pdf-texto.ts` (`ajustarAlAncho`): pdfkit no lo recorta solo y lo partía en dos renglones que se montaban sobre la fila siguiente. Toda tabla nueva en PDF debe usarlo.
- Reportes (paso 3.2a): hecho el motor (`backend/src/reportes/`) con recaudo, cartera por edades, egresos, inventario de lotes y flujo de caja, en pantalla (JSON), PDF y Excel. La pantalla ya existe (3.2b, menú Reportes, vista previa de 500 filas). Falta el informe del socio, maquinaria por equipo, PDF de comisiones y mejoras del panel (3.2c). Las consignaciones por verificar dependen de RF-REC-10 (sin construir).
- Los abonos antiguos de desarrollo con centavos (de antes del plan en pesos enteros) tienen su recibo histórico con los centavos dichos en letras; los abonos nuevos solo admiten pesos enteros.
- Importador: los abonos históricos cuentan en caja y finanzas en su fecha de pago (no en la de importación); un cierre de caja ya cerrado bloquea importar pagos de sus fechas. No importa abonos a ventas que ya existen en el sistema (los abonos se cargan junto con su venta) ni escrituras.
- Comisiones: no hay edición del vendedor de una venta ya registrada (tampoco se genera la comisión si se le agrega un vendedor después); el PDF del reporte de comisiones va con el paquete de reportes (RF-REP-10). El valor de la comisión se redondea a pesos enteros al generarla (la configuración todavía admite centavos).
- El interés de mora se calcula por día y se muestra con centavos (p. ej. $202.049,12) en Cartera; el resto del dinero va en pesos enteros. Redondearlo en pantalla y definir con el cliente cómo se cobra (RF-CAR-06) va junto.
- Rendimiento (`docs/rendimiento.md`): cumple RNF-REN-01 a 04 con el volumen pedido, pero Ventas, Lotes y Finanzas devuelven todos los registros (1,6 MB / 0,9 MB / 0,7 MB); paginar y filtrar en el servidor antes de pasar de unas 2.000 ventas. Repetir la medición en el servidor de producción.
- Demostración y limpieza (`docs/DEMO.md`): `npm run db:limpiar` está probado con una base derivada, pero NO se ha corrido sobre `sistema_urbanismo`; se hace cuando la plantilla de importación esté ajustada al Excel real (respaldo, `CONFIRMO_LIMPIAR` y `SEED_ADMIN_*`). `backend/respaldos/` conserva un respaldo de prueba de la demostración (`sistema_urbanismo_demo_20261019_pre_limpieza.sql`).
- El frontend no tiene corredor de pruebas (sin vitest): los formateadores de `lib/formato.ts` se verificaron a mano. Instalarlo requiere mi confirmación.
