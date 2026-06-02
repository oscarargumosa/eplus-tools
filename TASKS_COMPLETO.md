# E+ Tools — Listado completo de tareas pendientes
> Cada tarea tiene dos descripciones:
> - **📋 Qué es:** lenguaje sencillo para Oscar
> - **⚙️ Técnico:** instrucción precisa para Claude u otra IA

---

## ÁREA 1 — PONER EL CÓDIGO EN PRODUCCIÓN

### T1.1 — Subir los cambios de login a la web
**📋 Qué es:** Los cambios de login con Google, verificación de email y el rol de "escribiente" ya están hechos en local pero no se han subido a la web real. Hay que publicarlos.
**⚙️ Técnico:** Ejecutar proceso MERGE de `dev-local` → `main`. Commit afectado: `7a40b3c` (Auth + Email verify + Google OAuth + Scribe role). Coolify despliega automáticamente tras push a main.

### T1.2 — Dar permiso al servidor para gestionar contenedores
**📋 Qué es:** El servidor necesita un permiso especial para poder arrancar y parar sus propios programas internos. Sin esto algunas funciones no funcionan.
**⚙️ Técnico:** Añadir volumen `/var/run/docker.sock:/var/run/docker.sock` en el docker-compose de Coolify para el servicio principal. Requiere acción manual en Coolify UI.

### T1.3 — Que el diseño de la web se actualice solo al cambiar el tema
**📋 Qué es:** Cuando alguien toca el diseño visual de eufundingschool.com, debería publicarse automáticamente sin tener que hacerlo a mano. Hay que terminar de configurar ese proceso.
**⚙️ Técnico:** Completar setup de GitHub Actions workflow `wp-theme-deploy.yml` en repo `ongpasos-droid/eplus-tools`. Requiere SSH al host VPS como root para generar par de claves ed25519, añadir pública a `authorized_keys`, localizar `WP_THEME_PATH` y subir 5 secretos al repo. Bloqueado: no ejecutable desde contenedor Docker sin acceso root al host.

### T1.4 — Revisar que la base de datos soporta bien tildes y caracteres especiales
**📋 Qué es:** La base de datos del servidor podría tener un problema con textos en español (tildes, ñ, etc.). Hay que verificar que está configurada correctamente.
**⚙️ Técnico:** Verificar charset y collation de MySQL en VPS de producción. Ejecutar `SHOW VARIABLES LIKE 'character_set%'` y `SHOW VARIABLES LIKE 'collation%'`. Debe ser `utf8mb4` / `utf8mb4_unicode_ci`. Pendiente desde sesión atlas 2026-04-26.

---

## ÁREA 2 — BASE DE DATOS

### T2.1 — Instalar actualizaciones de base de datos pendientes
**📋 Qué es:** Hay dos actualizaciones preparadas para la base de datos que todavía no se han aplicado en el servidor real. Como instalar actualizaciones de una app pero en la base de datos.
**⚙️ Técnico:** Ejecutar en MySQL de producción: `020_admin_ref_tables.sql` y `022_erasmus_eligibility.sql`. Requiere merge a main (auto-ejecuta migrations via Dockerfile CMD) o acceso MySQL directo.

### T2.2 — Dar permisos de administrador a la cuenta de Oscar
**📋 Qué es:** Tu cuenta de usuario en la plataforma no tiene todavía permisos de administrador. Hay que activarlos.
**⚙️ Técnico:** `UPDATE users SET role='admin' WHERE email='oscarargumosa@gmail.com'` en MySQL de producción. Ejecutar tras aplicar T2.1.

### T2.3 — Crear las tablas para gestionar cohortes y plazas
**📋 Qué es:** Hay que preparar el almacén de datos donde se guardarán todos los cursos (cohortes), sus clases, las plazas vendidas, los pagos y el progreso de los alumnos.
**⚙️ Técnico:** Crear migraciones para tablas: `cohorts` (id, name, topic_id, start_date, end_date, max_slots, tier), `cohort_sessions` (8 clases live por cohorte), `slots` (plaza comprada por usuario), `slot_payments` (pago Stripe asociado), `consultancies` (sesiones 1:1), `student_progress` (avance por módulo), `cohort_modules` (contenido por cohorte). Seguir convención de migraciones idempotentes del proyecto.

### T2.4 — Meter las convocatorias Erasmus+ como datos reales
**📋 Qué es:** Las 47 convocatorias Erasmus+ 2026 existen como un archivo de texto pero no están cargadas en el sistema real. Hay que importarlas para que la plataforma las use de verdad.
**⚙️ Técnico:** Migración que lee `data/erasmus_plus_2026_calls.clean.json` e inserta los 47 Topic IDs en tabla `intake_programs`. Usar `INSERT IGNORE` para idempotencia. Incluir campos: topic_id, family, name, deadline, manager (EACEA/NA), max_budget.

### T2.5 — Meter las 12 cohortes planificadas como datos reales
**📋 Qué es:** Las 12 cohortes del año académico están planificadas en un documento pero no están en el sistema. Hay que cargarlas para que la plataforma pueda venderlas.
**⚙️ Técnico:** Migración que lee `data/cohorts_v1.json` e inserta las 12 cohortes en tabla `cohorts`. Incluir fechas de inicio/fin, topic_id vinculado, tier disponibles y precio base.

---

## ÁREA 3 — LOGIN Y ACCESO (pendiente solo de publicar)

### T3.1 — Publicar el login con Google
**📋 Qué es:** Los usuarios podrán entrar con su cuenta de Google en lugar de crear una contraseña nueva. Está hecho pero no publicado.
**⚙️ Técnico:** Incluido en commit `7a40b3c`. Se publica con T1.1 (MERGE). Verificar variables de entorno `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` en Coolify tras el deploy.

### T3.2 — Publicar la verificación de email
**📋 Qué es:** Cuando alguien se registra, recibirá un email para confirmar que es su dirección real. Está hecho pero no publicado.
**⚙️ Técnico:** Incluido en commit `7a40b3c`. Se publica con T1.1. Verificar variable `RESEND_API_KEY` en Coolify.

### T3.3 — Publicar el rol de "escribiente" (Scribe)
**📋 Qué es:** Hay un tipo de usuario especial que solo puede escribir y editar proyectos pero no administrar. Está hecho pero no publicado.
**⚙️ Técnico:** Incluido en commit `7a40b3c`. Se publica con T1.1. Rol `scribe` con permisos de lectura/escritura en módulos intake y developer, sin acceso a admin ni configuración.

---

## ÁREA 4 — PANEL DE INICIO (Dashboard)

### T4.1 — Crear los datos reales del panel de inicio
**📋 Qué es:** La pantalla de inicio de la herramienta ahora mismo está vacía. Hay que conectarla con los datos reales: cuántos proyectos tienes, cuántos socios, qué has hecho recientemente.
**⚙️ Técnico:** Crear `node/src/modules/dashboard/model.js` con queries: count proyectos activos del usuario, count socios, count actividades últimas 24h. Crear `routes.js` con `GET /v1/dashboard/stats`. Registrar en `server.js`.

### T4.2 — Mostrar esos datos en pantalla
**📋 Qué es:** Una vez que los datos están disponibles, hay que pintarlos en la pantalla de inicio con cards visuales.
**⚙️ Técnico:** Modificar `public/js/app.js`: en `navigate('dashboard')`, llamar `/v1/dashboard/stats` e inyectar datos en los elementos HTML con IDs correspondientes. Añadir IDs a las cards del dashboard en `index.html`.

### T4.3 — Mostrar actividad reciente
**📋 Qué es:** En el panel de inicio, mostrar las últimas 5 cosas que has hecho: proyectos creados, socios añadidos, evaluaciones realizadas.
**⚙️ Técnico:** Query de actividad reciente unificada (UNION de proyectos, socios, evaluaciones ordenados por `updated_at` DESC LIMIT 5). Renderizar lista en dashboard con tipo de acción, nombre del recurso y fecha relativa.

---

## ÁREA 5 — PAGOS Y PRECIOS

### T5.1 — Conectar la plataforma con Stripe
**📋 Qué es:** Stripe es el sistema que procesa los pagos con tarjeta. Hay que conectarlo a la plataforma para poder cobrar las plazas de los cursos.
**⚙️ Técnico:** Crear cuenta Stripe en modo producción. Registrar productos (cohortes) y precios. Instalar `stripe` npm package. Crear endpoint `POST /v1/payments/checkout` que genera una Stripe Checkout Session. Añadir webhook `POST /v1/payments/webhook` para escuchar eventos `payment_intent.succeeded`. Variables: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` en Coolify.

### T5.2 — Motor de cálculo de precios
**📋 Qué es:** El sistema que calcula automáticamente cuánto cuesta cada plaza según la cohorte, el presupuesto del proyecto y si ya has comprado antes.
**⚙️ Técnico:** Crear `node/src/modules/pricing/engine.js` que consume `data/pricing_v2_regressive.json`. Inputs: topic_id, tier, user_id (para detectar descuentos). Output: precio_base, descuento_aplicado, precio_final, razón_descuento. Integrar con endpoint de checkout.

### T5.3 — Emails de confirmación de compra
**📋 Qué es:** Cuando alguien compra una plaza, recibe automáticamente un email confirmando su inscripción con todos los detalles.
**⚙️ Técnico:** Configurar Resend transactional para evento `slot.confirmed`. Template con: nombre alumno, cohorte, fechas, calendario de clases, enlace de acceso. Disparar desde el webhook de Stripe tras `payment_intent.succeeded`.

### T5.4 — Decisiones de precio abiertas
**📋 Qué es:** Hay tres preguntas de negocio que Oscar tiene que responder antes de poder configurar los precios correctamente.
**⚙️ Técnico:** Definir y hardcodear en `pricing_v2_regressive.json`: (1) `family_repeat_discount`: 0.40–0.50, (2) `first_year_discount`: 0.30–0.40, (3) precio curso suelto Mecánica 2: banda 49–300€. Bloquea T5.2.

---

## ÁREA 6 — INSCRIPCIÓN A COHORTES (lo que ve el alumno)

### T6.1 — Pantalla de selección de cohorte
**📋 Qué es:** La pantalla donde el futuro alumno elige a qué cohorte quiere apuntarse, con el calendario y las fechas de cada una.
**⚙️ Técnico:** Componente frontend `/cohortes` que lista las 12 cohortes desde `GET /v1/cohorts`. Card por cohorte con: nombre topic, fechas inicio/fin, 8 fechas de clases live, plazas disponibles, precio desde X€. Filtro por familia.

### T6.2 — Pantalla de selección de presupuesto
**📋 Qué es:** Dentro de cada cohorte, el alumno elige cuánto presupuesto tiene para su proyecto, lo que determina el precio de su plaza.
**⚙️ Técnico:** Selector de tier presupuestario (Small/Medium/Large/XL según `pricing_v2_regressive.json`). Mostrar rango de presupuesto de proyecto, precio plaza correspondiente y qué incluye. Llamar al pricing engine para precio en tiempo real.

### T6.3 — Página resumen antes de pagar
**📋 Qué es:** Un resumen claro de lo que el alumno va a comprar antes de introducir su tarjeta: qué cohorte, cuándo son las clases, cuánto cuesta y qué incluye.
**⚙️ Técnico:** Vista `/slot/preview` con: cohorte seleccionada, tier, precio final (con descuentos aplicados y explicados), calendario completo de las 8 sesiones, CTA "Pagar con Stripe". Pasar params via query string o sessionStorage.

### T6.4 — Proceso de pago
**📋 Qué es:** El momento en que el alumno paga con su tarjeta. Debe ser seguro, rápido y confirmar el acceso automáticamente.
**⚙️ Técnico:** Integrar Stripe Checkout (hosted page o Elements embebido). Tras `payment_intent.succeeded`, webhook crea registro en tabla `slots` con status `active`, dispara email de confirmación (T5.3) y asigna acceso al contenido de la cohorte.

### T6.5 — Descuento automático por repetición
**📋 Qué es:** Si un alumno ya tiene otra plaza en la misma familia de cohortes, el sistema le aplica automáticamente el descuento sin que tenga que pedirlo.
**⚙️ Técnico:** En pricing engine, query `SELECT COUNT(*) FROM slots WHERE user_id=? AND topic_family=? AND status='active'`. Si > 0, aplicar `family_repeat_discount`. Si es el primer slot de cualquier tipo en el sistema, aplicar `first_year_discount`. Mostrar descuento desglosado en la vista preview.

---

## ÁREA 7 — PÁGINA WEB PÚBLICA (eufundingschool.com)

### T7.1 — Asignar menús en WordPress (Oscar lo hace manualmente)
**📋 Qué es:** En el panel de administración de WordPress hay que asignar manualmente los menús: Recursos, Academia y Proyectos deben aparecer en la barra superior de la web.
**⚙️ Técnico:** En wp-admin → Apariencia → Menús: asignar items Recursos/Academia/Proyectos al menu location "EFS Top Bar". Acción manual de Oscar en la UI de WordPress.

### T7.2 — Verificar que el tema visual se ve correctamente
**📋 Qué es:** Después de publicar el tema de diseño, comprobar que la web carga el archivo de estilos correcto y que todo se ve bien.
**⚙️ Técnico:** `curl -s https://eufundingschool.com/ | grep -oE 'astra-eufunding/style\.css\?ver=[0-9.]+'` debe devolver `astra-eufunding/style.css?ver=0.3.0`. Bloquea T1.3.

### T7.3 — Página pública de convocatorias 2027
**📋 Qué es:** Una página en la web donde cualquier persona pueda ver todas las convocatorias Erasmus+ 2027, cuándo vence cada una y poder apuntarse al curso correspondiente.
**⚙️ Técnico:** Crear ruta pública `/convocatorias-2027` (sin auth). Cards por topic con: nombre, familia, deadline con countdown, manager (EACEA/NA), presupuesto max. Filtros: familia, tier presupuestario, mes deadline, manager. SEO: meta tags, structured data, sitemap. CTA en cada card → `/cohortes?topic={id}`.

### T7.4 — Instalar píxeles de seguimiento para publicidad
**📋 Qué es:** Unos pequeños códigos invisibles en la página de convocatorias que permiten luego mostrar anuncios específicos a las personas que ya la han visitado.
**⚙️ Técnico:** Instalar Meta Pixel + LinkedIn Insight Tag en `/convocatorias-2027`. Evento `ViewContent` con topic_id y familia. Crear audiencias de retargeting en Meta Ads Manager y LinkedIn Campaign Manager.

---

## ÁREA 8 — MEJORAS EN HERRAMIENTAS EXISTENTES

### T8.1 — Terminar la conexión con GoHighLevel (CRM)
**📋 Qué es:** GoHighLevel es el sistema donde gestionas tus contactos y campañas. La conexión técnica existe a medias — hay que terminarla para que los datos fluyan automáticamente.
**⚙️ Técnico:** El módulo `ghl/` tiene `client.js` y `sync.js` pero sin rutas activas en `server.js`. Crear `routes.js` con endpoints: `POST /v1/ghl/sync/contact` (crear/actualizar contacto en GHL), `POST /v1/ghl/sync/tags` (sincronizar tags de segmentación). Registrar en server.js. Variables: `GHL_API_KEY`, `GHL_LOCATION_ID` en .env.

### T8.2 — Sistema de etiquetas para segmentar entidades
**📋 Qué es:** Poder marcar las organizaciones del directorio con categorías personalizadas. Por ejemplo: "ha hecho KA1 y KA2 pero nunca KA3". Después usar esas etiquetas para crear listas de campaña específicas.
**⚙️ Técnico:** (a) Crear tabla `entity_tags` (entity_id, tag_name, created_by, created_at). (b) Endpoints: `POST /v1/entities/:id/tags`, `DELETE /v1/entities/:id/tags/:tag`, `GET /v1/entities?tags=KA1,KA2&exclude_tags=KA3`. (c) UI en ficha de entidad: chip de tags editables. (d) Vista "Segmentación": constructor de filtros (tiene tag X, no tiene tag Y, país, tipo entidad) → preview lista → exportar CSV o sincronizar con GHL.

### T8.3 — Sincronizar listas de campaña con GoHighLevel
**📋 Qué es:** Cuando creas una lista segmentada de entidades (ej. "asociaciones con KA1+KA2 sin KA3"), que esa lista se envíe automáticamente a GoHighLevel para poder hacer la campaña desde allí.
**⚙️ Técnico:** Endpoint `POST /v1/entities/segments/:segment_id/sync-ghl` que itera la lista filtrada, llama a `ghl/client.js` para crear/actualizar cada contacto con los tags correspondientes, y crea o actualiza una lista en GHL. Usar procesamiento en background (queue o setImmediate) si la lista es grande. Requiere T8.1 y T8.2.

### T8.4 — Terminar el módulo de entrada por voz
**📋 Qué es:** La función para dictar texto por voz en lugar de escribir. Está a medias y hay que terminarla.
**⚙️ Técnico:** El módulo `voice/` tiene `controller.js` y `routes.js` pero no `model.js`. Revisar qué falta: probablemente integración con Whisper (ya instalado en `/app/whisper.cpp`) para transcripción + endpoint `POST /v1/voice/transcribe` que recibe audio y devuelve texto.

### T8.5 — Conectar el enriquecimiento de datos a una pantalla
**📋 Qué es:** El sistema que busca automáticamente información sobre organizaciones (emails, teléfonos, webs) funciona internamente pero no tiene ninguna pantalla donde verlo o controlarlo.
**⚙️ Técnico:** El módulo `enrichment/` (fetcher, extractor, scorer, classifier) no tiene `routes.js`. Crear endpoints: `GET /v1/enrichment/status` (estado del pipeline), `POST /v1/enrichment/entities/:id` (enriquecer una entidad concreta), `GET /v1/enrichment/queue` (cola pendiente). UI: panel en admin con estadísticas y botón de enriquecimiento manual por entidad.

### T8.6 — Panel visual del Atlas de entidades
**📋 Qué es:** Una pantalla mejorada para explorar el directorio de organizaciones con mapa, estadísticas y filtros avanzados. Está planificado pero no construido.
**⚙️ Técnico:** Ver `docs/ENTIDADES_DASHBOARD_PLAN.md` para spec completa. Incluye: mapa interactivo (ya hay datos geocodificados en `entities_geocoded`), estadísticas por país/tipo/programa, filtros combinados, exportación. Usa la tabla `stats_cache` (migración 081) para performance.

### T8.7 — Investigar el error del Evaluator
**📋 Qué es:** El módulo de evaluación de propuestas da un error al arrancar. Hay que encontrar qué lo causa y arreglarlo.
**⚙️ Técnico:** Revisar logs PM2 del proceso `eacea_evaluator` (o el proceso equivalente en el servidor actual). Candidatos: dependencia faltante, migración no aplicada, variable de entorno ausente en Coolify. El código del módulo (`evaluator/controller.js`, `model.js`, `routes.js`) parece completo — sospechar de entorno, no de código.

---

## ÁREA 9 — GESTIÓN INTERNA DE COHORTES (panel del equipo)

### T9.1 — Panel de administración de cohortes
**📋 Qué es:** Una pantalla solo para el equipo interno donde ver todas las cohortes activas, cuántos alumnos tiene cada una y su estado.
**⚙️ Técnico:** Vista `/admin/cohorts` con tabla: cohorte, topic, fechas, alumnos inscritos (count slots), profesor asignado, estado. CRUD básico para gestionar cohortes. Solo accesible con `role=admin`.

### T9.2 — Asignar profesores a cohortes
**📋 Qué es:** En el panel interno, poder decir qué profesor lleva qué cohorte.
**⚙️ Técnico:** Añadir campo `instructor_user_id` en tabla `cohorts`. Dropdown en el panel admin que lista usuarios con `role=instructor`. Endpoint `PATCH /v1/admin/cohorts/:id` para actualizar.

### T9.3 — Calendario de clases en vivo
**📋 Qué es:** Una vista del calendario con las 8 sesiones en vivo de cada cohorte, para que el equipo sepa cuándo son y pueda gestionarlas.
**⚙️ Técnico:** Tabla `cohort_sessions` (cohort_id, session_number, scheduled_at, zoom_url, recording_url, notes). Vista en admin con calendario mensual. Endpoint para añadir/editar enlace de Zoom antes de la sesión y enlace de grabación después.

### T9.4 — Comunicaciones automáticas a alumnos
**📋 Qué es:** Que el sistema envíe automáticamente recordatorios a los alumnos: "Tu clase es mañana", "Aquí tienes los materiales", "La grabación ya está disponible".
**⚙️ Técnico:** Crear jobs programados (cron via `node-cron`): 24h antes de cada sesión → email recordatorio con Zoom link. Tras sesión → email con recording_url si está disponible. Template emails via Resend. Trigger manual desde admin para reenvíos.

---

## ÁREA 10 — PRODUCCIÓN DE CONTENIDO

### T10.1 — Grabar lecciones de vídeo de las 12 cohortes
**📋 Qué es:** Cada cohorte necesita entre 15 y 25 vídeos cortos (5-15 min) donde se explica cómo escribir ese tipo concreto de proyecto Erasmus+. Hay que grabarlos todos antes de octubre.
**⚙️ Técnico:** Pipeline de producción: slides en Remotion (ya existe) → grabación voz Oscar/profesor → edición → subida a plataforma de vídeo. Orden de producción: CBHE → KA2 Coop+SS+ENGO → Sport Coop & Capacity → CB Youth+EYT → resto. Formato: MP4 1080p, capítulos marcados, subtítulos en ES/EN.

### T10.2 — Elegir dónde alojar los vídeos
**📋 Qué es:** Los vídeos de los cursos necesitan un servicio especializado que los reproduzca rápido en cualquier país. Hay que decidir cuál usar.
**⚙️ Técnico:** Evaluar: (a) Cloudflare Stream (simple, barato, CDN global), (b) Mux (analytics avanzado, DRM), (c) LearnDash hosted (si se integra WP). Criterios: coste por GB/mes, DRM para proteger contenido, API para marcar progreso, latencia en LATAM/África/Asia. Decisión bloquea T10.1 (dónde subir).

### T10.3 — Revisión de calidad del contenido
**📋 Qué es:** Antes de publicar cada vídeo, Ana revisa que el diseño visual sea correcto y Oscar que el contenido sea técnicamente preciso.
**⚙️ Técnico:** Crear checklist de revisión: (a) Ana — paleta marca, tipografía Poppins, no colores fuera de sistema, slides limpias. (b) Oscar — precisión del contenido sobre la convocatoria, criterios de evaluación correctos, ejemplos reales. Flujo: subir borrador → revisar → aprobar → publicar en plataforma.

---

## ÁREA 11 — CAPTACIÓN Y MARKETING

### T11.1 — Email a la lista de contactos fría
**📋 Qué es:** Enviar un email a todos los contactos que tienes acumulados anunciando que ya está disponible el calendario de convocatorias 2027.
**⚙️ Técnico:** Segmentar lista en GHL por: interés Erasmus+, idioma (ES/EN), fecha último contacto. Crear secuencia en GHL: email 1 (calendario disponible + link a `/convocatorias-2027`), email 2 a no-abiertos (semana después). A/B test en subject line. Tracking de clicks por topic para segmentación futura.

### T11.2 — Artículos SEO por familia de convocatoria
**📋 Qué es:** Escribir 12 artículos largos para Google, uno por cada tipo de convocatoria Erasmus+. Cuando alguien busque "cómo conseguir financiación KA2" debería aparecer EU Funding School.
**⚙️ Técnico:** 12 artículos pillar (2.000-4.000 palabras), uno por familia. Keywords principales: "convocatoria [nombre] 2027", "cómo escribir proyecto [nombre]", "criterios evaluación [nombre]". Estructura: qué es, quién puede aplicar, cuánto dinero, cómo escribir bien la propuesta, CTA a la cohorte. Publicar en WordPress, enlazar al `/convocatorias-2027`.

### T11.3 — Configurar cuentas de publicidad
**📋 Qué es:** Crear las cuentas en Meta (Facebook/Instagram) y LinkedIn para poder lanzar anuncios de pago cuando llegue el momento.
**⚙️ Técnico:** Meta: Business Manager + Ad Account + Pixel instalado (T7.4). LinkedIn: Campaign Manager + Insight Tag instalado. Audiencias: decisores en ONGs, coordinadores de proyectos europeos, gestores de fondos europeos. Geo: ES + LATAM para KA2, Europa central para CBHE, global para EMJM.

### T11.4 — Masterclasses de captación
**📋 Qué es:** Hacer webinars gratuitos semanales a partir de septiembre para atraer alumnos. Quien asiste se convierte en un contacto caliente al que después ofrecer la plaza.
**⚙️ Técnico:** Plataforma: Zoom Webinar o StreamYard. Registro vía landing page con formulario → tag en GHL como `webinar-asistente-[topic]`. Automatización post-webinar: email resumen + CTA plaza, seguimiento a no-compradores a los 3 días. Una masterclass por familia de cohorte, empezando por las que abren antes (Sport Events, CBHE, EMJM).

---

## ÁREA 12 — DECISIONES ABIERTAS (solo Oscar puede resolver)

### D1 — Descuento por repetición en la misma familia
**📋 Qué es:** Si alguien ya tiene una plaza en una cohorte y compra otra de la misma familia (ej. dos cohortes KA2), ¿cuánto descuento le damos? Hay que decidir el porcentaje exacto.
**⚙️ Técnico:** Definir `family_repeat_discount` en `pricing_v2_regressive.json`. Rango propuesto: 40-50%. Bloquea T5.2 y T6.5.

### D2 — Descuento de primer año
**📋 Qué es:** El primer año que la plataforma funciona, ¿aplicamos un descuento especial a todos los alumnos? ¿Cuánto?
**⚙️ Técnico:** Definir `first_year_discount` en `pricing_v2_regressive.json`. Rango propuesto: 30-40%. Fecha de caducidad del descuento (¿31-dic-2026?). Bloquea T5.2.

### D3 — Precio del curso suelto sin cohorte
**📋 Qué es:** Además de apuntarse a una cohorte completa, ¿se puede comprar solo el contenido del curso sin las clases en vivo? ¿A qué precio?
**⚙️ Técnico:** Definir precio para producto `mecanica_2` (solo acceso al contenido grabado, sin sesiones live). Banda propuesta: 49-300€. Afecta a la estructura de productos en Stripe y al UI del selector.

### D4 — Plataforma de comunidad
**📋 Qué es:** Los alumnos necesitan un espacio donde hablar entre ellos y con los profesores. ¿Usamos Skool, Circle u otra plataforma?
**⚙️ Técnico:** Evaluar: Skool (comunidad + curso, 99$/mes), Circle (flexible, 89$/mes), Discord (gratuito pero sin cursos). Criterio clave: SSO con JWT del auth central o al menos integración de webhook para alta automática al comprar plaza. Decisión afecta a T9.4 (comunicaciones).

### D5 — Contratar profesores para las cohortes
**📋 Qué es:** En el pico de noviembre-diciembre habrá 8 cohortes activas en paralelo. Necesitas 4-5 profesores expertos en Erasmus+ para cubrirlas. Hay que identificarlos y contratarlos antes de septiembre.
**⚙️ Técnico:** Crear perfil de instructor en sistema: `role=instructor`, asignación a cohortes específicas, acceso solo al contenido de sus cohortes. Definir modelo de compensación (fijo por cohorte, variable por alumnos, mixto). Bloquea T9.2.

---

## RESUMEN — Camino crítico para abrir primera cohorte (8-oct-2026)

```
T1.1 MERGE → T2.1 Migraciones → T2.3 Tablas cohortes → T2.4+T2.5 Seed datos
                                                              ↓
D1+D2+D3 Decisiones precio → T5.2 Pricing engine → T5.1 Stripe → T6.1-T6.4 UI inscripción
                                                              ↓
T10.1 Grabar contenido CBHE ──────────────────────────────────┘
                                                              ↓
                                              Apertura cohorte 8-oct-2026
```

*Documento generado: 2026-04-30. Actualizar tras cada sesión de trabajo.*
