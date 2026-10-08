# Academia nativa (cursos dentro de Studio)

Desde el 8-oct-2026 los cursos de EU Funding Studio se imparten dentro de la propia
app, no en el campus Moodle. La organización es la de las aulas de Proyecto Emociona;
la identidad visual, la de Studio (`DESIGN.md`).

- **Alumno:** `/academia` (catálogo) → `/academia/<curso>` (temario) →
  `/academia/<curso>/<lección>` (aula). Página propia `public/academia.html` +
  `public/js/academia.js` + `public/css/academia.css`, con la misma barra superior y
  el mismo login (JWT + cookie de refresco) que la SPA.
- **API:** `/v1/academia/*` → `node/src/modules/academia/` (`model.js` tiene todas las reglas).
- **Certificado público:** `/academia/certificado/<serial>` (verificación + imprimir a PDF).
- **BD:** `migrations/127_academia_cursos.sql` (tablas `academia_*`).
- El revisor interno de contenidos (`academy.html`, `/v1/academy`) es otra cosa y sigue igual.

## Reglas (las mismas que Emociona)

| Qué | Regla |
|---|---|
| Lectura | Portada + una hoja por párrafo. Para abrir una hoja nueva, la anterior ha estado abierta 7 s (hora del servidor). Con la última hoja, `READING_DONE`. Releer es libre. |
| Vídeo visto | El cliente manda la posición cada ~5 s (un `watchId` por visita). Con un mismo `watchId` hay que cubrir ≥ 70 % del vídeo y llegar al final. Solo suman los tramos entre dos muestras en los que el vídeo avanza lo que permite el reloj del servidor a ≤ 2,5x (+5 s); un salto no suma. |
| Test | Se abre con el vídeo visto **o** la lectura terminada. Preguntas y opciones barajadas por intento; el intento guarda su copia congelada. Aprobado: 80 %. Espera entre intentos (2 min) y máximo 5 entregas en 24 h mientras no se apruebe; cuenta la mejor nota. Suspenso: la corrección solo dice qué preguntas fallaste, no cuál era la buena. Aprobado: corrección completa. |
| Lección completada | Al aprobar su test. |
| Certificado | Al completar todas las lecciones, la persona confirma su nombre y apellidos (nunca el correo) y se emite (`POST /v1/academia/courses/<curso>/certificate`). El nombre queda copiado en `full_name`. Si la cuenta no tenía nombre, se le pone este. Serial `EFS-<año>-<10 caracteres>`. |
| Notas | Privadas, una por lección; `revision` evita pisar cambios de otra pestaña. |

Variables de entorno (opcionales): `ACADEMIA_TEST_COOLDOWN_S` (120), `ACADEMIA_TEST_MAX_PER_DAY` (5),
`ACADEMIA_VIDEO_SAMPLES_PER_HOUR` (360 muestras de vídeo por persona, lección y hora de reloj).

`academia_events` solo crece: el código no tiene UPDATE ni DELETE sobre ella. No hay
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
- Pendiente: panel de seguimiento para admin, cobro/matrícula de pago (TASK-011), el curso en inglés.
