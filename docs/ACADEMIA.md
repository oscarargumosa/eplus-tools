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
| Vídeo visto | Muestras de los últimos 30 s, seguidas, sin saltos y a ≤ 2,5x de velocidad real. Saltar al final no cuenta. |
| Test | Se abre con el vídeo visto **o** la lectura terminada. Opciones barajadas por intento; el intento guarda su copia congelada. Aprobado: 80 %. Intentos ilimitados, cuenta la mejor nota. |
| Lección completada | Al aprobar su test. |
| Certificado | Al completar todas las lecciones. Serial `EFS-<año>-<10 caracteres>`. |
| Notas | Privadas, una por lección; `revision` evita pisar cambios de otra pestaña. |

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
