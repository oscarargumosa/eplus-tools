# Idiomas de la interfaz (español e inglés)

> Desde el 23-oct-2026. Decisión de Óscar: español e inglés para empezar.
> Código: `node/src/utils/i18n.js` (reglas), `node/src/middleware/i18nPages.js`
> (páginas y direcciones `/en/`), `public/js/i18n.js` (navegador),
> `scripts/i18n-check.js` (comprobación) y `public/i18n/en.json` (diccionario).

## La regla

**Todo texto nuevo o cambiado lleva su inglés en el mismo cambio.** No se traduce
en tandas. Si falta una traducción, la imagen no se construye (`RUN node
scripts/i18n-check.js` en el `Dockerfile`) y no se despliega.

Antes de hacer commit:

```bash
npm run i18n:check                         # informe
node scripts/i18n-check.js --faltan        # lo que falta, en JSON para pegar en en.json
node scripts/i18n-check.js --faltan --donde   # … con el fichero y la línea de cada texto
```

## Cómo funciona

- **El texto en español es la clave.** `public/i18n/en.json` es un único objeto
  `{ "Iniciar sesión": "Sign in", … }`. No hay `es.json`: el español está en el código.
- Si una traducción falta, se ve el español (nunca una clave rara).
- Si cambias un texto en español, su clave cambia: la comprobación pedirá el inglés nuevo.
- Los huecos se escriben `{nombre}` y deben estar iguales en los dos idiomas.
- Inglés británico (organisation, programme), como la documentación de la Comisión.
- Los términos oficiales del programa (KA220, Work Package, Part B) se quedan en inglés
  también en español. Los datos que vienen de la Comisión (convocatorias, entidades)
  se muestran como llegan.

## Dónde se decide el idioma

| Pieza | Idioma |
|---|---|
| Web pública (portada, misión, privacidad, recursos) | Por dirección: `/mision` en español, `/en/mision` en inglés. Visitar `/en/…` deja la preferencia en inglés. |
| App (`index.html`, `/entrar`…) | Cookie `studio_lang`; si no hay, el idioma del navegador (catalán, gallego y euskera → español). |
| Cuenta | `users.ui_lang` (migración 150). Al entrar manda la cuenta; si eligió idioma antes de entrar, se guarda en la cuenta. |
| Correos | `users.ui_lang` del destinatario (`langForEmail` en `utils/email.js`). |
| Mensajes de la API | `req.lang`: `error.message` y `data.message` se traducen solos si están en el diccionario. |

El selector **ES · EN** está en la barra superior, en la portada y en Mi cuenta ›
Preferencias. Es un enlace `?lang=en`: el servidor guarda la cookie y devuelve la
misma página en ese idioma (en la web pública, su dirección `/en/`).

Google ve cada dirección en su idioma: a los robots no se les redirige y las páginas
públicas llevan `hreflang`.

## Cómo marcar textos

### HTML

Un elemento con `data-i18n` es una **zona traducible**: se traducen todos sus textos
y los atributos `placeholder`, `title`, `aria-label` y `alt` (y en `<head>`, la
descripción y las etiquetas `og:`). El servidor traduce la página antes de enviarla.

```html
<section id="panel-account" class="panel" data-i18n> … </section>
<html lang="es" data-i18n>   <!-- página entera; además le da versión /en/ si es pública -->
```

Dentro de una zona:

- `translate="no"`: no se traduce (nombres propios, códigos, el propio selector).
- Los iconos (`material-symbols-outlined`) y `code`, `pre`, `textarea` y `svg` se saltan solos.
- `data-i18n-html`: el elemento se traduce **entero, como una frase**. Úsalo cuando una
  frase lleva `<b>`, `<a>`, `<em>`… dentro: si no, cada trozo se traduce por separado.
  La clave es su HTML interior.

**Ojo:** un texto que el JS pinta después (con `textContent`, `innerHTML`) no lo ve el
servidor: tiene que pasar por `_t()`.

### JavaScript del navegador

```js
_t('Guardado')
_t('Te hemos enviado un correo a {email}.', { email })
btn.innerHTML = '<span>' + _t('Solicitar acceso') + '</span>';
`<p>${_t('Cargando…')}</p>`
```

- Dentro de `_t()` va **un literal**, nunca una variable ni `${…}` (la comprobación lo
  necesita para encontrarlo).
- `I18N.lang` da el idioma activo (`'es'` | `'en'`). Úsalo para fechas:
  `toLocaleDateString(I18N.lang === 'en' ? 'en-GB' : 'es-ES', …)`.
- `I18N.apply(el)` traduce con las reglas del HTML un trozo que pintes tú (no hace
  falta si ya usas `_t()`).
- `public/js/i18n.js` debe cargarse en `<head>`, sin `defer`, antes que el resto.

### Servidor

```js
res.status(400).json({ ok: false, error: { code: 'VALIDATION', message: 'Email no válido' } });  // se traduce solo
req.t('Texto con {x}', { x })        // dentro de una petición
tl(lang, 'Confirma tu email')        // fuera de una petición (correos)
```

## Ficheros ya migrados

`public/i18n/migrados.json` lista los JS y ficheros del servidor ya pasados al sistema.
En ellos la comprobación **no deja pasar** un texto en español fuera de `_t()` (navegador)
o fuera del diccionario (servidor). Los HTML se comprueban solos: todo lo que esté
dentro de una zona `data-i18n`.

Para textos que nadie ve (avisos internos para el equipo, claves), comentario
`i18n-no` en la línea, o el bloque entre `i18n-no-inicio` e `i18n-no-fin`. Los
`console.*` no cuentan.

## Migrar una sección nueva

1. En `index.html`, `data-i18n` en su `<section id="panel-…">`.
2. En su JS, cada texto visible por `_t()`; añade el fichero a `migrados.json`.
3. Sus mensajes del servidor, en español; añade el controlador a `migrados.json`.
4. `node scripts/i18n-check.js --faltan` → traducir → pegar en `en.json`.
5. Probar con `?lang=en` y volver con `?lang=es`.

### Estado

- **Fase 1 (23-oct-2026):** barra superior, entrada y registro, barra lateral, Mi cuenta,
  pantalla de fase beta, indicador de guardado, correos de la cuenta, web pública
  (portada, misión, privacidad, recursos).
- **Pendiente, por secciones:** Convocatorias, EU Vision, Entidades, Movilidades,
  Estadísticas, Proyectos (Diseñar, Escribir, Diagnóstico, Evaluar…), Academia, Admin.
  Mientras tanto, esas secciones se ven en español aunque se elija inglés.
