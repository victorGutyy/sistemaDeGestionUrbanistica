# Rendimiento (RNF-REN-01 a RNF-REN-04)

Medición del 19/10/2026 con el volumen que pide el documento de requerimientos: **10 proyectos, 1.000 lotes y más de 5.000 abonos** (en concreto: 400 clientes, 800 ventas, 5.439 abonos con recibo, 600 egresos, 200 pagos de nómina y 14.751 registros de auditoría; la base pesa 40 MB).

## Cómo se repite

```bash
cd backend
npm run demo:volumen              # carga la base sistema_urbanismo_volumen (unos 4 minutos)
npm run demo:api -- volumen       # en otra terminal: API en el puerto 3002
npm run demo:medir                # imprime la medición y guarda backend/.demo/volumen/medicion.json
```

Los datos salen siempre iguales (semilla fija) y se cargan con los servicios reales, no con inserciones directas. La carga termina con una verificación de coherencia (abonos aplicados por completo, cuotas sin sobrepago, recibos sin saltos, pesos enteros) que aquí pasó completa.

## Condiciones de la prueba

- Equipo de desarrollo: portátil con Intel Core i5-1135G7 (8 hilos) y 16 GB de RAM. **El servidor, PostgreSQL (Docker) y el cliente de medición corren en la misma máquina**, así que no hay latencia de red. En la nube los tiempos de consulta serán parecidos y se sumará la latencia del usuario.
- API compilada (`dist-scripts`), una sola instancia de Node, sin caché.
- Cada consulta se mide 7 veces después de una de calentamiento, descargando la respuesta completa; se evalúa el **percentil 95** (p95), que es más exigente que el promedio.

## Resultados

### RNF-REN-01 · Pantallas de consulta en menos de 2 segundos — cumple

| Consulta | Mediana | p95 | Tamaño |
|---|---:|---:|---:|
| Proyectos | 15 ms | 17 ms | 4 KB |
| Lotes (los 1.000) | 99 ms | 123 ms | 936 KB |
| Clientes (los 400) | 17 ms | 19 ms | 137 KB |
| Clientes, búsqueda | 15 ms | 23 ms | 18 KB |
| Ventas (las 800) | 164 ms | 170 ms | 1.606 KB |
| Cartera por cliente | 289 ms | 556 ms | 268 KB |
| Cartera por proyecto | 274 ms | 295 ms | 2 KB |
| Tablero | 344 ms | 372 ms | 3 KB |
| Finanzas: movimientos | 85 ms | 106 ms | 685 KB |
| Finanzas: consolidado | 132 ms | 154 ms | 2 KB |
| Nómina: pagos | 16 ms | 35 ms | 147 KB |
| Recibos | 32 ms | 35 ms | 96 KB |
| Cierres de caja | 15 ms | 16 ms | < 1 KB |

Comprobado también en el navegador: la pantalla **Ventas** (800 filas) tiene sus datos a los 0,7 s y **Cartera** a los 1,1 s desde que se abre.

### RNF-REN-02 · Estado de cuenta en menos de 1 minuto — cumple

Buscar un cliente por su nombre, abrir su ficha y descargar el estado de cuenta en PDF: **88 ms** en total (el PDF, 46 ms). Con una persona de por medio, el tiempo lo ponen los clics, no el sistema.

### RNF-REN-03 · Reportes PDF o Excel en menos de 10 segundos — cumple

| Reporte | Mediana | Máximo | Tamaño |
|---|---:|---:|---:|
| Tablero en PDF | 386 ms | 404 ms | 2 KB |
| Tablero en Excel | 364 ms | 368 ms | 7 KB |
| Exportación completa a Excel (gerente) | 2.985 ms | 3.222 ms | 4,9 MB |
| Reporte de recaudo en PDF (5.000 filas de detalle) | 1.608 ms | 1.737 ms | 615 KB |
| Reporte de recaudo en Excel | 712 ms | 748 ms | 260 KB |
| Cartera por edades en PDF | 342 ms | 372 ms | 58 KB |
| Cartera por edades en Excel | 280 ms | 310 ms | 33 KB |
| Egresos por categoría, inventario de lotes y flujo de caja (PDF o Excel) | de 51 a 81 ms | menos de 115 ms | menos de 25 KB |

El PDF del estado de cuenta de un cliente (RNF-REN-02) tardó 46 ms. La exportación completa es la más pesada porque saca todas las tablas; con 5.000 abonos tarda 3 s.

### RNF-REN-04 · 10 usuarios simultáneos sin degradarse — cumple

| Prueba | Peticiones | Errores | Mediana | p95 | Máximo |
|---|---:|---:|---:|---:|---:|
| 10 usuarios **con pausas** de 1 a 3 s (personas reales) | 300 | 0 | 170 ms | 452 ms | 733 ms |
| 10 usuarios **sin pausas** (esfuerzo) | 300 | 0 | 686 ms | 1.660 ms | 2.118 ms |
| 30 usuarios **sin pausas** (esfuerzo) | 900 | 0 | 2.294 ms | 4.949 ms | 6.751 ms |

Cada usuario recorre una mezcla de pantallas (proyectos, clientes, ventas, cartera, tablero, finanzas). Una petición aislada tarda 108 ms de mediana.

- Con 10 personas usando el sistema como lo hace una persona (leyendo entre acción y acción), **el p95 es 452 ms**.
- La prueba "sin pausas" es mucho más dura que el uso real: cada usuario dispara la siguiente petición apenas recibe la anterior. Aun así, con 10 el p95 queda por debajo de 2 s. Con 30 en esa modalidad sí hay degradación (p95 de 5 s) pero **ningún error**.

## Etapa 2: pantallas y reportes nuevos (medición del 21/10/2026)

Se amplió la base de volumen para medir lo que construyó la Etapa 2, con las mismas condiciones de arriba: **800 comisiones** (una por venta; 300 pagadas, cada una con su egreso, y 15 anuladas), un proyecto de **maquinaria con 10 equipos y 300 movimientos**, **3.626 pagos por verificar** (todos los pagos por consignación o transferencia: es el peor caso, porque en la operación real la cola de verificación se mantiene corta) y un **historial de 5.439 avisos**.

**Conclusión: todo cumple y lo que ya existía no empeoró.** Con el volumen más grande (más egresos por las comisiones y la maquinaria), el tablero pasó de 344 ms a 352 ms de mediana y Cartera de 289 ms a 315 ms.

### RNF-REN-01 · Pantallas nuevas en menos de 2 segundos

| Consulta | Mediana | p95 | Tamaño |
|---|---:|---:|---:|
| Pagos por verificar (los 500 más antiguos de 3.626) | 80 ms | 101 ms | 328 KB |
| Notificaciones, historial (5.439 avisos, páginas de 100) | 16 ms | 23 ms | 55 KB |
| Notificaciones, filtradas por tipo y resultado | 16 ms | 26 ms | < 1 KB |
| Comisiones (las 800) | 207 ms | 222 ms | 889 KB |
| Tablero de un proyecto | 337 ms | 372 ms | 1 KB |
| Informe del proyecto para el socio | 80 ms | 101 ms | 5 KB |
| Maquinaria: utilidad por equipo | 16 ms | 25 ms | 3 KB |
| Reporte de comisiones | 179 ms | 191 ms | 199 KB |
| Reporte de inventario de lotes | 78 ms | 96 ms | 3 KB |
| Reporte de egresos por categoría | 75 ms | 94 ms | 7 KB |
| Reporte de flujo de caja mensual | 37 ms | 48 ms | 4 KB |

### RNF-REN-03 · Reportes nuevos en PDF o Excel en menos de 10 segundos

| Reporte | Mediana | Máximo | Tamaño |
|---|---:|---:|---:|
| Informe del proyecto en PDF | 100 ms | 106 ms | 5 KB |
| Informe del proyecto en Excel | 91 ms | 118 ms | 13 KB |
| Tablero de un proyecto en PDF | 325 ms | 367 ms | 2 KB |
| Maquinaria por equipo en PDF o Excel | 17 ms | 30 ms | 3 a 9 KB |
| Reporte de comisiones en PDF | 362 ms | 415 ms | 78 KB |
| Reporte de comisiones en Excel | 229 ms | 258 ms | 42 KB |
| Comisiones: listado en Excel | 244 ms | 252 ms | 47 KB |

El reporte de recaudo en PDF (5.000 filas de detalle) sigue siendo el más lento de los reportes: 1.887 ms de mediana y 2.292 ms de máximo.

### RNF-REN-04 · 10 usuarios con las pantallas nuevas mezcladas

La mezcla de la Etapa 2 incluye pagos por verificar, notificaciones, comisiones, cartera, tablero de un proyecto, informe del proyecto y ventas.

| Prueba | Peticiones | Errores | Mediana | p95 | Máximo |
|---|---:|---:|---:|---:|---:|
| 10 usuarios **con pausas** (mezcla de la Etapa 2) | 400 | 0 | 185 ms | 422 ms | 591 ms |
| 10 usuarios **sin pausas** (mezcla de la Etapa 2) | 400 | 0 | 634 ms | 1.454 ms | 2.039 ms |

Con la mezcla de siempre, esta corrida dio: 10 usuarios con pausas, p95 509 ms; 10 sin pausas, p95 1.955 ms; 30 sin pausas, p95 5.314 ms, todas sin errores.

## En el servidor de producción (medición del 28/10/2026)

Se repitió toda la medición en el VPS de Hostinger (KVM 2, Ubuntu, Docker) con el mismo volumen y los mismos datos inventados de las secciones anteriores (800 ventas, 5.439 abonos con recibo, 800 comisiones, 3.626 pagos por verificar y 5.439 avisos). **Todo cumple RNF-REN-01 a 04, con 0 errores en todas las pruebas.**

### Condiciones

- Se corrió con `deploy/produccion/medir-rendimiento.sh` (ver `docs/despliegue.md`): un contenedor desechable crea la base aparte `sistema_urbanismo_volumen` **en el mismo PostgreSQL del servidor**, arranca una API sobre ella (dentro del contenedor, puerto 3002, límite de intentos por IP apagado porque la prueba abre 10 y 30 sesiones desde la misma IP) y la mide por dentro del servidor.
- **No incluye** el viaje por internet ni a Caddy (el proxy HTTPS): para eso está la última tabla. Usa el mismo código que la API de producción, pero desde la imagen `migrar`, no desde el contenedor `api`.
- La API real seguía encendida (sin usuarios ni datos reales). La base de volumen se borró al terminar; la de producción no se tocó.
- Misma metodología: una consulta de calentamiento y 7 mediciones, evaluando el percentil 95 (p95).

### RNF-REN-01 · Pantallas de consulta en menos de 2 segundos — cumple

| Consulta | Mediana | p95 | Tamaño |
|---|---:|---:|---:|
| Lotes (los 1.000) | 61 ms | 69 ms | 936 KB |
| Clientes (los 400) | 9 ms | 12 ms | 137 KB |
| Clientes, búsqueda | 5 ms | 8 ms | 18 KB |
| Ventas (las 800) | 81 ms | 99 ms | 1.817 KB |
| Cartera por cliente | 189 ms | 226 ms | 280 KB |
| Cartera por proyecto | 167 ms | 204 ms | 2 KB |
| Tablero | 263 ms | 275 ms | 4 KB |
| Finanzas: movimientos | 72 ms | 76 ms | 1.387 KB |
| Finanzas: consolidado | 114 ms | 144 ms | 2 KB |
| Nómina: pagos | 9 ms | 11 ms | 147 KB |
| Recibos, búsqueda | 20 ms | 28 ms | 102 KB |
| Cierres de caja | 3 ms | 6 ms | < 1 KB |
| Pagos por verificar (los 500 más antiguos) | 39 ms | 46 ms | 328 KB |
| Notificaciones, historial | 9 ms | 11 ms | 55 KB |
| Notificaciones, filtradas | 6 ms | 8 ms | < 1 KB |
| Comisiones (las 800) | 39 ms | 99 ms | 889 KB |
| Tablero de un proyecto | 265 ms | 342 ms | 1 KB |
| Informe del proyecto para el socio | 38 ms | 45 ms | 5 KB |
| Maquinaria: utilidad por equipo | 7 ms | 8 ms | 3 KB |
| Reporte de cartera por edades (pantalla) | 161 ms | 194 ms | 104 KB |
| Reporte de recaudo (pantalla) | 203 ms | 242 ms | 1.462 KB |
| Reporte de comisiones (pantalla) | 31 ms | 43 ms | 199 KB |
| Reporte de inventario de lotes (pantalla) | 11 ms | 21 ms | 3 KB |
| Reporte de egresos por categoría (pantalla) | 15 ms | 25 ms | 7 KB |
| Reporte de flujo de caja mensual (pantalla) | 33 ms | 39 ms | 4 KB |

La consulta más lenta es el tablero de un proyecto (p95 de 342 ms), muy por debajo de los 2 s.

### RNF-REN-02 · Estado de cuenta en menos de 1 minuto — cumple

Buscar un cliente, abrir su ficha y descargar el estado de cuenta en PDF: **64 ms** en total (el PDF, 37 ms, 6 KB).

### RNF-REN-03 · Reportes PDF o Excel en menos de 10 segundos — cumple

| Reporte | Mediana | Máximo | Tamaño |
|---|---:|---:|---:|
| Tablero en PDF | 266 ms | 281 ms | 3 KB |
| Tablero en Excel | 260 ms | 340 ms | 8 KB |
| Exportación completa a Excel (gerente) | 4.737 ms | 4.920 ms | 5.948 KB |
| Reporte de recaudo en PDF (5.000 filas de detalle) | 2.079 ms | 2.134 ms | 611 KB |
| Reporte de recaudo en Excel | 668 ms | 691 ms | 281 KB |
| Cartera por edades en PDF | 320 ms | 323 ms | 57 KB |
| Cartera por edades en Excel | 240 ms | 270 ms | 33 KB |
| Tablero de un proyecto en PDF | 423 ms | 428 ms | 2 KB |
| Reporte de comisiones en PDF | 264 ms | 271 ms | 78 KB |
| Reporte de comisiones en Excel | 92 ms | 98 ms | 42 KB |
| Comisiones: listado en Excel | 116 ms | 120 ms | 47 KB |
| Informe del proyecto en PDF | 68 ms | 70 ms | 5 KB |
| Informe del proyecto en Excel | 58 ms | 69 ms | 13 KB |
| Flujo de caja diario en Excel | 99 ms | 121 ms | 22 KB |
| Egresos por categoría, inventario de lotes, flujo de caja mensual y maquinaria (PDF o Excel) | de 14 a 44 ms | 56 ms o menos | 3 a 9 KB |

La exportación completa a Excel es lo más pesado: 4,7 s de mediana (3,0 s en el portátil). Sigue por debajo del límite, pero es el reporte que primero lo alcanzaría si el volumen creciera mucho.

### RNF-REN-04 · 10 usuarios simultáneos sin degradarse — cumple

Una petición aislada tarda 77 ms de mediana.

| Prueba | Peticiones | Errores | Mediana | p95 | Máximo |
|---|---:|---:|---:|---:|---:|
| 10 usuarios **con pausas** (pantallas de siempre) | 300 | 0 | 99 ms | 494 ms | 955 ms |
| 10 usuarios **sin pausas** (esfuerzo) | 300 | 0 | 873 ms | 2.015 ms | 2.285 ms |
| 30 usuarios **sin pausas** (esfuerzo) | 900 | 0 | 2.624 ms | 5.534 ms | 6.446 ms |
| 10 usuarios **con pausas** (mezcla de la Etapa 2) | 400 | 0 | 70 ms | 415 ms | 816 ms |
| 10 usuarios **sin pausas** (mezcla de la Etapa 2) | 400 | 0 | 770 ms | 1.375 ms | 1.780 ms |

Con 10 personas usando el sistema como lo hace una persona real, el p95 queda en 494 ms. Las pruebas "sin pausas" son un esfuerzo mucho mayor que el uso real; con 10 el p95 ronda los 2 s y con 30 hay degradación (p95 de 5,5 s, igual que en el portátil) pero ningún error.

### Tiempo desde internet

Medido el 28/10/2026 desde el computador de la persona desarrolladora, con `curl` contra `https://sistema.balderingenieria.com/api/salud` (10 peticiones, cada una con conexión nueva: DNS, TCP y TLS):

| Mínimo | Mediana | Máximo (la primera, en frío) |
|---:|---:|---:|
| 0,286 s | 0,327 s | 0,496 s |

Esa cifra es el costo fijo de cualquier petición (el viaje de ida y vuelta, el proxy HTTPS y el servidor): **a los tiempos de arriba se les suman unos 0,3 s**. Con eso, la pantalla más lenta (tablero de un proyecto, p95 de 342 ms) queda en unos 0,7 s, y la exportación completa a Excel (máx. 4,9 s) en unos 5,3 s, ambas dentro de sus límites. Un navegador reutiliza la conexión, así que el costo real suele ser menor.

**Lo que esta medición no cubre:** el tiempo de descarga de las respuestas grandes (Ventas pesa 1,8 MB y la exportación completa 5,9 MB) depende de la conexión de quien use el sistema, sobre todo con datos móviles; no se midió en un celular real. Tampoco se midió con el tráfico real de Balder, porque el sistema aún no tiene datos reales.

## Observaciones para la Etapa 2

1. **Listados completos.** Ventas (1,8 MB), Lotes (0,9 MB), Finanzas (1,4 MB con la maquinaria y las comisiones pagadas) y Comisiones (0,9 MB) devuelven todos los registros. Con el volumen pedido cumplen, pero conviene **paginar y filtrar en el servidor** antes de pasar de unas 2.000 ventas, sobre todo para el celular de gama media con datos móviles.
2. **Cartera y tablero** son los cálculos más caros (unos 300 ms) porque recorren todas las cuotas; si el volumen crece 5 veces, conviene una consulta agregada en la base en lugar de calcular en la aplicación.
3. La API corre en un solo proceso. Si la carga real supera la medida (más de 10 personas activas a la vez), basta con levantar más instancias detrás del balanceador del proveedor en la nube.
4. Las cifras se repitieron en el servidor de producción el 28/10/2026 (sección anterior) y cumplen. Conviene repetirlas cuando ya estén cargados los datos reales de Balder y si el volumen crece de forma notable, con el mismo guion (`medir-rendimiento.sh`).
