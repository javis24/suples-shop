# Módulos pendientes para entregar Suples Shop

Revisión de main 9a8b849, 8 de octubre de 2026. La app está en implementación avanzada, pendiente de integración y validación operativa. Priorizar confiabilidad del pedido y luego operación administrativa.

| Prioridad | Módulo | Situación actual | Trabajo necesario |
| --- | --- | --- | --- |
| P0 | Checkout e inventario confiables | Existe creación, edición y cancelación | Idempotencia de compra, registro WhatsApp atómico, cancelación concurrente y pruebas con BD |
| P0 | Caja y conciliación de efectivo | Se modifica paymentStatus; no existe libro de cobros/cortes | Registrar cobro, importe, fecha, usuario, referencia; correcciones auditables y corte diario |
| P0 | Entregas y envíos | Dirección y estados; checkout envía shipping=0 | Zonas, tarifas calculadas en servidor, recolección, responsable, guía si aplica y confirmación de entrega |
| P0 | Usuarios y permisos | API de usuarios y roles; sin pantalla dedicada | Interfaz de altas/bajas/roles, recuperación segura de acceso y controles contra abuso del login |
| P0 | Importaciones robustas | Parser, historial básico y transacción larga | Detalle por filas, progreso, procesamiento por lotes, reintentos y conciliación de errores |
| P0 | Monitoreo y recuperación | health y logs; sin flujo de alertas/restauración visible | Alertas de errores, respaldo programado, prueba de restauración y guía de operación |
| P1 | Inventario operativo | APIs, movimientos y resumen | Pantalla de ajustes con motivos, historial consultable, filtros y alertas de mínimos |
| P1 | Clientes | API y datos del pedido | Pantalla de historial, direcciones, búsqueda y exportación con permisos |
| P1 | Cupones, banners y ajustes | APIs; sin pantallas dedicadas | Interfaces de administración, vigencia y previsualización |
| P1 | Devoluciones y reembolsos | Cancelación y estado REFUNDED; sin flujo dedicado | Devolución por artículo, motivo, cantidades, resolución y efecto controlado en stock/caja |
| P1 | Reportes y auditoría | Resumen de métricas e historiales parciales | Ventas por periodo/producto, cobros pendientes y bitácora de cambios de pago/precio/permisos |
| P1 | Comunicación y seguimiento | Liga WhatsApp y registro de texto preparado | Seguimiento seguro por folio y notificaciones de confirmación/cambio de estado |
| P1 | Contenido y SEO técnico | SEO por producto | Páginas de contacto/políticas, sitemap, robots, enlaces y metadatos compartidos verificados |
| P2 | Cuenta de cliente | No hay portal/login de clientes | Mis pedidos y direcciones; opcional si se conserva checkout invitado |

No recrear catálogo, carrito, productos, pedidos ni parser Excel: ya existen. Completar sus pruebas y operación.

Orden de entrega: 1) cerrar P0 de confiabilidad; 2) caja, entregas y usuarios; 3) inventario/clientes/configuración; 4) devoluciones, reportes y seguimiento; 5) mejoras opcionales.

La interfaz y API todavía permiten efectivo, transferencia y pago online. Si se acuerda operar solo efectivo, restringir ambas capas; no hace falta una nueva pasarela para esa entrega. Mercado Pago ya tiene integración, pero su operación real sigue sin validación en esta revisión.

Este listado evalúa evidencia del repositorio: un API presente no equivale a un módulo administrativo terminado. Infraestructura externa como respaldos puede existir fuera de GitHub; verificarla con quien administra hosting.
