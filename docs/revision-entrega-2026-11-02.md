# Revisión de entrega — Suples Shop

Revisión estática del commit 9a8b849e3c98747f45f7ce9eb455aec349d8f5bd (2 de noviembre de 2026). No certifica el despliegue, las credenciales, la base de datos ni pagos reales. El cambio de esta rama se limita a navegación móvil; los hallazgos siguientes quedan pendientes.

## Lo que ya existe

- Catálogo y ficha de producto con variantes; carrito y formulario de pedido.
- Administración de productos, imágenes y contenido SEO; creación de marca desde el editor.
- Pedidos con edición de partidas, estados, cancelación y devolución de existencias, estado de pago y registros de WhatsApp.
- Importación de Excel por SKU, historial de importaciones, precios y movimientos; resumen de existencias bajas.
- Autenticación administrativa y roles ADMIN/STAFF.
- APIs de categorías, marcas, clientes/direcciones, cupones, banners, ajustes y usuarios.
- Integración de preferencia de Mercado Pago y webhook con validación de firma, monto y moneda. Su presencia no demuestra que esté configurada o probada.

## Prioridad 0: cerrar antes de entregar

| Pendiente | Evidencia | Trabajo necesario |
| --- | --- | --- |
| Navegación de catálogo completo | `components/storefront.tsx` pide `limit=30` y no envía `page`; orden y filtros se aplican únicamente a esos 30 | Paginación o cargar más; ordenar/filtrar desde servidor para todo el catálogo. Probar categoría con más de 30 productos. |
| Respuestas públicas mínimas | `app/api/products/route.ts` incluye variantes completas, con `cost`, `reservedStock` y campos de importación definidos en Prisma | Seleccionar únicamente campos públicos, tanto en listado como en detalle. Revisar respuestas públicas de pedidos y relaciones del cliente. |
| Consistencia de categorías permitidas | `/api/categories` filtra categorías inactivas/restringidas, pero el listado `/api/products` no aplica la misma condición a la categoría | Centralizar reglas y aplicarlas al listado, detalle y creación de pedidos; comprobar que búsqueda o URL directa no expongan artículos excluidos. |
| Envíos calculados por servidor | `/api/orders` acepta `data.shipping`; el carrito manda `shipping: 0` | Definir entrega local/recolección/envío nacional y sus tarifas. Recalcular en servidor y mostrar el importe final antes de confirmar. Si se cotiza por WhatsApp, indicarlo claramente. |
| Pedidos repetidos y abandono | POST descuenta inventario inmediatamente; no hay clave de idempotencia de creación ni caducidad automática de pedidos pendientes | Reutilizar el pedido ante doble clic/reintento. Definir vencimiento, liberación de existencias y coordinación con pagos tardíos. El idempotencyKey de Mercado Pago no protege POST /api/orders. |
| Fallo posterior al guardado | Registro WhatsApp y preferencia se ejecutan después de la transacción del pedido | Evitar que un fallo del log devuelva un error que invite a crear otro pedido; poder recuperar el número ya creado y reintentar tareas posteriores. |
| Modalidades de pago y conciliación | Checkout permite CASH/TRANSFER/ONLINE; PATCH de pedido modifica el estado de pago | Confirmar modalidades de entrega. Si la operación es conciliación manual, adaptar el checkout. Si se habilita ONLINE, probar descuentos/envío: la preferencia actual solo suma partidas a precio unitario, mientras Order.total incluye descuento/envío. Agregar trazabilidad de cambios de pago (usuario, fecha, importe y motivo); estado PAID por sí solo no es un libro de cobros. |
| Protección de acceso y pedidos públicos | Login y POST de pedidos sin limitación de intentos visible; bootstrap se habilita si no hay usuarios | Limitar intentos en infraestructura/servidor, proteger el alta inicial y verificar permisos STAFF/ADMIN. Preparar recuperación de contraseña. |
| Configuración reproducible | README refiere `.env.example`, pero el archivo no existe en este commit | Documentar variables, aplicar migraciones y comprobar salud de BD/Blob/pagos en el entorno final. |

## Módulos o interfaces pendientes

No es necesario rehacer las APIs existentes. Faltan interfaces completas que permitan al cliente operar sin SQL ni llamadas manuales.

| Módulo | Estado actual | Prioridad |
| --- | --- | --- |
| Categorías y marcas | APIs; categorías seleccionables y creación de marca dentro de productos. Falta CRUD dedicado, activar/desactivar y ordenar categorías | Alta |
| Ajustes de tienda | API de ajustes; checkout/WhatsApp leen variables de entorno. Falta pantalla conectada a una fuente de configuración coherente | Alta |
| Envíos y entregas | Dirección y estado SHIPPED, sin cotizador, guía ni seguimiento de paquetería | Alta si se ofrecen envíos nacionales |
| Usuarios y recuperación de acceso | API de usuarios y login; sin pantalla de usuarios ni flujo de recuperación | Alta |
| Inventario operativo | APIs de ajustes/movimientos; dashboard solo muestra existencias bajas | Alta si el cliente hará ajustes y necesita kardex |
| Importaciones detalladas | API de lotes/filas e historial resumido | Alta: ver errores por fila, resumen de cambios y política de actualización de stock |
| Información comercial | Sin páginas públicas de contacto, privacidad, condiciones, envíos y devoluciones | Alta: contenido aprobado por el cliente y enlaces visibles |
| Clientes | APIs y captura automática desde pedidos; sin directorio, direcciones e historial dedicados | Media; pedidos pueden cubrir operación inicial |
| Banners | CRUD API, pero portada no consume `/api/banners` | Media: gestor y visualización pública |
| Cupones | APIs y lógica en pedido; carrito sin captura de cupón | Opcional según alcance comercial |
| Reportes y cobros | Resumen y estados de pago; sin cierre de caja, reporte exportable y auditoría de pagos | Alta para conciliación; reportes avanzados después |
| Seguimiento del comprador | Confirmación local/WhatsApp; sin consulta pública segura de estado ni notificaciones automáticas | Media; WhatsApp manual puede cubrir entrega inicial si se acuerda |
| SEO técnico | Metadatos generales y campos SEO de producto; sin sitemap/robots en app | Media: sitemap, canonical, Open Graph y datos estructurados verificados |

Cuentas de comprador, favoritos, reseñas, puntos, facturación automática y automatización de Microsip pueden quedar para una segunda fase si no forman parte del contrato.

## Riesgos operativos y 503

- `lib/prisma.ts`: pool de producción de una conexión por instancia, espera de 10 segundos. Concurrencia, importaciones y latencia hacia Hostinger pueden agotar la espera; incrementar el pool sin medir puede saturar MySQL entre múltiples instancias.
- `lib/api.ts`: P2028/P2039 se convierten a 503. Otros fallos de BD pueden terminar en 500: diagnosticar por logs y código real, no por el mensaje visual solamente.
- `/api/uploads/products`: 503 explícito cuando no hay credenciales Blob. Comprobar token del ambiente o combinación BLOB_STORE_ID/VERCEL_OIDC_TOKEN y permisos reales.
- `AUTH_SECRET` o `DATABASE_URL` faltantes/inválidos impiden autenticación o carga del cliente Prisma; no siempre producen un 503 controlado.
- Mercado Pago requiere token y secreto webhook; la API de configuración habilita el botón solo por presencia del token, sin comprobar secreto ni conectividad.
- La carga de hasta 4 MB por imagen se envía como multipart: verificar límites reales de la función en producción incluyendo el overhead del formulario.

Variables observadas: DATABASE_URL, AUTH_SECRET, BLOB_READ_WRITE_TOKEN (o credenciales OIDC del almacén), STORE_WHATSAPP_NUMBER, STORE_BANK_NAME, STORE_BANK_HOLDER, STORE_BANK_CLABE, SITE_URL, MERCADO_PAGO_ACCESS_TOKEN y MERCADO_PAGO_WEBHOOK_SECRET. Las bancarias y de Mercado Pago dependen de los medios habilitados. No guardar valores secretos en el repositorio.

## Aceptación antes de entrega

1. Aplicar migraciones en un respaldo/restauración de ensayo; probar restauración y acceso del administrador del cliente.
2. Navegar en 320/375/390/430/768 px y escritorio: categorías largas, selección, teclado, búsqueda, carrito y checkout sin desbordamiento.
3. Catálogo con más de 30 resultados: acceso a todos, búsqueda y orden global. API pública sin costos ni artículos restringidos.
4. Pedido con variante, última unidad, dos compradores simultáneos, doble clic y reintento después de error. Comprobar un solo pedido y stock correcto.
5. Editar partidas, confirmar y cancelar dos veces; verificar totales, movimientos e inventario sin devolución doble.
6. Registrar/corregir pago, revisar autor e historial. Si ONLINE: sandbox aprobado/rechazado/pendiente, webhook repetido, firma inválida, cupón/envío y pago tardío de pedido cancelado.
7. WhatsApp con número real de la tienda: comparar mensaje, variantes, cantidades y totales. Un enlace generado o abierto no demuestra envío ni entrega; los registros actuales son de preparación/acciones.
8. Subir, ordenar, elegir portada y borrar imagen; volver a verla después de un nuevo despliegue.
9. Importar archivo real dos veces: sin duplicados, precio actualizado, contenido manual conservado; revisar exclusiones y errores por fila. Comprobar cómo interactúa con ventas recientes.
10. Probar sesión vencida, acceso anónimo y STAFF a rutas administrativas; comprobar límites de intentos y recuperación de acceso.
11. Verificar dirección/contacto, políticas y tarifas definitivas. Capacitar al cliente con un pedido completo y dejar manual de operación.

## Cambio móvil de esta rama

Hasta 820 px se ocultan Todos/Disponibles/Ofertas y se sustituye el desplegable horizontal por categorías visibles en dos columnas, con nombres que admiten varias líneas, conteos, selección accesible y botones de al menos 48 px. Las categorías numerosas tienen desplazamiento vertical limitado; el resto de la página conserva su navegación. Escritorio mantiene sus filtros y barra lateral.

## Validación ejecutada

- Generación del cliente Prisma correcta.
- TypeScript y compilación de producción correctos con DATABASE_URL de prueba local (solo para compilar; sin conexión a datos reales).
- ESLint del componente modificado y comprobación de espacios del diff correctos.
- La inspección visual automatizada quedó pendiente: el navegador de Playwright no estaba instalado y su descarga devolvió un archivo inválido. Las resoluciones y pruebas funcionales de aceptación anteriores siguen siendo necesarias; no se verificaron con datos de producción.
