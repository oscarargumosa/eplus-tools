# Academia nativa (cursos dentro de Studio)

Desde el 8-oct-2026 los cursos de EU Funding Studio se imparten dentro de la propia
app, no en el campus Moodle. La organización es la de las aulas de Proyecto Emociona;
la identidad visual, la de Studio (`DESIGN.md`).

- **Alumno:** `/academia` (catálogo) → `/academia/<curso>` (ficha; sin matrícula, las
  lecciones salen con candado) → `/academia/<curso>/<lección>` (aula). Página propia
  `public/academia.html` + `public/js/academia.js` + `public/css/academia.css`, con la
  misma barra superior y el mismo login (JWT + cookie de refresco) que la SPA.
- **Mi cuenta → Mis cursos** (`/#account-courses`, `public/js/account-academia.js`):
  cursos con su progreso y «Continuar», y los certificados.
- **Admin:** `/academia/admin` (`public/js/admin-academia.js`, solo `role='admin'`; enlace
  «Academia» en el menú de admin de la SPA): alumnos por curso, una persona lección a
  lección con sus intentos y notas, resumen por lección, matricular/quitar matrícula,
  exportar CSV, hojas con más corazones (sin contar al equipo) y dudas/comentarios
  (filtrar, marcar resuelto, ocultar, borrar). Las estrellas de cada clase no salen aquí.
- **API:** `/v1/academia/*` → `node/src/modules/academia/`: `model.js` (reglas de progreso,
  test y certificado), `social.js` (corazones, valoración, dudas), `admin.js`, `notify.js` (correos).
- **Certificado público:** `/academia/certificado/<serial>` (verificación + imprimir a PDF).
- **BD:** `migrations/127_academia_cursos.sql` (tablas `academia_*`).
- El revisor interno de contenidos (`academy.html`, `/v1/academy`) es otra cosa y sigue igual.

## Reglas (las del aula de Emociona, con las decisiones de Óscar del 16-oct-2026)

| Qué | Regla |
|---|---|
| Lectura | Portada + una hoja por párrafo. Para abrir una hoja nueva, la anterior ha estado abierta 7 s (hora del servidor). Con la última hoja, `READING_DONE`. Releer es libre. Se pasa con botones, ←/→, RePág/AvPág, Inicio o deslizando (> 50 px) en el móvil. |
| Recursos | Pestañas Lectura · Esquema · Infografía · PDF; solo las que tenga la lección. Esquema = `academia_lessons.mind_map` `{center, lead, branches:[{title, ideas[]}]}`; Infografía = `infographic` `{src, alt, width, height}`; PDF = `pdf_url` (el dossier). El importador los carga si el JSON del curso los trae (`mind_map`, `infographic` en cada lección). Cambiar de pestaña no reinicia la lectura. |
| Corazones | Uno por hoja y persona (`academia_hearts`). La hoja se identifica por una huella de apartado + texto (FNV-1a, 16 hex): sobrevive a reimportar el curso mientras la hoja no cambie. Se guarda copia del apartado y de 500 caracteres del texto. |
| Vídeo visto | El cliente manda la posición cada ~5 s (un `watchId` por visita). Con un mismo `watchId` hay que cubrir ≥ 70 % del vídeo y llegar al final. Solo suman los tramos entre dos muestras en los que el vídeo avanza lo que permite el reloj del servidor a ≤ 2,5x (+5 s); un salto no suma. |
| Test | Se abre con el vídeo visto **o** la lectura terminada. Una pregunta por pantalla. Preguntas y opciones barajadas por intento; el intento guarda su copia congelada. Aprobado: 80 %; cuenta la mejor nota. **Intentos sin límite y sin espera.** La corrección enseña **siempre** (también al suspender) la respuesta correcta y su explicación. **Desde el 3.er suspenso** en ese test, ayudas: la explicación de cada opción, debajo de cada opción mientras responde y en la corrección. Historial visible: «Intento N · nota/100 · Superado/Repasar · fecha», con ✓/✗ por pregunta. |
| Explicaciones | Salen del `feedback` de cada opción del JSON del curso. La de la correcta es el «Por qué». Si una opción solo trae «Correcto.» o «No.» (38 de 598 preguntas en el curso de Erasmus+), se completa con «La respuesta correcta es «…»». |
| Lección completada | **Vídeo visto + lectura terminada + test aprobado.** Lo que la lección no tenga no se exige. Se apunta `LESSON_COMPLETED` (política `VIDEO_READING_TEST_V2`). |
| Completadas con la regla anterior | Antes del 16-oct-2026 bastaba con aprobar el test. Para no quitar progreso ni certificados a nadie, la migración 142 apunta un `LEGACY_COMPLETED` por cada lección con un test aprobado **antes de desplegarla**; esas lecciones siguen contando como completadas («Completada anteriormente»). Lo que se apruebe después sigue la regla nueva. La migración solo se ejecuta una vez, en el despliegue que trae la regla nueva: ese es el corte. |
| Tu recorrido | Arriba de cada lección: Ver el vídeo · Leer los contenidos · Hacer el test · Comentar o preguntar (opcional) · Valorar la clase (opcional), cada uno enlazado a su sección. |
| Valoración | 1-5 estrellas, «solo para ti». Evento `LESSON_RATING` (manda el último; `null` = quitada). No sale en el panel de admin ni en informes. |
| Dudas y comentarios | `academia_comments`. Para: Comunidad (por defecto) o Tutor; Tipo: Pregunta o Comentario. Al tutor es privado (solo la persona y el equipo) salvo que marque «Compartir». Las respuestas heredan destinatario, tipo y privacidad. «Me gusta» en lo compartido. «Retirar» no borra: el texto se conserva y solo lo ve el equipo. Máximo 4000 caracteres. El admin puede marcar resuelto, ocultar o borrar. |
| Certificado | Al completar todas las lecciones, la persona confirma su nombre y apellidos (nunca el correo) y se emite (`POST /v1/academia/courses/<curso>/certificate`). El nombre queda copiado en `full_name`. Si la cuenta no tenía nombre, se le pone este. Serial `EFS-<año>-<10 caracteres>`. |
| Notas | Privadas, una por lección; `revision` evita pisar cambios de otra pestaña. |

## Correos (`notify.js` + `utils/email.js`)

- **Alta nueva en un curso** (al matricularse ella misma en un curso abierto o al matricularla
  el equipo): confirmación a la persona y aviso interno a `ACADEMIA_NOTIFY_EMAIL` (si no,
  `NEW_USER_NOTIFY_EMAIL`; si no, oscarargumosa@gmail.com). El equipo (admin/scribe) se
  matricula solo al revisar y no genera correos.
- **Mensaje de un alumno «para el tutor»**: aviso a esa misma dirección con enlace a la lección.
- **Fuera de producción** (`NODE_ENV` ≠ `production`) no se escribe a personas reales: el aviso
  interno está apagado salvo `ACADEMIA_NOTIFY_ADMIN=1`, y la confirmación al alumno solo sale a
  correos de prueba (`ACADEMIA_TEST_EMAILS`, regex; por defecto `@example.invalid` y
  `alumno.*@eufundingschool.com`). En producción, `ACADEMIA_NOTIFY_ADMIN=0` apaga el aviso.
  Sin `RESEND_API_KEY` no se envía nada (solo queda en el log). Un correo que falla nunca tumba
  la matrícula ni el mensaje.

Variables de entorno (opcionales): `ACADEMIA_VIDEO_SAMPLES_PER_HOUR` (360 muestras de vídeo por
persona, lección y hora de reloj), `ACADEMIA_NOTIFY_EMAIL`, `ACADEMIA_NOTIFY_ADMIN`,
`ACADEMIA_TEST_EMAILS`. (`ACADEMIA_TEST_COOLDOWN_S` y `ACADEMIA_TEST_MAX_PER_DAY` ya no existen.)

`academia_events` solo crece: el código no tiene UPDATE ni DELETE sobre ella (tampoco la v2:
corazones y comentarios van en sus tablas; la valoración y la entrega de cada test se añaden
como eventos nuevos). No hay
trigger que lo impida (con binlog activo, crear triggers exige SUPER en producción).

## Cargar o actualizar un curso

```bash
python3 scripts/academia/build_eco_from_moodle.py      # Moodle curso 3 → data/academia/ecosistema-erasmus.json
node scripts/academia/import-course.js data/academia/ecosistema-erasmus.json --status=published --access=open
```

`import-course.js` es idempotente y conserva los ids (el progreso no se pierde). Si
cambian las preguntas de una lección crea una revisión nueva del test. No borra lecciones.
`status`: `draft` (solo admin), `published`, `hidden`. `access`: `open` (cualquiera con
cuenta se matricula al entrar) o `enrolled` (solo matrícula previa).

El primer curso, **El Ecosistema Erasmus+** (8 módulos, 60 lecciones, 600 preguntas),
sale del curso 3 del Moodle de EFS: texto y tests de `/opt/moodle/ecosistema-erasmus/`,
vídeos MP4 del CDN `efs-media.b-cdn.net` (permitido en `mediaSrc` del CSP de `server.js`)
y dossieres PDF de `eufundingschool.com/media/docs/`. El curso de Moodle está oculto.

## Estado

- Solo en dev (`dev.eufundingstudio.com/academia`). En producción el botón «Academia»
  sigue llevando al Moodle: `public/js/topbar.js` lo cambia a `/academia` solo en local y dev.
- Para llevarlo a producción: merge a `main`, que corre la migración 127, y después
  `import-course.js` contra la BD de producción. Decide Óscar.
- Migraciones de la v2: 140 (esquema e infografía por lección), 141 (corazones y
  comentarios), 142 (lecciones completadas con la regla anterior).
- Pendiente: cobro/matrícula de pago (TASK-011), el curso en inglés, el contenido real de
  esquemas e infografías (hoy vacíos; en dev la 1.1 lleva un esquema de prueba).
