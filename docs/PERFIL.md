# Perfil de la persona y primer acceso (23-oct-2026)

Decisión de Óscar: un solo perfil, el de **Mi cuenta**, y empujar a completarlo sin obligar.

## Qué es «perfil completo»

| Paso | Hecho cuando | Dónde se guarda |
|---|---|---|
| Foto | hay foto propia (subida o de Google) | `users.avatar_url` |
| Teléfono | hay teléfono | `users.phone` — **privado**: solo el equipo (Admin › Usuarios y accesos). Nunca sale en la Comunidad ni a otros usuarios. |
| Entidad | vinculada en «Mi entidad» o «No pertenezco a ninguna entidad» | `user_organizations` / `community_profiles.no_organization` |
| Ubicación | hay un punto en el mapa: se busca el pueblo o ciudad (Photon, de OpenStreetMap, vía `GET /v1/profile/places`) o se pulsa en el mapa | `community_profiles.lat/lng`, redondeado a 2 decimales (~1 km) |
| Sobre ti | cargo y presentación | `community_profiles.headline/bio` (+ roles, ámbitos y programas, opcionales) |

`community_profiles` es la tabla del perfil único (misma forma que las migraciones 145/146 de la
Comunidad; aquí la crea la 152). La Comunidad, cuando llegue a main, lee este mismo perfil y solo
decide si se muestra (`visible`), a quién llega la ubicación (`location_audience`) y «busco/ofrezco
socios». La API del perfil **nunca** toca esas columnas.

## Cómo se empuja

- **Primer acceso** (`users.profile_wizard_at` vacío): asistente con bienvenida y los pasos que falten,
  cada uno con «Omitir». Al abrirlo se marca visto (`POST /v1/profile/me/wizard-seen`): no vuelve a salir entero.
- **Después**: al entrar, una ventana corta con solo lo que falta, «Completar ahora» y «Ahora no».
  Una vez por sesión: no se repite en la misma pestaña ni en otra pestaña abierta en menos de 4 h;
  al cerrar sesión se borra la marca, así que la siguiente entrada lo recuerda.
- **Siempre**: anillo de progreso (lima = hecho) y punto rojo en el círculo del usuario, línea
  «Completar mi perfil · N %» en su menú, lista «Tu perfil» en Mi cuenta › Perfil (cada fila abre su
  paso) y tarjeta en Inicio (solo la ve quien tiene el área Proyectos).

## API — `/v1/profile` (con sesión)

| Ruta | Qué hace |
|---|---|
| `GET /me` | Perfil, entidades, `completion` (`steps`, `missing`, `percent`), `wizard_pending` y catálogo (roles, ámbitos, programas, países con prefijo telefónico) en el idioma de la petición. |
| `PATCH /me` | Guarda **solo los campos que llegan**: `phone`, `headline`, `bio`, `roles`, `sectors`, `actions`, `organization_id`, `no_organization`, `country`, `location` (`{lat,lng,label}` · `{source:'organization'}` · `null`). |
| `POST /me/wizard-seen` | Asistente del primer acceso visto. |
| `GET /places?q=&lat=&lng=` | Pueblos y ciudades que se llaman así (hasta 6, con provincia y país), cerca del centro del mapa si se pasa. Photon (photon.komoot.io), sin clave; 24 h en memoria; 60 por minuto y persona. |

Reglas: teléfono con prefijo (`+34 600112233`, se guarda separando el prefijo); sin correos en
cargo, presentación o lugar (`NO_CONTACT`); la entidad elegida debe ser una de las suyas (`ORG_INVALID`).

Código: `node/src/modules/profile/`, `public/js/perfil.js`, `public/css/perfil.css`, migración `152_perfil_usuario.js`.
