# Prompt para el VPS

Monta en Moodle un curso llamado **Marketing y Ventas** a partir del fichero
`_MOODLE_VPS.json`, que contiene la estructura completa y los vídeos ya
alojados en Bunny Stream. Los vídeos NO se suben: ya están en Bunny, sólo hay
que embeberlos.

## Fichero de entrada

`_MOODLE_VPS.json` (~308 KB, autocontenido: no depende de ningún fichero local).

Raíz:

```json
{
  "library_id": "750561",
  "curso_moodle": "Marketing y Ventas",
  "embed_base": "https://iframe.mediadelivery.net/embed/750561/",
  "total_lecciones": 279,
  "total_videos": 232,
  "lecciones": [ ... ]
}
```

Cada entrada de `lecciones`:

| Campo | Tipo | Significado |
|---|---|---|
| `seccion` | str | Bloque de la web original (5 en total) |
| `seccion_n` | int | Orden de la sección, desde 1 |
| `curso` | str | Curso dentro de la sección (22 en total) |
| `curso_n` | int | Orden del curso dentro de su sección, desde 1 |
| `capitulo` | str | Capítulo dentro del curso |
| `capitulo_n` | int | Orden del capítulo, desde 1 |
| `leccion` | str | Título de la lección |
| `leccion_n` | int | Orden de la lección dentro del capítulo, desde 1 |
| `duracion_s` | int | Duración en segundos (0 si no hay vídeo) |
| `collection` | str | Colección en Bunny, formato `SS.CC Nombre del curso` |
| `video_id` | str/null | GUID del vídeo en Bunny. `null` si la lección es sólo texto |
| `texto` | str | Contenido de texto de la lección, en Markdown. Cadena vacía si no tiene |
| `tiene_video` | bool | Atajo de `video_id != null` |

**El orden correcto es `(seccion_n, curso_n, capitulo_n, leccion_n)`.** No te
fíes del orden del array; ordena explícitamente.

De las 279 lecciones, **232 tienen vídeo** y **47 son sólo texto**. **135
tienen texto** (con o sin vídeo). Una lección puede tener vídeo y texto a la
vez: en ese caso van los dos en la misma página, vídeo arriba.

## Estructura que hay que crear

Moodle tiene secciones planas, así que los 22 cursos originales se convierten
en **22 temas**, en este orden:

| Tema | Nombre | Lecciones |
|---|---|---|
| 1 | 01.01 Empieza Aquí | 6 |
| 2 | 01.02 Estrategias Iniciales | 1 |
| 3 | 02.01 Entendiendo las Bases | 7 |
| 4 | 02.02 Seleccion de Nicho y Creación de Oferta | 13 |
| 5 | 02.03 Creación de Contenido | 13 |
| 6 | 02.04 CLOSING- Como cerrar ventas | 8 |
| 7 | 02.05 Clones IA | 9 |
| 8 | 03.01 (Empieza aqui) Piezas Indispensables | 16 |
| 9 | 03.02 Email Marketing | 7 |
| 10 | 03.03 Appointment Setting | 8 |
| 11 | 03.04 Funnel Youtube Orgánico (Lead Magnet) | 10 |
| 12 | 03.05 Funnel VSL (con y sin Optin) | 19 |
| 13 | 03.06 Funnel LinkedIn Orgánico | 23 |
| 14 | 03.07 Grupo FB + Ciclo de Ventas | 12 |
| 15 | 03.08 Cold Email | 15 |
| 16 | 03.09 Cold Calling | 10 |
| 17 | 03.10 Grupo Skool | 13 |
| 18 | 03.11 Instagram Funnel | 31 |
| 19 | 04.01 Principios del Paid | 10 |
| 20 | 04.02 Anuncios (El oxígeno del Paid) | 9 |
| 21 | 04.03 Meta ADS (Facebook Ads & Instagram Ads) | 31 |
| 22 | 05.01 Top Llamadas Grupales | 8 |

El nombre del tema es el valor de `collection`, que ya viene con el prefijo
`SS.CC`. Usa el prefijo para ordenar y, si prefieres nombres limpios, quítalo
del título visible pero **conserva el orden**.

En el resumen de cada tema pon el nombre de la sección original (`seccion`),
para no perder el agrupamiento de los 5 bloques.

Dentro de cada tema, recorriendo las lecciones en orden:

- Cuando cambie `capitulo`, inserta una **Etiqueta** (`mod_label`) con el
  título del capítulo. Sirve de cabecera y es lo que replica los capítulos de
  la web original.
- Cada lección es una **Página** (`mod_page`) cuyo nombre es `leccion`.

Contenido de cada página:

- Si `tiene_video`, primero el iframe:

  ```html
  <div style="max-width:900px">
    <iframe src="https://iframe.mediadelivery.net/embed/750561/{video_id}?autoplay=false"
            loading="lazy"
            style="border:0;width:100%;aspect-ratio:16/9"
            allow="encrypted-media;picture-in-picture"
            allowfullscreen></iframe>
  </div>
  ```

- Después, si `texto` no está vacío, el texto convertido de Markdown a HTML.

## Acceso a Bunny

- Library ID: **750561** (nombre: `Agencia Eneryia`)
- Embed: `https://iframe.mediadelivery.net/embed/750561/{video_id}`
- No hace falta API key de Bunny para embeber. Sólo la necesitarías para
  cambiar ajustes de la librería.
- **Importante:** si la librería tiene activado *Token Authentication* o
  restricción por dominio, añade el dominio del Moodle a los *Allowed Referrers*
  o los vídeos darán error al reproducir. Compruébalo antes de dar el curso por
  bueno.
- Bunny puede seguir transcodificando parte de los 232 vídeos. Un vídeo aún en
  proceso embebe igual, pero no reproduce hasta que termina. No lo interpretes
  como un fallo del montaje.

## Cómo crearlo en Moodle

Usa la API de servicios web (`/webservice/rest/server.php`) con estas funciones:

- `core_course_create_courses` — crear el curso, `format: "topics"`,
  `numsections: 22`
- `core_course_edit_section` o `core_update_inplace_editable` — nombrar los temas
- `mod_page_add_instance` / `mod_label_add_instance` — o, si no están expuestas,
  crea las actividades con `core_course_import_course` desde una plantilla, o
  cae a inserción directa vía CLI de Moodle (`admin/cli/`) si tienes acceso al
  servidor.

Si los servicios web no dan para crear actividades (es lo más habitual: Moodle
no expone `mod_page_add_instance` por defecto), la vía fiable es un **script PHP
ejecutado dentro del Moodle** usando sus APIs internas:

```php
require_once('/ruta/a/moodle/config.php');
require_once($CFG->dirroot.'/course/lib.php');
require_once($CFG->dirroot.'/course/modlib.php');
// create_course(), add_moduleinfo() con modulename 'page' / 'label'
```

Decide tú la vía según lo que tenga habilitado el Moodle. Si usas servicios web,
comprueba antes con `core_webservice_get_site_info` qué funciones hay
disponibles, y dilo si falta alguna en vez de improvisar.

## Requisitos de la ejecución

- **Idempotente.** Si lo vuelves a lanzar, no debe duplicar temas ni
  actividades. Guarda un fichero de estado con el `id` de Moodle de cada
  elemento creado, indexado por `seccion_n.curso_n.capitulo_n.leccion_n`.
- **No borres nada** del Moodle existente. Sólo crear.
- Si una lección falla, sigue con las demás y regístrala; no abortes las 279.
- Al terminar, informa de: id y URL del curso creado, temas creados, páginas
  creadas, etiquetas creadas, y la lista de lo que haya fallado con el motivo.
  Da los números reales consultados a Moodle, no los que esperabas.

## Comprobación final

Cuenta en Moodle que hay **22 temas**, **279 páginas** y **50 etiquetas** (una por
capítulo), y contrasta contra el JSON. Si no cuadra, dilo con el número exacto de
diferencia en vez de darlo por bueno.
