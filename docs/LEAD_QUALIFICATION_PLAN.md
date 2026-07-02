# Lead Qualification & Behavioral Tracking — Plan canónico

> **Estado:** DISEÑO APROBADO por Oscar (2026-06-27). Listo para construir por fases.
> **Owner:** Local Claude (eplus-tools).
> **Origen:** sesión 2026-06-27, tras shippear el sistema login-wall / guest-funnel.
> **Objetivo:** convertir cada registro en un lead cualificado en centralize/GHL, sabiendo su **Interés × Capacidad** para dirigir oferta, cohorte y esfuerzo comercial.

---

## 0 · Fundación ya en producción (2026-06-27)

El sistema **login-wall + guest-funnel** ya está en `main`/prod. Es la base de todo esto:
- El **invitado navega libremente** todas las secciones (top tabs + submenú izq).
- Secciones de **contenido** (Convocatorias, Directorio, Atlas, Movilidades) muestran las tarjetas; el muro de login salta al **abrir** una tarjeta (`openDetail`/`openFicha`).
- Secciones de **cuenta** (Mis Proyectos, Mis Evaluaciones, Mi Pool, Documents, Research) muestran un **embudo de venta** (`renderGuestFunnel`, copy por sección en `FUNNEL_COPY` de `public/js/app.js`) con CTAs.
- Backend teaser: `optionalAuth` en convocatorias y movilidades; entidades ya público.

**Principio de diseño confirmado:** toda la web empuja el contenido de valor hacia el **registro**. El registro ES la captura del lead (deja email + datos). **No** hay soft-capture de email separado — descartado explícitamente (el registro ya cumple esa función).

---

## 1 · Timing: registro mínimo + onboarding después (NO en el registro)

**Decisión:** la cualificación **no** va en el formulario de registro.

- **Registro = nombre + email + contraseña.** Nada más. Fricción mínima → máxima conversión. El lead queda capturado y se promociona a `warm` en GHL (ya lo hace `_promoteWarm` en `auth/controller.js`).
- **Onboarding post-registro** = quiz corto (3-4 clics) framed como *"personaliza tu experiencia"*, no como formulario. El lead ya está capturado, así que la cualificación es **upside**: si la completa, perfecto; si la salta, sigues teniendo el lead.
- **Saltable con nudge** (barra "perfil X% completo"). NO obligatorio. Los que saltan se recuperan con la señal conductual.

Razón: front-loadear en el registro da datos del 100% de **muchos menos** registros. Onboarding da datos del ~70-80% de **muchos más**. Gana el segundo.

---

## 2 · El marco de cualificación: Interés × Capacidad

Dos ejes. Su cruce **es** la segmentación / lead scoring.

### CAPACIDAD (¿puede de verdad hacer/comprar un proyecto?)
- **Experiencia:** ninguna · participó como **socio** · **coordinó** proyectos. (Por programa: KA1 / KA2 / KA3 / Capacity Building.)
- **Entidad:** no tiene · quiere **crear** una · colegio · FP (formación profesional) · universidad · asociación · empresa · gobierno.
- **Tamaño** (si empresa): 1 · 2-4 · 4-10 · 10-20 · 20+.
- **Rol:** trabajador · CEO · socio. (Clave: ¿es **decisor** o no?)

### INTERÉS / INTENCIÓN (¿qué quiere conseguir?)
- Aprender a escribir proyectos (→ producto formativo / academia, ticket bajo).
- Dar el salto a proyectos más grandes y complejos (→ Writer premium, ticket medio).
- Que su entidad/empresa acceda a fondos europeos (→ consultoría / done-for-you, ticket alto).
- Otro.

### El cruce → tiers de lead
- **🔥 Premium:** capacidad alta + intención alta (p.ej. CEO de asociación que coordinó un KA2 y quiere fondos) → objetivo "reservar reunión" / consultoría.
- **Medio:** writer premium / scale.
- **Academia / nurture:** sin entidad + quiere aprender → ticket bajo, email nurture.

Conecta con las **12 cohortes** y los carriles de Pricing v2 (ver `project_pricing_v2_credits`).

---

## 3 · Conductual (behavioral tracking) — first-party propio

Mide lo que la gente **hace**, no lo que dice. Complementa la cualificación explícita.

### Puntos de paso únicos (ya existen en el código)
- `navigate(route)` → **toda** navegación pasa por aquí → captura "qué visita".
- `openDetail()` / `openFicha()` → abrir convocatoria / ficha de entidad.
- `requireLogin()` → muro: cuando **quiere** abrir algo y le frena → señal de interés purísima (`gate_hit`).

### Taxonomía de eventos
| Señal | Evento | Origen |
|---|---|---|
| Frecuencia | `session_start`, nº visitas, recencia | carga app |
| Qué visita | `section_view {route}` | `navigate()` |
| Profundidad | `call_opened {id, programme}`, `entity_opened {oid}`, `project_started`, `search {query}` | gates + acciones |
| Interés frustrado | `gate_hit {route}` | `requireLogin()` |
| Tiempo activo | `section_time {route, segundos}` | timestamps + **Page Visibility API** |

### Mecanismo (3 piezas)
1. **Tracker cliente** `public/js/track.js`: `Track.event(name, props)` encola y manda en lotes vía `navigator.sendBeacon` (sobrevive al cierre).
2. **Endpoint** `POST /v1/events`: pega `user_id` (logueado) o `device_id` (invitado), inserta en `events`. Rate-limited, fire-and-forget.
3. **Dos tablas:**
   - `events` — log crudo (id, ts, user_id, device_id, name, route, ref_id, programme, props json).
   - `user_engagement` — rollup por persona (nº sesiones, last_seen, contadores por sección, calls_opened, programa_dominante, segundos_totales). Es lo que consulta el scoring.

### Coser invitado → usuario (el truco que lo hace valioso)
- Cada **invitado** lleva un `device_id` (UUID en localStorage). Se trackea su conducta **antes** de registrarse.
- Al registrarse: `UPDATE events SET user_id = … WHERE device_id = …`. Toda la historia anónima se cose al usuario.
- Resultado: en el momento del registro ya sabes qué le interesaba → alimenta el onboarding.

### Qué pasa si el invitado NO se registra
- El **dato no se pierde** (queda por `device_id`), pero es **anónimo**: sin email, no contactable 1-a-1. Útil solo a nivel **agregado** (optimizar embudo, detectar fugas).
- `device_id` vive en **ese navegador**. Si vuelve otro día / mismo navegador y se registra → se cose. Si borra cookies o cambia de dispositivo → se rompe.
- Red de seguridad para alto-interés anónimo: **pixel de retargeting** (Meta/Google Ads), que ya está en la estrategia. (Soft-capture de email descartado por decisión de producto.)

---

## 4 · Teléfono: NO en el registro

**Decisión:** el teléfono es el campo de mayor fricción ("me van a llamar a vender"). No va en el registro.

- Se pide en el **momento de intención de hablar**: el botón **"Reservar una reunión"** del embudo (ya construido como placeholder). Ahí el campo teléfono tiene sentido → fricción cero, y auto-selecciona a quien **quiere** ser llamado.
- Opcional en el onboarding, framed como valor (*"¿prefieres que te ayudemos por teléfono?"*), nunca obligatorio.
- Plus: en GHL el teléfono abre **SMS/WhatsApp** como canal.

---

## 5 · Sync a centralize/GHL

- Registro → contacto en GHL (sync ya existe vía modelo de subscribers).
- Onboarding + hitos conductuales → **custom fields + tags** (`efs:exp:coordinated`, `efs:entity:university`, `efs:goal:access-funds`, `efs:role:ceo`, `efs:size:10-20`, `efs:interest:ka2`, `efs:engaged:high`).
- **NO** mandar el stream crudo de eventos a GHL — solo **hitos y agregados accionables**. El log crudo se queda local.
- Regla: **GHL = marketing**, **Resend = transaccional** (no mezclar — ver `project_email_strategy`). Cuidado con el GHL Location ID (`l` vs `I`, ver `feedback_ghl_location_id`).

---

## 6 · RGPD
Perfilar conducta de personas identificables necesita base legal. Ventaja: es **first-party** (tabla propia, sin GA ni terceros). Hay que: declararlo en política de privacidad, consentir en el registro, banner de cookies para invitados. Parcialmente montado con el sistema de newsletter.

---

## 7 · Plan por fases

1. **Fase 1 — `device_id` + tracker básico (arrancar YA, barato).** Generar `device_id`, instrumentar los 3 puntos de paso, `events` table + `POST /v1/events`. Empieza a acumular conducta pre-registro desde hoy (cada día sin trackear es conducta perdida).
2. **Fase 2 — Onboarding + modelo de datos + mapeo GHL.** Tabla de perfil de cualificación, pantalla onboarding (Interés × Capacidad, saltable con nudge), escritura a custom fields/tags GHL, cálculo de **lead tier**. *(Empezar por el modelo de datos + mapeo, luego la UI.)*
3. **Fase 3 — Scoring conductual.** Rollup `user_engagement`, derivar interés (programa dominante) + intención, alimentar lead score y empujar hitos a GHL. Coser `device_id` → `user_id` en registro.

---

## Decisiones cerradas (2026-06-27)
- Registro mínimo; cualificación en onboarding post-registro (saltable con nudge).
- **No** soft-capture de email (el registro ya es la captura).
- Teléfono fuera del registro; en el flujo de "reservar reunión" + opcional en onboarding.
- Tracker **propio first-party** (no PostHog/GA): controlamos `navigate()`.
- `device_id` de invitado: meterlo **ya** para no perder conducta pre-registro.
- A GHL solo hitos/agregados, no el stream crudo.

## Decisiones abiertas (no bloqueantes)
- Onboarding ¿exactamente qué preguntas y en qué orden / cuántos pasos?
- Esquema final de tags/custom fields en GHL.
- Política de retención del log `events` + base legal RGPD concreta.
- Si parte del scoring lo calcula un cron o on-demand.
