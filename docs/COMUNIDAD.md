# Comunidad de EU Funding Studio (v1, oct-2026)

Espacio para personas y entidades que preparan proyectos europeos: directorio con mapa,
conversaciones por temas, grupos, conexiones y mensajes privados. Inspirada en la Comunidad
de Proyecto Emociona (perfil voluntario, privacidad decidida en el servidor, moderación
por el equipo), adaptada a Erasmus+ y otros programas europeos. Decisiones de Óscar del 16-oct-2026.

Fuera de esta versión: insignias o acreditaciones, prácticas, correos. No hay avisos por correo;
dentro de la app, la pestaña «Mi actividad» lleva un contador con solicitudes y mensajes sin leer.

## Acceso

- Área beta `comunidad` (`node/src/utils/areas.js`). La concede el admin por persona en
  «Usuarios y accesos» (el interruptor sale solo de la lista de áreas). Los admin entran siempre.
- Sin el área: la API responde `403 AREA_REQUIRED` y la página enseña «Fase beta / Solicitar acceso»
  (`public/js/beta-access.js`). Sin sesión: `401` y la página manda a `/entrar?volver=…`.
- «Comunidad» está en el menú superior de todas las páginas, con «Beta» y candado si falta el área.
  Con nueve entradas el menú pasa a plegable por debajo de 1180 px (`public/css/topbar.css`).

## Reglas de privacidad (se aplican en `node/src/modules/community/model.js`)

| Regla | Cómo |
|---|---|
| Perfil voluntario, invisible por defecto | `community_profiles.visible = 0` hasta que la persona lo activa. Se puede editar estando oculto. |
| Perfil oculto = no existe para los demás | No sale en `/people`; su ficha da 404; nadie puede pedirle conexión. |
| Solo personas con el área | Directorio y fichas filtran por área `comunidad` (o rol admin). Si se quita el área, desaparece. |
| Nunca emails ni teléfonos | Ninguna respuesta lleva el email. Un correo en cargo, presentación o lugar se rechaza (`NO_CONTACT`). |
| Ubicación voluntaria | Sin geolocalización del navegador ni dirección. Punto manual en el mapa o la ciudad de su entidad (coordenadas de «Mi entidad»). |
| Precisión | `approx`: se GUARDA ya redondeada a 2 decimales (~1 km); `exact`: 6 decimales. Al enviar nunca salen más decimales que los elegidos. |
| Audiencia | `members` (cualquier miembro), `connections` (solo conexiones aceptadas y la propia persona), `hidden` (nadie). Se filtra ANTES de enviar coordenadas: ni la tarjeta ni los puntos del mapa las llevan si no toca. |
| Ocultar borra | Perfil oculto o audiencia `hidden` o «No aparecer en el mapa» → `lat/lng = NULL` en la base de datos. |
| Mensajes privados | Solo dentro de una conexión aceptada y solo sus dos personas. Ni el equipo los lee. Una conexión ajena, pendiente o inexistente da el mismo 404. |
| Eliminar conexión | Borra la fila; sus mensajes se van por `ON DELETE CASCADE` y deja de compartirse la ubicación «solo conexiones». |
| Rechazo discreto | Quien pidió la conexión sigue viendo «Solicitud enviada»; no se le dice que la rechazaron. Puede retirarla. |
| Grupos | Leer y escribir: solo miembros (unirse es explícito). El equipo puede leer para moderar; para escribir tiene que unirse. |
| Denuncias | Privadas: solo las ve el equipo; la persona denunciada no sabe quién fue. |
| Aportaciones en conversaciones | Muestran el nombre de quien escribe aunque su perfil esté oculto (sin enlace al perfil). Las de grupos no salen en la ficha pública. |

## Conversaciones

- Una columna. Temas (`constants.TOPICS`): Preguntas, Busco socios, Convocatorias, Recursos,
  Presentaciones, Éxitos. El formulario cambia la pregunta según el tema y conserva lo escrito si hay error.
- Recursos exige enlace. Todo enlace se valida en el servidor: solo `http(s)` con dominio, sin
  usuario/contraseña (`javascript:`, `data:`… → `LINK_INVALID`). Se pinta con `rel="noopener noreferrer nofollow ugc"`.
- Respuestas de un nivel. Corazón: uno por persona y aportación (clave primaria), nunca a la propia (`OWN_POST`); pulsar otra vez lo quita.
- Retirar: la persona autora retira la suya; el equipo oculta cualquiera. No se borra (queda para revisión).
  Lo que retiró su autor no lo puede volver a mostrar el equipo.
- Topes: 15 aportaciones cada 10 min, 20 mensajes por minuto, 60 acciones por minuto, 30 solicitudes de conexión sin respuesta.

## Tablas (migración `145_community.sql`, aditiva)

| Tabla | Para qué |
|---|---|
| `community_profiles` | Perfil (1 por persona): visible, cargo, presentación, roles, ámbitos, acciones, busco/ofrezco socios, entidad o «sin entidad» (`no_organization`, migración 146), país, ubicación (lat/lng, origen, precisión, audiencia, rótulo). La columna `languages` ya no se usa (23-oct-2026). |
| `community_connections` | Una fila por pareja (`user_lo`,`user_hi` únicos): `pending`/`accepted`/`declined`. |
| `community_messages` | Mensajes de una conexión (CASCADE con la conexión). `read_at` para el contador. |
| `community_groups`, `community_group_members` | Grupos del equipo y adhesiones. `archived` los saca de la comunidad. |
| `community_posts` | Aportaciones: generales (con `topic`) o de grupo (`group_id`); respuestas con `parent_id`; `hidden`/`hidden_by` (`author`/`team`). |
| `community_hearts` | Corazones (PK `post_id, user_id`). |
| `community_reports` | Denuncias (`open`/`hidden`/`dismissed`), una por persona y aportación. |

Todas con `ON DELETE CASCADE` hacia `users`: borrar una cuenta se lleva lo suyo. La entidad del
perfil solo se muestra si la persona sigue vinculada a ella en `user_organizations`.
Roles, ámbitos, acciones y países son listas cerradas en `node/src/modules/community/constants.js`
(el cliente las recibe en `GET /me` → `catalog`).

## API

Miembros — `/v1/community` (sesión + área `comunidad`):

| Método y ruta | Qué hace |
|---|---|
| `GET /me` | Mi perfil (aunque esté oculto), mis entidades, contadores (`requests`, `unread`) y catálogo. |
| `PUT /me/profile` | Guarda el perfil. `location_mode`: `none` / `organization` / `manual` (+ `lat`,`lng`). |
| `GET /people?q&sector&action&country&seeks` | Personas visibles + `points` del mapa ya filtrados por audiencia. |
| `GET /people/:id` | Ficha + estado de conexión + aportaciones recientes. 404 si está oculta. |
| `GET /activity` | Conexiones (con último mensaje y no leídos), solicitudes recibidas y enviadas. |
| `POST /connections` `{to, message?}` | Pedir conexión (si la otra persona ya me la pidió, queda aceptada). |
| `POST /connections/:id/accept` · `/decline` | Solo quien la recibe. |
| `DELETE /connections/:id` | Eliminar conexión o retirar mi solicitud (borra los mensajes). |
| `GET/POST /connections/:id/messages` | Leer (marca leídos) y escribir. Solo conexión aceptada propia. |
| `GET /groups` · `GET /groups/:id` | Grupos activos; ficha con `is_member` y `can_read`. |
| `POST/DELETE /groups/:id/join` | Unirse / salir. |
| `GET /posts?topic&group&before` | Aportaciones (20 por página) con sus respuestas. |
| `GET /posts/:id` | Un hilo (para enlaces directos). |
| `POST /posts` | `{topic, title?, body, link_url?}` · `{group_id, …}` · `{parent_id, body}` (respuesta). |
| `DELETE /posts/:id` | Retirar (autor) u ocultar (equipo). |
| `POST /posts/:id/heart` | Dar o quitar corazón. |
| `POST /posts/:id/report` `{reason}` | Denunciar al equipo. |

Equipo — `/v1/admin/community` (solo rol admin; cada acción queda en `audit_log` como `community.*`):
`GET /pending-count`, `GET/POST /groups`, `PUT /groups/:id`, `GET /reports?status=open|hidden|dismissed`,
`POST /reports/:id/resolve {action: hide|dismiss}`, `GET /posts?filter=recent|hidden`,
`POST /posts/:id/hide {reason}`, `POST /posts/:id/unhide`.

## Interfaz

- `public/comunidad.html` + `public/js/comunidad.js` + `public/css/comunidad.css`. Rutas:
  `/comunidad` (mapa + filtros + tarjetas), `/comunidad/personas/<id>`, `/comunidad/perfil`,
  `/comunidad/conversaciones[?tema=]`, `/comunidad/conversaciones/<id>`, `/comunidad/grupos[/<id>]`,
  `/comunidad/actividad`, `/comunidad/mensajes/<conexión>`.
- Mapa: MapLibre GL 5.6.1 + estilo OpenFreeMap Liberty (el mismo que el Atlas de Entidades), sin claves
  ni coste. Grupos de puntos que se abren al pulsar; cada persona con su foto, el logo de su entidad o
  sus iniciales; el punto propio con borde lima.
- Admin: sección «Comunidad» en el panel (`public/js/admin-comunidad.js`, enganche mínimo en
  `public/index.html` y `public/js/app.js`): denuncias, aportaciones (ocultar / volver a mostrar) y grupos.

## Datos DEMO (solo `eplus_tools_dev`)

`scripts/community-demo.js` se niega a correr si `DB_NAME` no termina en `_dev`.

```bash
cd /opt/eplus-wt/comunidad
node scripts/community-demo.js --seed     # crea todo (falla si ya existe)
node scripts/community-demo.js --remove   # lo borra todo y nada más
```

Crea 12 cuentas `comunidad.<nombre>@example.invalid` con nombre terminado en «(DEMO)» (una admin,
una sin el área para probar el 403, diez miembros con perfil y ubicación ficticia), 3 entidades
«DEMO · …», 2 grupos «DEMO · …», aportaciones con título «DEMO · …», corazones, una denuncia, una
conexión con mensajes y una solicitud pendiente. Las contraseñas van a
`/root/scripts-studio/comunidad-demo-accesos.md` (0600, fuera del repo). `--remove` borra las cuentas
(CASCADE se lleva perfiles, conexiones, mensajes, aportaciones, corazones, denuncias y membresías),
las entidades y los grupos DEMO.

## Comprobaciones

- `node scripts/community-privacy-check.js` — 52 comprobaciones por API con las cuentas DEMO
  (acceso, perfiles ocultos, ubicación por audiencia y precisión, borrado de coordenadas, mensajes
  ajenos, grupos, corazón propio, enlaces `javascript:`/`data:`, denuncias). Deja los datos como estaban.
- `/root/scripts-studio/prueba-comunidad-ui.cjs` — interacciones en navegador a 1440 y 390 px.
- `/root/scripts-studio/captura-comunidad.cjs <email> <clave> <prefijo> [rutas…]` — capturas y aviso de desbordes.

## Cambios del 23-oct-2026

- **Roles** (`constants.ROLES`): redactor/a, evaluador/a, project manager, formador/a y logística de actividades. Se marcan en el perfil, salen en tarjetas y ficha, y filtran la portada (`?rol=`).
- **Sin entidad**: casilla «No pertenezco a ninguna entidad». Manda sobre la entidad elegida y la tarjeta dice «Sin entidad». Es distinto de tener entidad y elegir «No mostrar ninguna».
- **Banderas**: PNG en `public/img/banderas/<iso>.png` (y `@2x`), una por país de `constants.COUNTRIES`, descargadas de flagcdn y servidas por Studio. No se usan emoji porque en Windows salen como letras. Si se añade un país, hay que añadir su bandera.
- **Tu lugar en el mapa**: el punto se elige con una chincheta roja tipo Google Maps (`anchor: 'bottom'`: la punta es el punto). Con el perfil oculto ya no se atenúa la sección (parecía un fallo del mapa): sale un aviso.

