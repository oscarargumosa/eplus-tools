# DESIGN.md — Sistema visual de EU Funding Studio

> Manual de marca de EU Funding Studio (oct-2026). Reglas prácticas para la app: `DESIGN.md` (raíz).
> Tokens: `web/brand/tokens.css`. EU Funding School (`web/wordpress`, `web/presentation`) es otra marca y no sigue este documento.

## 1. Identidad

- **Marca:** EU Funding Studio — herramienta para diseñar proyectos europeos (convocatorias, socios, redacción, academia).
- **Dominio:** `eufundingstudio.com`.
- **Tono:** cercano y claro, sin jerga técnica en la interfaz.
- **Lema del manual:** «write *your future.*» — el lápiz/«E» del logo es la idea de escribir el propio futuro.

## 2. Paleta (de oscuro a claro)

| Nombre | Hex | Rol |
|---|---|---|
| Tinta | `#1b0759` | Texto largo, fondos muy oscuros, sombras |
| Azul de marca | `#4312d8` | Color principal: títulos, barras, botones primarios, fondos de marca |
| Violeta | `#7349f0` | Hover/activo del azul, degradados, segundo azul |
| Lavanda | `#b392f6` | Acento de apoyo: bloques de datos, iconos decorativos |
| Lavanda suave | `#efe8fe` | Fondos suaves (chips, avisos, vacíos); texto secundario sobre azul |
| Lima | `#e9ff60` | Acento: CTA, resaltados, subrayados, pieza protagonista |
| Lima oscuro | `#d4ec3c` | Hover/active de lo lima |
| Crema | `#f2f2f2` | Tarjetas y paneles sobre blanco, fondos de sección |
| Fondo app | `#f8f8f8` | Fondo general (blanco cálido) |
| Blanco | `#FFFFFF` | Contenido |

Neutros: texto secundario `#55577A`, contorno `#8A8AA3`, líneas suaves `#D6D3DC`.
Semánticos: error `#BA1A1A`; verde solo para «correcto/aprobado»; aviso suave `#f8ffd9` + borde lima.

## 3. Tipografía

**Única familia: Poppins**, pesos 300–700 con itálicas.

- Titulares: SemiBold (600) o Bold (700), azul.
- Remate en *itálica* («write *your future.*») y marcador lima detrás de una palabra: con mesura, en portadas y páginas públicas.
- Cifras grandes: Light (300), azul.
- Cuerpo: Medium (500); denso: Regular (400).

## 4. Rasgos de estilo

- **Botones en píldora** para llamadas a la acción. CTA = lima + texto azul. Primario de formulario = azul + texto blanco. Secundario = borde azul + texto azul.
- **Tarjetas crema** `#f2f2f2` con radios generosos (16–24px) sobre blanco; sobre azul, tarjetas crema o blancas.
- **Icono como device**: el lápiz/«E» puede ir como acento decorativo (lima sobre azul, azul sobre lima o en lavanda suave de fondo).
- **Marcador lima** detrás de una palabra o nombre (degradado a media altura, no subrayado fino).
- Un solo elemento protagonista en lima por pantalla o tarjeta.

## 5. Contraste

- WCAG AA mínimo (4,5:1 texto normal).
- Lima nunca como texto sobre blanco o crema (1,3:1).
- Lavanda `#b392f6` nunca como texto pequeño sobre blanco ni como texto sobre azul.
- Sobre azul: blanco, lima o `#efe8fe`.
- Azul sobre lima y blanco sobre azul superan 6:1.

## 6. Qué evitar

- Verdes, turquesas, ámbares, naranjas o azules/índigos de Tailwind decorativos.
- Grises azulados antiguos: usar lavanda suave, crema o `#D6D3DC`.
- Esquinas duras en tarjetas; sombras negras.
- Más de un protagonista lima por vista.

## 7. Logos (`public/img/marca/`)

| Fichero | Uso |
|---|---|
| `logo-horizontal-azul.svg` | Sobre blanco/crema (certificado, páginas claras) |
| `logo-horizontal-blanco.svg` | Sobre azul (barra superior) |
| `logo-horizontal-{tinta,negro}.svg` | Monocromo, impresión |
| `icono-{azul,blanco,lima,tinta,negro}.svg` | Device/icono suelto |
| `favicon.svg`, `favicon-*.png`, `apple-touch-icon.png` | Pestaña e iconos de app |
| `logo-horizontal-blanco-correo.png` | Cabecera de correos (448×48 a 2x, fondo azul); los SVG no se ven en Gmail/Outlook |

Proporción del horizontal ≈ 9,34:1. Respetar aire alrededor; no recolorear ni deformar.

## 8. Aplicación por medio

| Medio | Dónde |
|---|---|
| App (SPA) | `public/index.html` (Tailwind config), `public/css/*.css` |
| Correos transaccionales | `node/src/utils/email.js`: cabecera azul con logo PNG, botón píldora lima, pie crema |
| Certificado de la academia | `node/src/modules/academia/certificate-page.js`: logo azul, marcador lima en el nombre, panel crema, A4 apaisado |

## 9. Tokens técnicos

Fuente: `web/brand/tokens.css`. Tailwind CDN no lo lee: **al cambiarlo, reflejarlo en `theme.extend.colors` de `public/index.html`**.
