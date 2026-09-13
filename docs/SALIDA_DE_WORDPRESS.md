# Salida de WordPress

> Decisión de Óscar (13-sep-2026): **todo con código, WordPress fuera**. Este doc es la
> secuencia para retirarlo sin perder nada. El campus Moodle **se queda** — no entra aquí.

---

## 1 · Qué hay dentro del WordPress (auditado el 13-sep-2026)

| Cosa | Estado real |
|---|---|
| `/` — EU Funding School | 19.070 caracteres. Contenido de verdad |
| `/academia/` — **Join the Club** (la pestaña «Misión» del topbar) | 11.706 caracteres. La página de oferta |
| `/recursos/` | **141 caracteres**. Vacía en la práctica |
| `/descargables/`, `/videos/`, `/redes-sociales/` | **0 caracteres**. Cáscaras |
| 3 entradas: KA1, KA2, KA3 | ~1.600 caracteres cada una, publicadas el 18-jun-2026 |
| Adjuntos | 3 capturas de pantalla de abril |
| Formulario «Lista de espera» (wpforms-lite) | **0 envíos**. No ha capturado a nadie |
| `newsletter_subscribers` en la app | **0 filas** |
| Tráfico (logs de nginx) | Ni una petición a `/recursos/`, `/academia/` ni a las 3 entradas. Lo que llega son bots a `/wp-admin/install.php` y `/wp-login.php` |

**Conclusión:** el sistema entero sostiene dos páginas con contenido y tres artículos que
nadie lee, y a cambio expone un `/wp-login.php` a los escaneos. No hay leads que rescatar.

El contenido ya está volcado en `docs/legacy-wp/*.html` (HTML de Gutenberg en bruto).

## 2 · Lo que sí hay que conservar

1. **Join the Club** — es la página de oferta, o sea producto. Tiene que vivir en el Studio.
2. **La home** — 19k de texto de posicionamiento; se reescribe, no se copia tal cual.
3. **Las 3 entradas KA1/KA2/KA3** — semilla del blog.
4. **La captación de correo** — el endpoint `/v1/subscribers` ya existe en la app; lo que
   desaparece es el formulario de wpforms, no la función.
5. **Las URLs** — `eufundingschool.com/academia/` y `/recursos/` deben redirigir, no dar 404.

## 3 · Secuencia

- [x] **P0 · Rescatar el contenido** → `docs/legacy-wp/` (13-sep-2026)
- [x] **P1 · Decidir dónde vive la web pública** → **dentro de este repo**, opción (a) (13-sep-2026)
- [ ] **P2 · Montar las páginas en código**
  - [x] `/mision` — Join the Club, portada tal cual (13-sep-2026)
  - [ ] `/` — la home: 19k de texto que hay que reescribir, no copiar
  - [ ] `/recursos` — hay que inventarla: la de WordPress está vacía
- [ ] **P3 · Blog**: las 3 entradas + la plantilla para las que genere el content engine
- [ ] **P4 · Formulario de lista de espera** contra `/v1/subscribers`
- [ ] **P5 · Redirecciones** de las URLs viejas en nginx, y `eufundingschool.com` apuntando
      a lo nuevo
- [ ] **P6 · Apagar** `wordpress-eufunding-wordpress-1`, guardar un volcado final de
      `eufunding_wp` y liberar el volumen (393 MB)

Nada de P6 antes de que P5 esté verificado en producción.

## 4 · La decisión, ya tomada

**Dentro de este repo**, servida por Express. Se descartó el sitio estático aparte.
Queda escrito el porqué de las dos opciones:

**(a) Dentro de este repo**, servida por Express como páginas reales (`/`, `/mision`,
`/recursos`, `/blog/...`), antes del catch-all de la SPA en `server.js:126`.
A favor: un solo despliegue, un solo topbar, y la sesión se comparte — «Iniciar sesión» y
«Mi cuenta» funcionan en la web pública sin inventar nada. Ya hay precedente: `academy.html`
son 1.479 líneas de página hecha a mano.
En contra: marketing y producto conviven en el mismo repo.

**(b) Sitio estático aparte** (Astro), con el protocolo WP → Astro que ya se usó en otras
webs del ecosistema.
A favor: más cómodo si el content engine produce volumen; despliegue independiente.
En contra: es otro sistema —justo lo que se quería reducir— y obliga a mantener el topbar
y el estado de sesión en dos sitios.

## 5 · Nota de seguridad

Mientras el contenedor siga vivo está recibiendo intentos de login. Si P2–P5 se alargan,
merece la pena cerrar ya `/wp-login.php` y `/wp-admin/` por nginx salvo desde la IP de Óscar.

## 6 · Deudas que deja P2

- **La página no tiene ni una imagen.** Venía así de WordPress. Antes de que esto sea la
  web pública de verdad necesita 2-3 fotos reales (Pexels o banco propio); no se inventan.
- **Las fuentes se cargan desde `fonts.googleapis.com`.** El criterio del ecosistema es
  self-hostear (RGPD y que no se caiga la tipografía). Afecta a toda la app, no solo a esta
  página: se arregla de una vez, no a trozos.
- **`/mision` declara `canonical` a `eufundingschool.com/academia/`** mientras el WordPress
  siga siendo el que responde en producción. Al llegar P5 hay que darle la vuelta.
