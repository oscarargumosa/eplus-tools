# EU Funding Studio — Reglas de diseño

> Manual de marca de EU Funding Studio (oct-2026). Tokens: `web/brand/tokens.css`, reflejados a mano en el
> `tailwind.config` de `public/index.html`. Sistema completo en `docs/DESIGN.md`.
> No confundir con EU Funding School (`web/wordpress`, `web/presentation`): otra marca, otra paleta.

## Paleta

| Token Tailwind | Hex | Uso |
|---|---|---|
| `ink` / `on-surface` | `#222351` | Texto largo, fondos muy oscuros |
| `primary` | `#3C45A3` | Color principal: títulos, barra superior y lateral, botones primarios |
| `violet` | `#514DAA` | Hover/activo del azul, degradados |
| `lavender` | `#997FC7` | Acento de apoyo (bloques de datos, iconos decorativos). **No es color de texto** |
| `lavender-soft` | `#E7E1F3` | Chips, avisos, estados vacíos; texto secundario sobre azul |
| `secondary-fixed` (lima) | `#D6E949` | CTA, resaltados, la pieza protagonista |
| `secondary-fixed-dim` | `#C3D63A` | Hover/active de lo lima |
| `cream` / `surface-container` | `#F0EDEB` | Tarjetas y paneles sobre blanco |
| `surface` | `#F8F7F5` | Fondo general de la app |
| `on-surface-variant` | `#55577A` | Texto secundario |
| `outline` / `outline-variant` | `#8A8AA3` / `#D6D3DC` | Contornos / líneas suaves |
| `error` | `#BA1A1A` | Error y peligro |

Aviso suave (no peligro): fondo `#F3F8D2`, borde `#D6E949`, texto azul o tinta.

## Tipografía

Solo **Poppins** (300–700 e itálicas).
- Titulares: SemiBold/Bold (600/700) en azul.
- Remate de titular en *itálica* y, a veces, marcador lima detrás de una palabra: solo en portadas y páginas públicas.
- Cifras grandes (KPIs, contadores, fechas): Light (300) en azul.
- Cuerpo: Medium (500); texto denso Regular (400).

## Botones

| Tipo | Estilo |
|---|---|
| CTA principal | `rounded-full` · fondo lima `#D6E949` · texto azul `#3C45A3` · hover `#C3D63A` |
| Primario de formulario (Guardar, Crear) | `rounded-full` o `rounded-xl` · fondo azul · texto blanco · hover `#514DAA` |
| Secundario / Cancelar | transparente · borde azul · texto azul · hover `bg-lavender-soft` |
| Peligro / Borrar | texto y borde rojo `#BA1A1A`; relleno rojo solo en hover o en el modal de confirmación |

## Contraste y color

- Mínimo WCAG AA: 4,5:1 en texto normal.
- **Nunca texto lima sobre blanco o crema** (1,3:1). La lima es fondo, subrayado o marcador.
- Lavanda `#997FC7` no sirve para texto pequeño sobre blanco (≈3:1): usa azul, violeta o tinta.
- Sobre azul: texto blanco, lima o `#E7E1F3`; nunca lavanda `#997FC7`.
- Nada de verdes, turquesas, ámbares, naranjas ni azules/índigos de Tailwind decorativos.
- Excepción semántica: rojo para error/peligro y verde para «correcto/aprobado» (p. ej. corrección de tests).
  Un estado «activo/disponible» va en lima o azul.
- Un solo elemento protagonista en lima por pantalla o tarjeta.

## Formas

- Tarjetas crema sobre blanco (o blancas sobre fondo `surface`), radios 16–24px (`rounded-2xl`/`rounded-3xl`).
- Sobre fondo azul: tarjetas crema o blancas.
- Sombras teñidas de azul (`rgba(60,69,163,.06–.10)`), nunca negras.
- Animaciones sutiles, 0,2–0,3 s.

## Logos (`public/img/marca/`)

- `logo-horizontal-{azul,blanco,tinta,negro}.svg` (proporción ≈ 9,34:1): azul sobre claro, blanco sobre azul.
- `icono-{azul,blanco,lima,tinta,negro}.svg`: el lápiz/«E», device de marca (lima sobre azul o azul sobre lima).
- `favicon.svg`, `favicon-*.png`, `apple-touch-icon.png`.
- `logo-horizontal-blanco-correo.png` (448×48, fondo azul): cabecera de los correos (los SVG no se ven en Gmail/Outlook).
