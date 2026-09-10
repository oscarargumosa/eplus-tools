# BRAND KIT WEB — EU Funding Studio / EU Funding School

> **Para qué sirve este fichero:** es el briefing de marca que se le pasa a cualquier
> programa, agencia o IA externa que tenga que construir una **landing, embudo de ventas
> o página HTML** del ecosistema. Pegar este documento entero en el prompt del otro
> programa; con esto y el esqueleto `web/brand/efs-funnel-starter.html` basta para que
> lo que produzca salga on-brand a la primera.
>
> **Fuentes de verdad de las que deriva** (si algo aquí choca, gana el fichero original):
> - `web/brand/tokens.css` — tokens canónicos
> - `docs/DESIGN.md` — sistema visual completo
> - `DESIGN.md` (raíz) — reglas de componentes del tool
> - `web/wordpress/astra-eufunding/academia-page-content.html` — **la página de venta real y viva**; el mejor ejemplo ejecutado de esta estética

---

## 0 · Los tres nombres (no confundirlos en el copy)

| Nombre | Qué es | Cuándo aparece en una landing |
|---|---|---|
| **EU Funding Studio** | El ecosistema y la metodología. Marca conceptual. | Firma metodológica, secciones de "cómo trabajamos" |
| **EU Funding School** | La marca **comercial y pública** (`eufundingschool.com`) | Logo, header, footer, dominio, todo lo que ve el cliente |
| **E+ Tools** | El producto SaaS (`intake.eufundingschool.com`) | CTAs de "entrar a la app", demos de producto |
| **FUN-DESIGN™** | La metodología de 9 fases | Siempre con ™ y en mayúsculas con guion |

**Tesis de marca, literal:** *"No vendemos IA. Vendemos Better Projects."*

---

## 1 · Paleta — solo 3 colores construyen la identidad

```
NAVY      #1b1464   ← el único azul de marca. Títulos, cuerpo, nav, iconos, botones, bandas oscuras
AMARILLO  #fbff12   ← lima. CTA, highlights, subrayados, flechas, devices. NUNCA texto de párrafo
BLANCO    #ffffff   ← fondo por defecto
```

De apoyo (nunca protagonistas):

```
LAVANDA        #c7afdf   cards secundarias, pills, acentos suaves, fondos de sección
LAVANDA SUAVE  #f1ecf7   fondo de bloque destacado (derivado, usado en la página viva)
GRIS MEDIO     #cccccc   separadores, bordes, pills inactivas
GRIS CASI BCO  #f8f8f8   fondo de app, cards suaves
TEXTO          #191c1e   cuerpo
TEXTO MUTED    #474551   secundario, placeholders
LÍNEA LAVANDA  #e3ddec   bordes de card en páginas de marketing
ERROR          #ba1a1a   solo error/danger
AMARILLO DIM   #e7eb00   hover/active del CTA amarillo
```

### Prohibiciones de color (duras)
- ❌ **Nada de verde, ámbar ni naranja.** En ninguna parte, ni en iconos, ni en "éxito".
- ❌ **Nada de degradados de colores** salvo el único permitido: `linear-gradient(180deg,#f1ecf7,#fff)` para destacar una card de precio.
- ❌ **Amarillo como color de texto en párrafos.** Ilegible. El amarillo es fondo, subrayado, device o texto de botón sobre navy — nunca copy corrido.
- ❌ Rojo fuera de error/borrado.
- ❌ Azules que no sean `#1b1464`. No hay azul claro, ni azul secundario, ni "azul de link".

---

## 2 · Tipografía — Poppins y solo Poppins

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
```

| Nivel | Peso | Tamaño | Color | Notas |
|---|---|---|---|---|
| H1 hero | 800 (o 900 en portada) | `clamp(40px, 6.5vw, 74px)`, line-height 1 | navy | **Máximo 2 líneas.** MAYÚSCULAS solo si es portada |
| H2 sección | 700 | `clamp(26px, 3.2vw, 36px)`, lh 1.15 | navy | Title case |
| H3 | 700 | 19–21px | navy (o lavanda si es decorativo) | |
| Eyebrow | 800 | 13px, `letter-spacing:.14em`, uppercase | navy | El micro-título sobre el H2 |
| Lead / subtítulo | 400–500 | `clamp(17px,2vw,22px)` | muted | máx 820px de ancho |
| Cuerpo | **500 (medium es el default)** | 16px, lh 1.6 | `#191c1e` | 400 solo para texto muy denso |
| Micro (pills, meta) | 500–700 | 12–14px | según fondo | |

- ❌ No mezclar con ninguna otra familia.
- ❌ MAYÚSCULAS fuera de: portada, eyebrow, micro-tags, nombres de sección.
- Títulos con `letter-spacing:-0.02em` (H1) / `-0.01em` (H2).

---

## 3 · Geometría, sombra y layout

```css
--wrap: min(1140px, 92%);   /* contenedor centrado */
section { padding: 56px 0; }

/* Radios de MARKETING (landing / embudo) — generosos */
botones ........ 12px
cards .......... 16–20px
bloques grandes  24px
pills / chips .. 999px (siempre cápsula completa)

/* Sombra única de marca — basada en el navy, NUNCA negro puro */
box-shadow: 0 24px 48px rgba(27, 20, 100, .06);   /* soft, default */
box-shadow: 0 24px 48px rgba(27, 20, 100, .10);   /* medium, hover/destacado */
```

> ⚠️ **Divergencia deliberada que hay que respetar:** `web/brand/tokens.css` define radios
> pequeños (2–12px) — **esos son del SaaS**, que es una herramienta densa. Las páginas
> **públicas de marketing usan radios grandes (12–24px)**, como la página `/academia/` viva.
> Un embudo de ventas usa los grandes. Nunca esquinas duras (`border-radius:0`) en ninguna card.

- Aire generoso. No saturar cards.
- Grid responsive: 3 columnas → 1 columna bajo 900px (breakpoint único, no hace falta más).
- Animaciones sutiles: `transition: transform .12s ease` / `.2s–.3s ease`. Hover de card o botón = `translateY(-2px)`.

---

## 4 · Componentes canónicos (copiar tal cual)

### Botones
```html
<a class="btn primary">Empieza gratis</a>   <!-- fondo AMARILLO + texto NAVY. El CTA principal -->
<a class="btn secondary">Ver cómo funciona</a> <!-- borde navy 2px + texto navy, fondo transparente -->
```
```css
.btn{padding:14px 24px;border-radius:12px;font-weight:700;font-size:16px;
     text-decoration:none;display:inline-block;transition:transform .12s ease}
.btn:hover{transform:translateY(-2px)}
.btn.primary{background:#fbff12;color:#1b1464}
.btn.secondary{border:2px solid #1b1464;color:#1b1464}
```
> **Regla:** en la **web de marketing** el CTA es *amarillo con texto navy*.
> Dentro del **SaaS** se invierte: *navy con texto amarillo* (`bg-[#1b1464] text-[#fbff12]`),
> que es la firma interactiva del tool. No mezclar los dos criterios en la misma superficie.

### Pill / chip
```css
.pill{background:#f1ecf7;border:1px solid #c7afdf;color:#1b1464;
      padding:8px 15px;border-radius:999px;font-size:14px;font-weight:700}
```

### Card
```css
.card{background:#fff;border:1px solid #e3ddec;border-radius:18px;padding:26px;
      box-shadow:0 24px 48px rgba(27,20,100,.06)}
```

### Banda manifiesto (el bloque navy que corta la página)
```css
.manifesto{background:#1b1464;color:#fff;border-radius:24px;padding:44px 40px;text-align:center}
.manifesto h2{color:#fff}
.manifesto p{color:#d9d5f0;max-width:760px;margin:14px auto 0;font-size:18px}
.manifesto .hl{color:#fbff12;font-weight:700}   /* ← única vez que el amarillo es texto: 2-3 palabras sobre navy */
```

### Card de precio destacada
```css
.pkg.hot{border:2px solid #1b1464;background:linear-gradient(180deg,#f1ecf7,#fff)}
.pkg .noexp{background:#fbff12;color:#1b1464;font-weight:700;font-size:12px;
            padding:4px 10px;border-radius:999px}   /* el badge amarillo que remata la oferta */
```

### Bullet con cuadradito amarillo (la firma de las listas)
```css
ul.feat{list-style:none;padding-left:0}
ul.feat li{position:relative;padding-left:26px;margin:10px 0}
ul.feat li::before{content:"";position:absolute;left:0;top:8px;width:10px;height:10px;
                   border-radius:3px;background:#fbff12;border:1px solid #1b1464}
```

---

## 5 · Brand devices — el sello visual (usar con intención, no de adorno)

Trazo **orgánico dibujado a mano, nunca geométrico**, siempre en `#fbff12`,
`stroke-linecap:round`. Catálogo completo en `web/brand/devices/brand-devices-preview.svg`
(30 variantes). Los cinco que más rinden en una landing:

1. **Subrayado a mano** bajo la palabra clave del H1
2. **Flecha amarilla** dirigiendo la mirada al CTA
3. **Círculo/óvalo suelto** rodeando un dato o precio
4. **Highlight marker** (rectángulo irregular de fondo) tras 2–3 palabras
5. **Comillas grandes amarillas** en un testimonio

SVG listo para pegar (subrayado):
```html
<svg viewBox="0 0 200 14" preserveAspectRatio="none" aria-hidden="true"
     style="position:absolute;left:0;bottom:-2px;width:100%;height:.4em">
  <path d="M4,9 C50,3 100,12 150,6 C170,3 185,8 196,5"
        fill="none" stroke="#fbff12" stroke-width="7" stroke-linecap="round"/>
</svg>
```
(el `<span>` que lo contiene lleva `position:relative` y el SVG va **detrás** del texto con `z-index:-1`, o delante con `mix-blend-mode:multiply`).

---

## 6 · Reglas de composición (las que más se incumplen)

1. **Un solo elemento protagonista por pantalla** — el que lleva el amarillo. Si hay dos cosas amarillas compitiendo, está mal.
2. **Máximo 2 acentos por vista.** Amarillo + lavanda es el techo.
3. **Highlight amarillo: máximo 2–3 palabras por pantalla.**
4. **H1 de máximo 2 líneas.**
5. Imágenes: **personas reales estudiando o trabajando**. Nada de stock corporativo genérico, nada de ilustraciones 3D, nada de "IA futurista" (azules brillantes, circuitos, cerebros). La marca vende proyectos mejores, no tecnología.
6. Iconografía: **Material Symbols** (la que ya usa el ecosistema), en navy, trazo fino.
7. Emojis: solo como marcador de fase/herramienta en documentación interna. **En una landing pública, no.**

---

## 7 · Voz y copy

- **Tono:** didáctico formal con guiños cercanos. **No acartonado.**
- **Idioma:** español. Terminología del sector en inglés y sin traducir: *Form Part B, Design Capacity, Design Missions, work package, call, consortium, European Added Value*.
- Frases cortas. Se afirma, no se promete. Se dice lo que **no** somos antes de lo que somos — es un recurso recurrente de la marca:
  > *"No es un curso. No es una suscripción."*
  > *"No vendemos cursos. No cobramos meses."*
  > *"No vendemos IA. Vendemos Better Projects."*
- Nunca hablar de "IA que escribe tu proyecto". La IA es **un equipo de especialistas coordinados**, la persona sigue al mando (modelo *Human + AI*).
- ❌ Prohibido en copy: "revolucionario", "disruptivo", "potenciado por IA", "gracias a la inteligencia artificial", garantías de concesión de subvención.

---

## 8 · Estructura recomendada de embudo (orden de secciones)

Es la estructura que ya sigue `/academia/` y la que debe replicar cualquier embudo nuevo:

| # | Sección | Función | Nota de marca |
|---|---|---|---|
| 1 | **Hero** | eyebrow + H1 (2 líneas, con subrayado amarillo en 2 palabras) + lead + pills + 2 CTAs | El CTA primario amarillo es el protagonista |
| 2 | **Manifiesto** | banda navy a todo ancho con la negación + la promesa | Aquí van los `.hl` amarillos |
| 3 | **Problema** | por qué fracasan los proyectos europeos | Sin amarillo. Cards blancas sobre `#f8f8f8` |
| 4 | **Solución / método** | las 9 fases FUN-DESIGN™ o el subconjunto relevante | Grid de 3, iconografía navy |
| 5 | **Prueba** | datos reales, proyectos, entidades, tasa histórica | Números grandes en navy 800 |
| 6 | **Oferta** | los 3 paquetes de Design Capacity | La card central `.hot`, badge amarillo "no caduca" |
| 7 | **Objeciones / FAQ** | acordeón o grid de 2 | Fondo lavanda suave `#f1ecf7` |
| 8 | **Cierre** | banda navy + CTA único | Un solo botón, sin alternativa |

**Datos comerciales reales** (verificar con Óscar antes de publicar, el modelo evoluciona — base en `docs/DESIGN_CAPACITY_SYSTEM.md`):
- Starter — 500.000 € de capacidad — **1.200 €** pago único
- Professional — 2.000.000 € — **4.000 €** pago único
- Enterprise — 10.000.000 € — **15.000 €** pago único
- Argumento central: **la capacidad no caduca**, no hay renovación anual, se consume solo al activar una propuesta.

---

## 9 · Bloque de tokens listo para pegar

```css
:root{
  /* Core */
  --nv:#1b1464;      /* navy — el único azul */
  --yl:#fbff12;      /* amarillo lima */
  --yld:#e7eb00;     /* amarillo hover */
  --lv:#c7afdf;      /* lavanda */
  --lvs:#f1ecf7;     /* lavanda suave */
  /* Neutros */
  --bg:#ffffff; --surf:#f8f8f8; --ln:#e3ddec; --ln2:#cccccc;
  --tx:#191c1e; --mut:#474551;
  --err:#ba1a1a;
  /* Tipografía */
  --font:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
  /* Geometría */
  --r-btn:12px; --r-card:18px; --r-block:24px; --r-pill:999px;
  --sh:0 24px 48px rgba(27,20,100,.06);
  --sh-md:0 24px 48px rgba(27,20,100,.10);
  --wrap:min(1140px,92%);
}
```

---

## 10 · Checklist de aceptación

Antes de dar por buena una página, comprobar:

- [ ] Solo Poppins. Cero segundas familias.
- [ ] Cero verdes, ámbares, naranjas. Cero azules que no sean `#1b1464`.
- [ ] Ningún párrafo en amarillo. El amarillo solo es fondo, device, badge o texto de botón.
- [ ] Un único protagonista amarillo por pantalla.
- [ ] Ninguna card con esquina dura.
- [ ] H1 de 2 líneas como máximo.
- [ ] Sombras en navy translúcido, nunca `rgba(0,0,0,…)`.
- [ ] Responsive: colapsa a 1 columna bajo 900px.
- [ ] Copy en español con terminología del sector en inglés.
- [ ] Nombre correcto en cada sitio: School (comercial) · Studio (metodología) · E+ Tools (producto).
- [ ] Sin promesas de concesión de subvención.

---

**Esqueleto de partida ya montado con todo esto:** `web/brand/efs-funnel-starter.html` —
se abre en el navegador tal cual y ya renderiza el embudo completo de 8 secciones on-brand.
El programa externo solo tiene que sustituir el copy.
