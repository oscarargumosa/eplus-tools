# Payment & Design Capacity System — Plan de implementación

*v1.0 · 2026-07-02 · Basado en la spec funcional de Oscar (repensada con OpenAI). Doc canónico del modelo de cobro. Supersede la mecánica de `PRICING_v2_CREDITS.md` (monedero 1%) y `PRICING_FRAMEWORK.md` (slots+academia) — ver §12.*

---

## 0. Modelo en una frase

> El usuario **no paga suscripción ni por proyecto suelto**: compra **Design Capacity** (capacidad acumulada, en € de presupuesto máximo activable) que **nunca caduca**. Diseñar es gratis e ilimitado; la capacidad **solo se consume al pulsar "Activate Proposal"** (Concept Note → propuesta completa), descontando la **banda presupuestaria** de la convocatoria (no el importe exacto). Las resubmissions no vuelven a consumir. El saldo restante se **calcula siempre** como `comprado − Σ bandas activadas + Σ boosts`, nunca se guarda como valor editable.

Los tres paquetes coinciden **exactamente** con la página "Join the Club" ya publicada:

| Package | Design Capacity | Precio |
|---|---|---|
| Starter Capacity | 500.000 € | 1.200 € |
| Professional Capacity | 2.000.000 € | 4.000 € |
| Enterprise Capacity | 10.000.000 € | 15.000 € |

---

## 1. Decisiones de arquitectura (firmes)

1. **Saldo derivado, no almacenado** (recomendación de Oscar, adoptada). No hay columna `remaining` editable. Se calcula on-the-fly:
   ```
   Remaining = Σ capacity_purchases.capacity_eur (paquetes + boosts)
             − Σ capacity_activations.budget_band_eur (propuestas activadas)
   ```
   Ventaja: imposible desincronizar, auditable al 100%, recalculable en cualquier momento. Cada evento es una fila append-only; nada se actualiza in-place.

2. **Punto de enganche único = `launchProject`.** La spec dice "Activate Proposal aparece tras el Concept Note y es el único evento de cobro". En el código, la única transición design→writing es `PATCH /v1/intake/projects/:id/launch` → `node/src/modules/intake/controller.js:142` (ya bloquea sandbox, ya crea el budget). Ahí se inserta el check+consume. **No se crea un flujo paralelo**; se renombra el botón y se le añade capacidad.

3. **La banda es un snapshot inmutable.** Al activar, se resuelve la banda de la convocatoria y se guarda en la fila de activación. Si mañana cambian los importes del catálogo, las activaciones históricas no se recalculan (spec §11).

4. **Una activación por proyecto** (`UNIQUE(project_id)`). Resubmissions, ediciones y re-lanzamientos nunca crean una segunda fila → nunca doble consumo (spec §9).

5. **Nivel (Starter/Pro/Enterprise) = el paquete más alto comprado**, independiente del saldo restante. Determina a qué familias de programa puede acceder (spec §14). Los boosts añaden capacidad pero **no suben de nivel**.

6. **Cobro real desacoplado del núcleo.** F1 funciona con capacidad **concedida por admin** (Oscar la asigna a mano). El checkout con pasarela de pago es una fase posterior (F3). Esto valida toda la mecánica sin bloquearse en Stripe.

---

## 2. Modelo de datos — migración `121`

Greenfield: no existe ninguna tabla de pagos. Solo hay `users.subscription ENUM('free','premium')` (`migrations/001_users_table.sql:11`), que **se conserva** (no se reutiliza para capacidad).

```sql
-- migrations/121_design_capacity.sql  (idempotente)

-- Compras de capacidad (append-only): cada paquete o boost adquirido.
CREATE TABLE IF NOT EXISTS capacity_purchases (
  id             CHAR(36) PRIMARY KEY,
  user_id        CHAR(36) NOT NULL,
  kind           ENUM('package','boost') NOT NULL,
  package_tier   ENUM('starter','professional','enterprise') NULL,  -- solo si kind='package'
  capacity_eur   DECIMAL(14,2) NOT NULL,        -- capacidad concedida (500000, +250000, ...)
  price_paid_eur DECIMAL(10,2) NULL,            -- lo pagado (NULL si admin_grant)
  source         ENUM('checkout','admin_grant','promo') NOT NULL DEFAULT 'admin_grant',
  note           VARCHAR(255) NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_cap_purch_user (user_id),
  CONSTRAINT fk_cap_purch_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Activaciones de capacidad (append-only): una fila por propuesta activada.
CREATE TABLE IF NOT EXISTS capacity_activations (
  id              CHAR(36) PRIMARY KEY,
  project_id      CHAR(36) NOT NULL,
  user_id         CHAR(36) NOT NULL,
  budget_band_eur DECIMAL(14,2) NOT NULL,       -- snapshot inmutable de la banda consumida
  program_family  VARCHAR(40) NULL,             -- KA220, KA210, SPORT-SCP, CBHE, COVE...
  eu_grant_at_activation DECIMAL(12,2) NULL,    -- el eu_grant real del proyecto en ese momento (auditoría)
  activated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_activation_project (project_id),  -- 1 activación/proyecto → resubmissions no reconsumen
  INDEX idx_cap_act_user (user_id),
  CONSTRAINT fk_cap_act_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_cap_act_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**Grandfathering** (parte de la 121): los proyectos que YA están en `writing/evaluating/submitted/approved` de antes del sistema se insertan como activaciones con `budget_band_eur = 0` (source implícito: pre-capacity). Así no cuentan contra el saldo de nadie y `launchProject` no intenta cobrarlos si se re-lanzan. Se hace con un `INSERT ... SELECT` idempotente (`WHERE status <> 'design' AND id NOT IN (SELECT project_id FROM capacity_activations)`).

> Reglas de migración del repo respetadas: `CREATE TABLE IF NOT EXISTS`, sin `ADD COLUMN IF NOT EXISTS`, sin `CREATE INDEX IF NOT EXISTS` (índices dentro del `CREATE TABLE`). Runner acepta `.sql` y `.js`.

---

## 3. Bandas presupuestarias — de dónde salen

**Buena noticia: las bandas ya existen** como los importes lump-sum del catálogo (`data/erasmus_plus_2026_calls.clean.json`, campo `amount_eur` + `amount_type`). No hay que inventarlas.

| Familia | Bandas (€) | Fuente |
|---|---|---|
| KA210 (Small-scale, 4 sectores) | 30k · 60k | catálogo |
| KA220 (Cooperation, 5 sectores) | 120k · 250k · 400k | catálogo |
| KA3 EYT | 500k | catálogo |
| Sport SSCP | 30k · 60k | catálogo |
| Sport SCP | 120k · 250k · 400k | catálogo |
| Sport SNCESE | 200k · 300k · 450k | catálogo |
| Sport LSSNCESE | 1M · 1,5M | catálogo |
| CB Sport | 100k · 200k | catálogo |
| CB VET | hasta 500k | catálogo (budget-based) |
| CB Youth | 300k · 450k | catálogo |
| CBHE (strands) | 200–400k · 400–800k · 600k–1M (esp. Moldova 2M) | catálogo (budget-based) |
| CoVE | 4M | catálogo |

**Resolución de banda** (`resolveBudgetBand(programType, euGrant)`):
- Para **calls lump-sum con tramos discretos**: banda = **el tramo más pequeño ≥ `projects.eu_grant`**. Ejemplo spec: KA220 con presupuesto 236.421 € → banda **250k**. Determinista, coincide con la spec ("nunca el presupuesto exacto").
- Para **calls budget-based sin tramos** (CBHE, CB-VET): banda = **el máximo de la sublínea/strand** elegida (conservador y sin ambigüedad). *(Decisión abierta §11.2 si se quiere granularidad por strand.)*

Implementación: un módulo `node/src/modules/capacity/bands.js` que carga el catálogo `clean.json` una vez y mapea `programType → [bandas]`. Se enlaza a `projects.type → intake_programs.action_type` (join ya usado en `budget/model.js:227`). La familia se deriva del `program_id`/`action_type`.

---

## 4. Niveles de capacidad y gating de programas (spec §14)

`capacity_level(user)` = el `package_tier` más alto en `capacity_purchases` (starter < professional < enterprise). Si solo tiene boosts, hereda el nivel del último paquete; si nunca compró paquete, nivel = ninguno (no puede activar nada de pago).

| Nivel | Familias que puede activar |
|---|---|
| **Starter** | KA1, KA2 (KA210/KA220), KA3 (EYT) |
| **Professional** | todo Starter + Capacity Building (todas), Sport (todas), CoVE |
| **Enterprise** | todo Professional + Horizon Europe, LIFE, Interreg, CERV, otros premium |

Mapa estático `family → minLevel` en `node/src/modules/capacity/levels.js`. En `launchProject`, si `level(user) < minLevel(project.family)` → **Upgrade Screen** (spec §7), no se consume.

> Nota: hoy el producto solo soporta las 4 líneas Erasmus+ del foco. Horizon/LIFE/etc. (Enterprise) son futuro; el gate ya queda cableado pero sin convocatorias detrás todavía.

---

## 5. Algoritmo de activación (hook en `launchProject`)

Reescritura de `node/src/modules/intake/controller.js:142-185` (pseudocódigo):

```js
async function launchProject(req, res) {
  const project = await getProject(id, req.user.id);
  if (project.is_sandbox) return 422 SANDBOX_LOCKED;          // (ya existe)
  if (project.status !== 'design') return 409 ALREADY_ACTIVE; // idempotencia

  // Si ya hay activación (re-lanzamiento raro), no reconsumir:
  const existing = await capacity.getActivation(project.id);
  if (!existing) {
    const family = capacity.familyOf(project.type);
    const level  = await capacity.levelOf(req.user.id);
    if (!capacity.allowed(family, level))
      return 403 CAPACITY_LEVEL_TOO_LOW  { needed: minLevel };   // Upgrade Screen

    const band = capacity.resolveBudgetBand(project.type, project.eu_grant);
    const remaining = await capacity.remaining(req.user.id);
    if (remaining < band)
      return 402 INSUFFICIENT_CAPACITY { band, remaining, deficit: band-remaining }; // Buy/Upgrade

    await capacity.consume({ projectId: project.id, userId: req.user.id, band, family,
                             euGrant: project.eu_grant });       // INSERT capacity_activations
  }

  await setStatus(project.id, 'writing');    // (ya existe)
  await budgetModel.createFromIntake(...);   // (ya existe)
  return 200 { status: 'writing', capacity: await capacity.summary(req.user.id) };
}
```

Transaccional: el INSERT de activación + UPDATE status van en una transacción para que no se cobre sin activar ni al revés.

---

## 6. Estados de la propuesta (spec §10) — mapeo al modelo real

La spec propone `DRAFT → CONCEPT NOTE → WAITING ACTIVATION → ACTIVE → SUBMITTED`. El producto ya usa `status VARCHAR(20)`: `design → writing → evaluating → submitted/approved/rejected` (`053_project_status.js`). Mapeo sin migrar estados nuevos (solo semántica de UI):

| Spec | Estado real | Nota |
|---|---|---|
| DRAFT / CONCEPT NOTE / WAITING ACTIVATION | `design` | toda la fase gratis; el botón "Activate Proposal" vive aquí |
| ACTIVE | `writing` | consumió capacidad |
| (evaluando) | `evaluating` | sin equivalente en spec, se conserva |
| SUBMITTED | `submitted` | presentada |
| **CLOSED** | `closed` (o flag `locked_at`) | **cierre tras deadline → solo lectura** (ver abajo) |

No hace falta tabla de estados nueva; el "consumió capacidad" se deduce de la existencia de fila en `capacity_activations`.

### 6.1 Cierre tras deadline (decisión Oscar 2026-07-02)

Cuando pasa la **deadline de la convocatoria**, la propuesta **se cierra**:
- El usuario **puede leerla** pero queda **inhabilitada para cambios** (read-only: sin Writer editable, sin re-activar, sin export que la modifique).
- Fuente de la fecha: el `deadline_iso` / `deadline_time` (CET Bruselas) del catálogo de calls, atado al proyecto por su `type`/programa.
- Implementación: un flag `locked_at` en `projects` (o estado `closed`) que se pone al pasar la deadline (chequeo perezoso al abrir el proyecto, o cron ligero). El backend rechaza mutaciones sobre proyectos cerrados.

> **Resubmisión / reapertura / pagar por volver a usar la herramienta: POR DISEÑAR.** De momento **se cierran y punto**. La regla de la spec "resubmissions no reconsumen capacidad" (§1.4, `UNIQUE(project_id)`) se mantiene a nivel de datos como salvaguarda, pero **no hay flujo de resubmisión todavía** — se estudiará más adelante (posible modelo: pagar una banda reducida para reabrir/reciclar). No construir nada de esto ahora.

---

## 7. Backend — módulo nuevo `node/src/modules/capacity/`

Siguiendo la estructura del repo (routes/controller/model):

| Endpoint | Qué hace |
|---|---|
| `GET /v1/capacity/me` | Resumen del usuario: `{ level, purchased, consumed, remaining, packages[], activations[] }` (alimenta el dashboard §12) |
| `GET /v1/capacity/quote?projectId=` | Previo a activar: devuelve `{ family, band, remaining, enough:bool, levelOk:bool }` para pintar el modal de confirmación / upgrade |
| `POST /v1/capacity/admin/grant` | (admin) concede capacidad: inserta `capacity_purchases`. Es el "cobro" de F1 |
| `GET /v1/capacity/admin/ledger` | (admin) todas las compras/activaciones para la tabla admin |
| *(F3)* `POST /v1/capacity/checkout` + webhook | crea sesión de pago y, al confirmar, inserta la compra |

`model.js` centraliza `remaining()`, `levelOf()`, `resolveBudgetBand()`, `consume()`. El check de activación lo llama `intake/controller.js` (no se duplica lógica).

---

## 8. Frontend — superficies

1. **Botón "Activate Proposal"** (renombrar el actual launch, `public/js/intake.js:1719` `#intake-btn-launch`): abre un **modal de confirmación** que llama a `GET /v1/capacity/quote` y muestra: banda a consumir, saldo antes/después, aviso "irreversible". Confirmar → `launch`.
2. **Upgrade / Insufficient Screen** (spec §7): si el quote/launch devuelve `402`/`403`, se muestra pantalla con: mensaje, opciones de paquete (Starter/Pro/Enterprise) y "Purchase Additional Capacity" (boosts +250k/+500k/+1M/+5M, spec §8). En F1/F2 el botón lleva a "contactar / lo activa Oscar"; en F3 al checkout.
3. **Capacity Dashboard** (spec §12): nueva vista (sidebar, junto a "Mis Proyectos") con `Purchased / Consumed / Remaining` + tabla de últimas propuestas activadas (Proposal · Budget Band · Status). Datos de `GET /v1/capacity/me`.
4. **Chips de estado** en Mis Proyectos: Draft / Active / Submitted según status + si tiene activación.
5. **Admin → Capacity** (`public/js/admin.js`, nuevo `case`/panel `#admin-sec-capacity`): tabla de usuarios con capacidad, formulario de grant manual, ledger de compras/activaciones.

---

## 9. Fases de implementación

| Fase | Contenido | Entregable |
|---|---|---|
| **F1 — Núcleo (sin cobro real)** | Migración 121 + grandfathering · módulo `capacity/` (remaining derivado, bandas, niveles, consume) · hook en `launchProject` · endpoint admin grant · modal "Activate Proposal" con banda + confirmación | La mecánica completa funciona con capacidad concedida por admin. Se puede probar E2E con SUSTRAI/VocAI. |
| **F2 — Visibilidad usuario** | Capacity Dashboard (§12) · Upgrade/Insufficient screens (§7) · chips de estado · `GET /v1/capacity/me` + `/quote` | El usuario ve y entiende su capacidad. |
| **F3 — Cobro real** | Pasarela de pago (checkout de paquetes + boosts) · webhook → `capacity_purchases` · pantalla de compra real | Autoservicio de compra. **Requiere decisión de pasarela + fiscal (§11).** |
| **F4 — Gating + School** | Enforcement de niveles por familia (§14) · acceso a School según `remaining>0` (§13, cuando exista academia) | |
| **F5 — Professional Status** | Sistema separado de reputación/certificaciones (spec §15) — **fuera de scope de este plan**, solo se reserva el concepto | |

MVP = **F1** (disciplina de scope: versión mínima viable primero). F2 y F3 se deciden después de ver F1 funcionando.

---

## 10. Reconciliación con lo ya existente

1. **Página "Join the Club"** (`web/wordpress/astra-eufunding/academia-page-content.html`): los **precios ya coinciden** (500k→1.200 / 2M→4.000 / 10M→15.000). Solo hay que **ajustar el copy de las bullets**: hoy dicen "1 propuesta completa / 4 propuestas / escritura hasta X €" — reencuadrar a "Design Capacity que **no caduca**, se consume por banda al activar". Cambio menor de texto, no de estructura.
2. **`PRICING_v2_CREDITS.md`**: marcar como **superado en mecánica** por este doc (se conserva la curva/% como referencia histórica y la filosofía "diseñar gratis → activar de pago", que sigue vigente; cambia la unidad: banda acumulada en vez de monedero 1%).
3. **`PRICING_FRAMEWORK.md`**: la parte de slots+academia queda como histórico; academia sigue aparcada.
4. **`docs/SCHEMA.md`**: actualizar el enum de `status` (está desactualizado, dice `draft/submitted/approved/rejected`, línea 144/165) y documentar `capacity_purchases` + `capacity_activations`.

---

## 11. Decisiones abiertas (para Oscar)

1. **Semántica de nivel**: ¿nivel = paquete más alto comprado (mi recomendación) o umbrales por importe total acumulado? Afecta al gating §14.
2. **Banda en calls budget-based** (CBHE strands, CB-VET): ¿banda = máximo de la sublínea (simple) o granular por strand (200/400/600k...)? 
3. **Grandfathering**: ¿los proyectos ya en `writing/submitted` entran con banda 0 (mi propuesta) o se recalculan/cobran retroactivamente? (Recomiendo banda 0.)
4. **Pasarela de pago** (F3): ¿Stripe? ¿otra? + confirmar con gestoría el tratamiento de "capacidad no reembolsable que no caduca" (¿venta en el momento del ingreso?). Ojo regla: yo **no** introduzco credenciales de pago; el checkout lo integro, pero el alta de la cuenta/keys la haces tú.
5. **Boosts**: confirmar tramos (+250k/+500k/+1M/+5M) y que **no** cambian de nivel.
6. **Precio de la capacidad adicional (boosts)**: ¿al mismo €/€ que el paquete del nivel, o con su propia tarifa? La spec no lo fija.
7. **School access** (§13): ¿literal "remaining>0 = acceso"? La academia está aparcada, así que F4 puede esperar.

---

## 12. Principios de negocio (de la spec, para no perderlos)

- La capacidad **nunca caduca**.
- Se consume **una sola vez por propuesta nueva** al activarla.
- Tras la **deadline**, la propuesta **se cierra** (solo lectura). Resubmisión/reapertura **por diseñar** — de momento no existe.
- Exploración **ilimitada y gratis** antes de activar.
- Una propuesta activada **nunca devuelve** capacidad, aunque no se presente.
- Se cobra por **la decisión de desarrollar**, no por el éxito del proyecto.
- El nivel de capacidad determina las **familias de programa** accesibles.
- La **reputación profesional** (certificaciones, Professional Status) es **independiente** del dinero invertido (sistema aparte, §15 spec).

---

## 13. Decisiones de negocio del ecosistema (Oscar, 2026-07-02)

> Marco conceptual que guía las decisiones de producto futuras. Aún en perfilado; **no construir nada de esto todavía** — es la visión que enmarca el sistema de pago de arriba.

**1. La Design Capacity da acceso a la School.**
La School (academia) **deja de venderse como producto individual**. Comprar Design Capacity **concede automáticamente acceso a las Design Missions correspondientes** al nivel. Cambio de modelo: el usuario no compra cursos, compra la capacidad de diseñar proyectos; la formación existe para ayudar al miembro a **consumir más Design Capacity con el tiempo**. La School pasa de fuente de ingresos independiente a **mecanismo de retención y expansión**.

**2. Las familias de programa se desbloquean por nivel de Design Capacity.**
- **Starter** → KA1, KA2, KA3.
- **Professional** → todo Starter + Capacity Building + Sport + CoVE.
- **Enterprise** → todo lo de la plataforma, incluidos futuros: Horizon Europe, LIFE, CERV, Interreg, Innovation Fund, COSME, etc.
Crea una progresión profesional natural y protege la formación avanzada. *(Coincide con §4 del plan.)*

**3. La certificación es totalmente independiente de la Design Capacity.**
Comprar capacidad **NUNCA** otorga certificación. La certificación solo se obtiene tras cumplir **AMBAS** condiciones:
1. Completar con éxito la Design Mission correspondiente.
2. **Presentar oficialmente una propuesta real** a la Comisión Europea.
Pagar, asistir a clases o terminar vídeos **no basta**. La presentación de un proyecto real se considera el equivalente al **Trabajo Fin de Grado**.

**4. Filosofía de formación.**
Las certificaciones FUN-DESIGN **no certifican asistencia, certifican ejecución profesional**. Un Project Designer certificado ha demostrado la capacidad completa de: entender una convocatoria, diseñar una propuesta, completar la metodología y presentar un proyecto europeo real. Es uno de los diferenciadores más fuertes del ecosistema.

**5. La Design Capacity nunca caduca.**
Se acumula y se consume a lo largo del tiempo (6 meses, 2 años, 5 años). **No hay renovación anual**. El usuario compra capacidad adicional cuando la necesita. Crea una **relación a largo plazo** en vez de un modelo de suscripción. *(Coincide con §0/§12.)*

**6. La School es un motor de ventas.**
El objetivo de cada Design Mission ya no es solo educar, sino animar a los miembros a: descubrir nuevos programas, interesarse por convocatorias más grandes, activar propuestas adicionales y comprar más Design Capacity. La formación **aumenta el Customer Lifetime Value** en vez de ser el producto final.

**7. Estrategia futura de credenciales europeas.**
El roadmap a largo plazo debe explorar integración con sistemas de credenciales europeos: **Europass, European Digital Credentials for Learning, European Micro-Credentials, resultados de aprendizaje alineados con EQF**. Inicialmente las certificaciones las emite **EUDICAS**; el objetivo a largo plazo es convertirlas en credenciales profesionales europeas reconocidas.

**8. Tres sistemas completamente independientes.**
La plataforma debe separar con claridad:
| Sistema | Tipo | Qué determina |
|---|---|---|
| **Design Capacity** | Comercial | Cuántas propuestas puede activar el usuario |
| **Certification** | Académico | Se obtiene solo tras completar una Design Mission **y** presentar un proyecto real |
| **Reputation** | Profesional | Se construye con experiencia, proyectos presentados, proyectos aprobados y actividad en la comunidad |
**Ninguno modifica automáticamente a los otros.** *(Formaliza y amplía §15 de la spec / F5 del plan.)*

**9. Visión del ecosistema.**
La plataforma evoluciona de herramienta de software a **ecosistema profesional**. La propuesta de valor deja de ser *"usa IA para escribir proyectos"* y pasa a ser: **desarróllate como European Project Designer a través de un itinerario profesional estructurado que combina Design Capacity + Design Missions + Certifications + Professional Reputation**. Este es el fundamento conceptual que guía las decisiones de producto futuras.

---

*Fin del plan v1.0. §0-12 = mecánica de pago (lista para arrancar F1 tras cerrar §11). §13 = marco de negocio del ecosistema, en perfilado, no construir todavía.*
