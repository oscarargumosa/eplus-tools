# Importador de cursos a Moodle (campus.eufundingschool.com)

`import-course.php` monta un curso completo en el Moodle del campus a partir de
un JSON de lecciones con vídeos ya alojados en **Bunny Stream** (no se sube
ningún vídeo: sólo se embeben).

## Qué crea

| Elemento del JSON | Elemento en Moodle |
|---|---|
| `collection` (`SS.CC Nombre`) | un **tema** (formato `topics`), en orden `seccion_n.curso_n` |
| `seccion` | el **resumen** del tema (conserva el agrupamiento de los bloques originales) |
| cambio de `capitulo` | una **Etiqueta** (`mod_label`) que hace de cabecera |
| `leccion` | una **Página** (`mod_page`): iframe de Bunny arriba + texto debajo |

El orden se calcula siempre por `(seccion_n, curso_n, capitulo_n, leccion_n)`,
nunca por el orden del array.

## Vía elegida: PHP CLI dentro del Moodle

Moodle **no expone `mod_page_add_instance` ni `mod_label_add_instance`** como
servicios web por defecto, así que el script usa las **APIs internas**
(`create_course()`, `course_update_section()`, `add_moduleinfo()`) cargando el
`config.php` del propio Moodle. Hay que ejecutarlo en el servidor/contenedor
del campus.

## Uso

```bash
# 0) Comprobar el JSON sin tocar Moodle (se puede hacer en local)
php scripts/moodle/import-course.php \
    --json=data/moodle/marketing-ventas.json --dry-run

# 1) Ver las categorías y elegir la galería de cursos destino
php scripts/moodle/import-course.php --moodle=/var/www/html --list-categories

# 2) Prueba con 3 lecciones antes de la pasada completa
php scripts/moodle/import-course.php \
    --json=data/moodle/marketing-ventas.json \
    --moodle=/var/www/html --category=<ID> --limit=3

# 3) Pasada completa (relanzable: no duplica)
php scripts/moodle/import-course.php \
    --json=data/moodle/marketing-ventas.json \
    --moodle=/var/www/html --category=<ID>

# 4) Comprobación final: cuenta en Moodle y contrasta con el JSON
php scripts/moodle/import-course.php \
    --json=data/moodle/marketing-ventas.json \
    --moodle=/var/www/html --check
```

Opciones: `--shortname` (por defecto `MKTVENTAS`), `--fullname`, `--state`
(fichero de estado, por defecto `<json>.state.json`), `--keep-prefix` (conserva
`SS.CC ` en el título visible del tema; por defecto se quita y el orden se
mantiene igual), `--limit=N`, `--help`.

## Idempotencia y seguridad

- **Fichero de estado** con el id de Moodle de cada elemento, indexado por
  `seccion_n.curso_n.capitulo_n.leccion_n`. Se guarda tras cada creación, así
  que un corte a mitad se retoma sin duplicar.
- Si el curso ya existe (por `--state` o por `shortname`) **se reutiliza**, no
  se crea otro.
- Si un cmid del estado ya no existe en Moodle (borrado a mano), se recrea.
- **El script sólo crea.** No borra ni modifica nada preexistente del campus.
- Si una lección falla, se registra y **sigue con las demás**; al final lista
  los fallos y sale con código 2.
- El informe final cuenta **con consultas a Moodle**, no con lo esperado.

## Notas sobre los datos

- El campo `texto` **no viene en Markdown** pese a lo que decía el encargo
  original: los 135 textos son documentos **TipTap/ProseMirror serializados en
  JSON**. El script los convierte a HTML (`paragraph`, `heading`, `bulletList`,
  `orderedList`, `listItem`, `blockquote`, `codeBlock`, `horizontalRule`,
  `hardBreak`, `image`, y marcas `bold`/`italic`/`underline`/`link`). Los `h1`
  se degradan a `h2` porque el `h1` lo pone la propia página de Moodle.
- Los enlaces se abren en pestaña nueva (`target="_blank" rel="noopener"`).
- Bunny: library **750561**. Si la librería tiene *Token Authentication* o
  restricción por dominio, hay que añadir `campus.eufundingschool.com` a los
  *Allowed Referrers* o los vídeos no reproducirán. Un vídeo aún en
  transcodificación embebe bien pero no reproduce: no es un fallo del montaje.

## Verificación esperada para `marketing-ventas.json`

22 temas · 279 páginas · 50 etiquetas · 232 vídeos embebidos · 135 lecciones
con texto. `--dry-run` ya confirma esos números contra el JSON.
