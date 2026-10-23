# `data/estadisticas/` — datos de la sección Estadísticas (#estadisticas)

| Fichero | Qué es | Cómo se actualiza |
|---|---|---|
| `proyectos.json.gz` | Foto por columnas de los ~320k proyectos Erasmus+ concedidos (2014-2025) | `node scripts/estadisticas/build-snapshot.js` en el VPS (lee `erasmus-pg` en `localhost:5433`) y commitear |
| `lineas.json` | Nombre en español, grupo, gestión, sector, máximo y cierre de cada línea (`action_type`) | A mano, cada convocatoria nueva |
| `tasas.json` | Tasas de éxito (SEPIE / EACEA): la BD solo tiene concedidos | A mano |
| `poblacion.json` | Población por país (Banco Mundial), para «por millón de habitantes» | `node scripts/estadisticas/build-mundo.js` (también genera `public/data/mundo.geo.json`) |

El módulo `node/src/modules/estadisticas` carga la foto en memoria la primera vez que alguien
abre la sección (~100 MB, ~0,4 s) y calcula cada consulta recorriendo los arrays: no necesita
llegar a Postgres desde el contenedor de producción.

Una línea nueva que no esté en `lineas.json` sale igualmente, con su nombre en inglés y el
grupo deducido de la acción clave; conviene añadirle ficha.
