# Entrega: pedidos por WhatsApp con envío a domicilio

## Qué queda implementado

1. **Pedido por WhatsApp:** carrito existente, nombre, teléfono, correo opcional y domicilio validado; se registra un folio y se muestra un botón explícito para abrir WhatsApp. El cliente pulsa Enviar dentro de WhatsApp.
2. **Entrega y pago:** domicilio obligatorio, CP mexicano de cinco dígitos, envío POR COTIZAR y pago POR ACORDAR al crear el pedido. El administrador captura el costo real; cero solo significa gratis cuando el operador lo confirma expresamente.
3. **Confiabilidad:** precios consultados en servidor, cantidades agrupadas por variante, solicitud UUID persistida en la pestaña, reintentos con el mismo pedido, descuento condicional de stock y bitácora dentro de la misma transacción. Cancelación y edición se serializan mediante bloqueo de la fila del pedido.
4. **Administrador:** cotización, paquetería/repartidor, guía, método de pago real, estado de pago manual y etapas de preparación. Contactar al cliente prepara una conversación dirigida al WhatsApp DEL CLIENTE con el estado y la guía.
5. **Pruebas:** 18 pruebas nuevas, las 19 anteriores y una prueba HTTP completa con una base aislada. Incluye concurrencia, permisos, guía y recuperación.

El catálogo y sus categorías ya existen en la portada; se conservan. También se corrige el texto amontonado del carrito móvil.

## Reglas de operación

- Registrar el pedido aparta existencias: descuenta stock disponible inmediatamente. Abrir o enviar WhatsApp no vuelve a descontarlo.
- No hay vencimiento automático de apartados. El operador debe revisar pendientes y cancelar los abandonados para liberar existencias.
- Flujo: Pendiente → Confirmado → Preparando → Enviado → Entregado.
- Se permite cancelar antes de Enviado, con motivo obligatorio. La devolución de existencias ocurre una sola vez.
- Enviado y Entregado requieren costo de envío confirmado. Enviado no puede volver a Pendiente ni cancelarse como un pedido no surtido.
- Para marcar Pagado, primero registra el método real y confirma el costo de envío.
- Cambiar Pagado/Reembolsado registra una decisión del operador; este código NO realiza cobros ni transferencias ni reembolsos bancarios.
- Un pedido pagado, enviado, entregado o cancelado no permite cambiar el costo de envío.
- La guía es una referencia manual: no se contrata una paquetería ni se consulta su rastreo automáticamente.
- El enlace wa.me prepara una conversación; no acredita entrega ni lectura. La bitácora guarda textos preparados, no mensajes entregados.
- Los pedidos nuevos usan TO_CONFIRM. Los pedidos anteriores mantienen CASH, TRANSFER u ONLINE y sus importes existentes.
- La recuperación vive en sessionStorage de la misma pestaña. Al cerrar definitivamente la pestaña puede perderse el acceso local; el administrador conserva el pedido y su folio.
- No cierres ni cambies los datos de una solicitud con resultado incierto: usa Recuperar pedido pendiente. Una vez recuperada, puedes volver a abrir el resumen sin crear otro pedido.

## Integración desde Visual Studio Code

El paquete contiene archivos completos bajo archivos/, con la misma estructura del repositorio.

1. Guarda tu trabajo actual y actualiza tu copia de main.
2. Crea una rama, por ejemplo:
   git switch main
   git pull --ff-only origin main
   git switch -c codex/pedidos-whatsapp-domicilio
3. Copia el contenido de archivos/ a la RAÍZ del proyecto, conservando las carpetas y reemplazando los archivos correspondientes.
   NO reemplaces todo el proyecto ni borres archivos que no vengan en el paquete.
4. Alternativa recomendada: ejecuta Aplicar-cambios.ps1 del paquete; verifica que los archivos originales coincidan y hace una copia de respaldo antes de escribir.
5. No copies node_modules, .next ni app/generated: se generan localmente.

Desde PowerShell puedes comprobar el paquete sin escribir:
   & "RUTA-DEL-PAQUETE/Aplicar-cambios.ps1" -ProjectPath "RUTA-DE-TU-PROYECTO" -CheckOnly

Para aplicarlo:
   & "RUTA-DEL-PAQUETE/Aplicar-cambios.ps1" -ProjectPath "RUTA-DE-TU-PROYECTO"

Si el script informa que un archivo cambió, detente y revisa sus diferencias. No sobrescribas a ciegas tus cambios recientes.

## Configuración

En el entorno del servidor, configura:
   STORE_WHATSAPP_NUMBER=52XXXXXXXXXX

Sustituye las X por los diez dígitos del negocio. El código también acepta diez dígitos nacionales y agrega 52. No publiques contraseñas ni tu archivo .env en GitHub.

Para esta entrega el costo de envío y el pago se acuerdan por WhatsApp. No necesitas configurar una pasarela para los pedidos nuevos. Los endpoints anteriores de Mercado Pago se conservan para pedidos antiguos.

DATABASE_URL y AUTH_SECRET siguen siendo necesarios. Usa primero una base de PRUEBAS; no copies una URL de producción para ejecutar la suite E2E.

## Migración y comprobaciones locales

   pnpm install --frozen-lockfile
   pnpm db:generate
   pnpm db:validate
   pnpm db:deploy
   pnpm test
   pnpm lint
   pnpm typecheck
   pnpm build
   pnpm dev

db:deploy debe apuntar a la base de PRUEBAS durante esta validación.

Se agregan dos migraciones:
- 20261109190000_checkout_home_delivery: clave de reintento, hash, cotización, guía y método TO_CONFIRM.
- 20261109190100_import_row_price_compatibility: crea ImportRow.price solo si falta, pues el esquema actual ya lo declara.

La primera también crea condicionalmente los campos antiguos paymentMethod, paymentProvider, paymentPreferenceId y paymentReference si faltan: las migraciones existentes del repositorio los omitían. No cambia valores de pago ni borra pedidos. No se modifican las migraciones antiguas.

## Prueba completa automática en base aislada

1. Crea una BD LOCAL cuyo nombre termine en _test o _e2e, por ejemplo suples_checkout_test.
2. Configura DATABASE_URL para esa BD y aplica las migraciones.
3. Arranca con pnpm dev. Configura CHECKOUT_E2E=1 en ese servidor y STORE_WHATSAPP_NUMBER con un número de prueba. La prueba no abre ni envía WhatsApp.
4. Crea el primer administrador de esa base desde /dashboard.
5. En OTRA terminal PowerShell:

   $env:CHECKOUT_E2E_BASE_URL="http://localhost:3000"
   $env:CHECKOUT_E2E_ALLOW_WRITES="1"
   $env:CHECKOUT_E2E_ADMIN_EMAIL="TU-ADMIN-DE-PRUEBAS"
   $env:CHECKOUT_E2E_ADMIN_PASSWORD="TU-CONTRASENA-DE-PRUEBAS"
   pnpm test:checkout:e2e

La suite rechaza dominios externos y exige que el servidor declare modo de pruebas, next dev y una BD con sufijo _test o _e2e. Crea categorías, productos y pedidos E2E y los conserva para auditoría. No la ejecutes contra una BD de ventas reales aunque el servidor esté en localhost.

## Prueba manual en celular

- Abrir portada a 375–390 px: categorías y productos visibles, carrito con contador.
- Agregar dos productos y modificar cantidades; cerrar/abrir y recargar.
- Ir a Finalizar pedido: no se piden datos de tarjeta ni selección de pasarela.
- Intentar CP inválido, nombre vacío y teléfono inválido: no debe registrar pedido.
- Completar contacto y domicilio de pruebas.
- Registrar: aparece folio y aviso de envío pendiente de cotizar.
- Abrir WhatsApp: comprobar negocio destinatario, nombre, teléfono, domicilio, productos, cantidades, sabores y subtotal. Para no contactar a nadie durante una prueba, revisa el enlace sin pulsar Enviar.
- Volver al carrito: Ver último pedido recupera el mismo folio.
- Desconectar la red al registrar y después recuperarla: Recuperar pedido pendiente debe devolver un único pedido.
- Como administrador, cotizar el envío, guardar datos, confirmar, preparar, enviar y entregar.
- Contactar al cliente: Abrir conversación debe apuntar AL CLIENTE e incluir estado y guía.
- Cancelar otro pedido pendiente con motivo: revisar devolución de stock y repetir la solicitud sin duplicar la devolución.

## Publicación

La migración de base de datos es necesaria ANTES de activar el código nuevo. Subir solo los archivos a GitHub no garantiza que se ejecuten las migraciones.

1. Respaldar la base de producción mediante tu procedimiento habitual.
2. Aplicar las dos migraciones con pnpm db:deploy en un entorno configurado expresamente para la base de producción.
3. Desplegar el código completo y configurar STORE_WHATSAPP_NUMBER.
4. Probar el flujo con un pedido identificado como prueba, coordinado con el administrador.
5. Confirmar en la tienda real que el mensaje llega al número correcto.

No se ha desplegado este paquete ni se ha modificado tu GitHub o la base de producción.

## Alcance de las comprobaciones realizadas

- 37 pruebas unitarias aprobadas (18 nuevas + 19 existentes).
- TypeScript y ESLint aprobados.
- Prisma generate, validate y migrate deploy ejecutados en MariaDB 10.4 local aislado.
- Comparación del esquema de la base migrada contra schema.prisma: sin diferencias.
- Prueba HTTP E2E aprobada con compras y cancelaciones concurrentes.
- Compilación de producción aprobada con Next.js 16.3.1 usando --webpack.
- Vista móvil y registro de un pedido ficticio comprobados en navegador local; sin abrir WhatsApp.

Las pruebas con adaptadores simulados no sustituyen la E2E real; por eso se verificaron también las operaciones de inventario en MariaDB. No se han probado cobros reales, entrega de mensajes ni una conexión a la base de producción.
