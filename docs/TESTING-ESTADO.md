# Testing y estado de Suples Shop

Evaluación: 8 de octubre de 2026. Base revisada: `9a8b849e3c98747f45f7ce9eb455aec349d8f5bd` (main).

## En qué etapa está la aplicación

**Implementación funcional avanzada, pendiente de validar integración y operación en producción.** Hay frontend, API y esquema de datos para los módulos principales. Tener código no demuestra que los procesos completos funcionen con MySQL y Blob reales. No es posible asignar un porcentaje honesto de avance sin criterios de aceptación y ejecución de los flujos pendientes.

| Módulo | Evidencia de implementación | Estado comprobado |
| --- | --- | --- |
| Catálogo, categorías, marcas y búsqueda | Páginas públicas y APIs con filtros/paginación | Código revisado; navegación y datos reales pendientes |
| Acceso y roles | Sesión firmada, cookie HttpOnly, ADMIN/STAFF | Contraseñas probadas; login, expiración y permisos en API pendientes |
| Productos, imágenes y SEO | Editor, variantes, galería y subida a Blob | Compila; persistencia, subida y presentación móvil pendientes |
| Pedidos | Checkout, listado, detalle, edición de líneas, cancelación | Validaciones probadas; totales, inventario y concurrencia en BD pendientes |
| WhatsApp | Mensaje, liga y tabla de registros | Formato y total final probados; registro persistente pendiente. Una liga preparada no acredita mensaje enviado/recibido |
| Pagos | Actualización manual de estado y Mercado Pago | Código presente; conciliación real y permisos pendientes |
| Excel | Parser y actualización transaccional por identidad | Archivo sintético probado: exclusiones, duplicados, sabores separados y stock cero; importación a BD pendiente |
| Inventario, clientes, cupones, banners y ajustes | Rutas API; cobertura de UI varía | Operación completa pendiente de pruebas manuales |
| Automatización de calidad | Sin workflow previo y sin ejecuciones de Actions | Se agrega suite local y diagnóstico; no se implementó CI en este cambio |

## Resultados ejecutados

- 19/19 pruebas automatizadas aprobadas sobre módulos reales. No usan MySQL ni credenciales.
- Generación de Prisma y validación del esquema aprobadas.
- ESLint y TypeScript aprobados tras agregar los archivos de testing.
- Build sin `DATABASE_URL`: falla al recolectar datos de rutas porque `lib/prisma.ts` exige esa variable al importarse.
- Build con URL ficticia local: aprobado. Esto valida compilación, **no conectividad** ni migraciones.
- Instalación con pnpm 11 del entorno: descargó dependencias, pero terminó con `ERR_PNPM_IGNORED_BUILDS`. El proyecto declara pnpm 10.18.3; conservar esa versión para reproducibilidad. Las comprobaciones se ejecutaron directamente con los binarios instalados.
- Intento GET al dominio público: respuestas no JSON desde este entorno; resultado inconcluso para producción. No se crearon pedidos ni se modificaron datos reales.

## Cómo repetir

Usar Node 20.9+ y pnpm 10.18.3. Instalar con `pnpm install --frozen-lockfile`.

```bash
pnpm test
pnpm test:diagnostic
pnpm test:smoke -- https://suples-shop.net
```

`test` ejecuta 19 casos, incluido un XLSX sintético almacenado en base64 (sin información comercial). El cargador transpila los módulos TS para estas pruebas; TypeScript se verifica por separado.

`test:diagnostic` ejecuta generación y validación de Prisma, ESLint, TypeScript, pruebas y build; conserva resumen en `test-results/diagnostic.json`. Tiene un límite de cinco minutos por comando, informa fallos y devuelve código no cero si alguno falla. Ejecutarlo con las variables de tu ambiente ya cargadas; este script no carga `.env` por sí mismo, aunque Prisma y Next sí pueden cargarlo.

`test:smoke` solo hace ocho GET secuenciales con 20 segundos de límite por petición. Comprueba estructura JSON y protección anónima; no inicia sesión ni cambia registros. Un sitio sin administrador devuelve SETUP_REQUIRED y falla el caso de sesión, porque no está listo para operar.

## Variables a verificar en Vercel

| Variable | Para qué sirve / qué comprobar |
| --- | --- |
| DATABASE_URL | Requerida por `lib/prisma.ts`; host remoto, usuario, contraseña URL-encoded y base correctos; MySQL remoto permitido |
| AUTH_SECRET | Requerida para firmar/verificar sesiones; misma configuración para las instancias del ambiente |
| BLOB_READ_WRITE_TOKEN | Credencial del almacén conectado al ambiente; alternativa implementada: BLOB_STORE_ID + VERCEL_OIDC_TOKEN |
| STORE_WHATSAPP_NUMBER | Destino que usa el backend para preparar y registrar mensajes |
| NEXT_PUBLIC_WHATSAPP_NUMBER | Usada por el generador alternativo del carrito; comprobar consistencia con el destino backend |
| STORE_BANK_NAME / STORE_BANK_HOLDER / STORE_BANK_CLABE | Solo si se mantiene transferencia |
| Variables de Mercado Pago | Revisar `lib/mercado-pago.ts` si se mantiene pago en línea; no necesarias para el flujo efectivo |

El README menciona `.env.example`, pero ese archivo no está en la versión revisada. El cliente de ejecución usa DATABASE_URL; DB_HOST/DB_USER/etc. no sustituyen esa variable. Aplicar `pnpm db:deploy` en el ambiente autorizado y comprobar las tres migraciones, incluida `20260926143000_order_whatsapp_log`.

## Hallazgos prioritarios

1. **Pedido confirmado antes del registro WhatsApp.** `POST /api/orders` confirma su transacción y luego escribe `orderWhatsAppLog`. Si falta esa tabla o falla la conexión, devuelve error aunque el pedido y el descuento de stock ya existan. Reintentar puede duplicar pedidos. Conviene integrar el registro en la transacción y añadir idempotencia al checkout.
2. **Importación larga.** `POST /api/imports/products` permite 600 segundos de transacción, con muchas consultas secuenciales. El pool de producción se limita a una conexión por instancia. Una importación grande puede competir con consultas y superar el tiempo del hosting; el timeout de Prisma no amplía el del proveedor. Probar volumen real y considerar procesamiento por lotes/trabajo en segundo plano.
3. **503 no siempre significa lo mismo.** `handleApiError` convierte P2028/P2039 a DATABASE_UNAVAILABLE; otras fallas de conexión pueden resultar en 500. La subida tiene un 503 explícito cuando falta Blob y también depende de BD para autorizar al usuario.
4. **Concurrencia pendiente.** La venta usa decremento condicionado por stock; es una protección presente. La cancelación lee estado y después repone existencias sin un cambio de estado condicionado: probar dos cancelaciones simultáneas y confirmar que no reponen dos veces. Probar también cupones con límite de un uso.
5. **Regla de pago por confirmar.** La interfaz y el API todavía admiten CASH, TRANSFER y ONLINE. Si la regla actual es solo efectivo, restringirla también en backend; las pruebas actuales solo comprueban que efectivo sea el valor por defecto.
6. **Entrada duplicada por SKU.** El parser conserva la última fila para una identidad repetida y registra la omitida. Los casos aprobados verifican ese comportamiento; confirmar que coincide con el Excel operativo.

Son hallazgos de revisión de código, no incidentes reproducidos en la base de producción.

## Plan manual de aceptación

Ejecutar modificaciones en un ambiente de pruebas con copia de BD y Blob de pruebas. Registrar evidencia, fecha, ambiente, folio y resultado. Todos los casos siguientes están **pendientes**. Prioridades: P0 antes de operar; P1 antes de dar la versión por terminada; P2 mejora posterior.

| ID | Prioridad | Proceso y pasos | Resultado esperado |
| --- | --- | --- | --- |
| T01 | P0 | Abrir health, catálogo y búsqueda por nombre/SKU/sabor | 200 JSON, datos coherentes y sin 503 |
| T02 | P0 | Login correcto, incorrecto y logout; recargar panel | Correcto entra; incorrecto se rechaza; logout bloquea acceso |
| T03 | P0 | Sin sesión intentar crear producto, importar y subir imagen; STAFF intentar gestionar usuarios | 401 anónimo y 403 donde el rol no tenga permiso |
| T04 | P0 | Sesión alterada, expirada y usuario desactivado | Acceso rechazado; no devuelve datos privados |
| T05 | P0 | Crear pedido efectivo de dos productos con stock conocido | Un folio, total calculado desde BD, stock reducido y movimientos auditables |
| T06 | P0 | Manipular precio/total del navegador; pedir más stock del disponible | Precio del servidor prevalece; exceso devuelve 409 sin cambios parciales |
| T07 | P0 | Dos compras simultáneas por la última unidad | Solo una se confirma; stock nunca negativo |
| T08 | P0 | Simular falla del registro WhatsApp y reintentar checkout en pruebas | No duplica pedido; reconciliar respuesta con folio/stock real |
| T09 | P0 | Editar cantidades y quitar/agregar líneas de pedido pendiente | Totales y diferencias de stock correctos; movimiento con usuario |
| T10 | P0 | Editar pedido pagado/enviado/entregado/cancelado | 409 y cero cambios de líneas/stock |
| T11 | P0 | Cancelar, repetir y cancelar simultáneamente desde dos sesiones | Stock se repone exactamente una vez; cupón se libera una vez |
| T12 | P0 | Preparar WhatsApp desde checkout y desde admin | Mismo folio/total/destino; registro conserva mensaje y acción; envío efectivo verificado por persona |
| T13 | P0 | Cambiar pago pendiente a pagado; filtrar listado; recargar | Estado persiste y coincide en detalle/listado; comprobar requisito de auditoría del pago |
| T14 | P0 | Subir JPG/PNG/WEBP/AVIF pequeños, guardar y volver a abrir | URL persistente, portada/galería correctas después de redespliegue |
| T15 | P1 | Imagen de más de 4 MB, vacía y MIME inválido | 413/415/400 correspondientes; no crea referencias rotas |
| T16 | P0 | Importar Excel válido y repetir idéntico | Mismos IDs, cero productos duplicados y precio/stock correctos |
| T17 | P0 | Importar sabores con SKU distintos; archivo con exclusiones | Sabores como productos independientes; categorías restringidas omitidas |
| T18 | P0 | Importar snapshot sin un producto previo; verificar pedido histórico | Ausente queda agotado/inactivo; pedidos históricos conservados |
| T19 | P0 | Editar fotos/descripción/SEO y luego importar nuevo precio | Precio actualizado, contenido editorial preservado |
| T20 | P0 | Importar volumen real y provocar fallo intermedio | Resultado auditable; rollback completo; no bloquea operación indefinidamente |
| T21 | P1 | Cupón vencido, mínimo, límite y dos compras simultáneas | Descuento correcto y uso máximo respetado |
| T22 | P1 | Banner activo/inactivo, filtros y paginación de catálogo/admin | Datos públicos activos, páginas coherentes y sin exposición de borradores |
| T23 | P1 | Celular: buscar, carrito, checkout, panel y galería | Sin desbordamientos; mensajes de error y confirmación visibles |
| T24 | P1 | Producto individual: title, description, imagen y URL compartida | SEO coherente con producto; revisar robots/sitemap si forman parte del alcance |
| T25 | P2 | Usuarios concurrentes durante importación | Medir p95, errores y conexiones; acordar objetivo según carga esperada |

Para medir avance: casos aprobados / casos aplicables ejecutados, siempre informando también pendientes y fallidos por prioridad. **Cierre de fase:** sin P0 pendientes/fallidos, migraciones aplicadas, pruebas locales verdes y T01–T20 verificados en un ambiente conectado. No contar estos 19 tests unitarios como 19 flujos completos aprobados.
