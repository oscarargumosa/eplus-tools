# App de Gestión del Ecosistema — Spec v1 (petición de Óscar)

> **Estado:** petición inicial de Óscar, para arrancar diseño → implementación · **Fecha:** 2026-07-04
> **Propietario:** Óscar · **Para quién:** handoff al Claude del VPS (que la implementará).
> **Base conceptual:** [[ETIQUETAS_MADRE.md]] (léelo antes; define qué es una "etiqueta madre").
>
> ⚠️ **Esto es un PROYECTO NUEVO (repo propio), NO un módulo de eplus-tools.** Este doc vive en
> `eplus-tools/docs/` solo porque es el canal de handoff que hoy sincroniza bien con el VPS.

---

## 0. Qué es la app

Una **herramienta de trabajo online** = el **panel de mando de la empresa** para gestionar los
proyectos ("etiquetas madre"). Vive en el VPS. Objetivo: dar de alta unidades de trabajo, aprovisionar
su ecosistema automáticamente, y que Óscar (y los admin) consulten y gestionen todo desde un sitio.

---

## 1. Identidad técnica

- **Online**, misma **estructura de stack que EU Funding School / eplus-tools**:
  Node.js + Express + MySQL + SPA vanilla (Tailwind), deploy con Coolify. El VPS ya domina este patrón.
- Auth central (JWT), un solo proceso, un solo dominio.

## 2. Roles (2 niveles de registro)

| Rol | Quién | Puede |
|---|---|---|
| **Superadmin** | Óscar — `oscarargumosa@gmail.com` | Todo + gestiona usuarios/roles |
| **Admin** | El resto (correos pendientes de Óscar) | Crear etiquetas y trabajar |

- **Usuario de test:** `permaculturacantabria@gmail.com` (como admin de pruebas).
- **Ambos** (superadmin y admin) pueden **crear** etiquetas.
- 🟡 *Decisión abierta (D3):* ¿los admin pueden editar/borrar CUALQUIER etiqueta o solo las suyas?

## 3. Layout (UI)

Igual que eplus-tools:
- **Menú horizontal superior** → las herramientas de la app.
- **Menú lateral izquierdo** → submenú de la herramienta activa.
- La **primera herramienta** del menú superior es **"Etiquetas Madre"**.

---

## 4. Herramienta #1 — "Etiquetas Madre"

Un **listado** de todas las etiquetas existentes + botón **Crear etiqueta**.

- **Semilla:** al arrancar solo existe **una** etiqueta, `etiquetas-madre` (el repo que ya existe en
  la cuenta de GitHub de `oscarargumosa`). Desde ahí se crean las demás.
  *(Más adelante se puede importar el inventario de repos existentes de [[ETIQUETAS_MADRE.md]] §9.)*

## 5. La cascada al CREAR una etiqueta

Al dar de alta una etiqueta madre `X`, la app dispara:

| # | Acción | Automático / Manual | Notas |
|---|--------|---------------------|-------|
| 1 | **Crear repo `X` en GitHub** (cuenta `oscarargumosa`) | 🟢 Automático (API GitHub) | Es la raíz del ecosistema |
| 2 | **Dar acceso al repo** a los correos elegidos | 🟡 Ver decisión D2 | Ver §6 (checkpoint vs auto) |
| 3 | **Carpeta local** con el nombre de la etiqueta en el PC de cada usuario con acceso | 🟡 **Script local** (NO la web) | Ver §7 (frontera web↔local) |
| 4 | **Registrar 1..N URLs de carpetas de Drive** (con permisos de lectura) | 🟢 Guardar en la ficha | Un worker las lee **1×/día** → genera **un MD por documento nuevo** |
| 5 | **Elegir la cuenta de Gmail** que gestiona los correos + su etiqueta | 🟢 Guardar cuenta | Un clic para ver qué cuenta gestiona; validar si esa cuenta ya tiene la etiqueta o no. Propuesta de Óscar: **crear la etiqueta Gmail automáticamente** al asociar la cuenta |

Así, cada etiqueta madre queda con: repo GitHub + carpeta(s) Drive + cuenta/etiqueta Gmail + carpetas
locales en los PCs con acceso.

## 6. Acceso al repo (paso 2) — decisión D2

Óscar lo describió como "avisar a Óscar de que tiene que dar los permisos". Dos opciones:
- **(a) Checkpoint de Óscar (recomendado):** la app crea el repo sola y muestra un botón
  *"conceder acceso a [correos]"* que Óscar confirma. Punto de control humano = más seguro.
- **(b) Automático total:** la app añade colaboradores vía API sin intervención.
- 🟡 *Decisión abierta (D2).*

Al conceder acceso, el **Claude/script local** de cada usuario detecta el acceso al repo y crea la
carpeta local (paso 3).

## 7. Frontera web ↔ local (importante)

La app del VPS **NO puede crear carpetas en los PCs** de los trabajadores (jardín cerrado). El paso 3
lo hace un **pequeño script local** en cada PC que:
1. detecta que tiene acceso a un repo nuevo,
2. crea una carpeta local con el **mismo nombre que la etiqueta**.

→ La **web dispara/informa; el PC ejecuta**. Son dos piezas separadas. La app solo es responsable
de crear el repo y dar acceso; el script local es un componente aparte (companion).

## 8. Integraciones / fontanería (lo que más trabajo tiene)

- **GitHub API** (token de `oscarargumosa`) → crear repos + dar acceso. *Fácil.*
- **Google Drive API** → leer carpetas 1×/día. *Requiere montar proyecto Google Cloud + permisos.*
- **Gmail API** → crear/validar etiquetas. *Igual, Google Cloud.*

### Corte MVP propuesto — decisión D1
- **v1:** automatiza **GitHub** + **guarda** los metadatos de Drive (URLs) y Gmail (cuenta). El
  listado, el alta y la cascada de GitHub funcionan de punta a punta.
- **v2:** el **worker diario Drive→MD** y la **automación de Gmail** (crear/validar etiquetas).
- 🟡 *Decisión abierta (D1): ¿confirmamos este corte?*

## 9. Modelo de datos — el "registro maestro"

Una fila por etiqueta madre (base: [[ETIQUETAS_MADRE.md]] §11):

```
nombre           (= repo short name, único)
tipo             (A unidad | B área/referencia)
area             (texto libre, para ordenar)
github_repo      (owner/repo)
drive_urls       (1..N carpetas de Drive)
gmail_account    (cuenta que gestiona los correos)
gmail_label      (nombre de la etiqueta; puede ser jerárquica con "/")
asignados        (correos con acceso al repo)
fase             (escritura | aprobado | ejecución | cerrado | perenne)
creado_por       (superadmin | admin)
last_synced      (última lectura del worker/Claude local)
```

## 10. Seguridad

- La app tendrá el **token de GitHub de `oscarargumosa`** (puede crear/borrar repos) y acceso a Drive.
- **Nunca en el repo:** todos los secretos en **variables de entorno de Coolify** (como en eplus-tools).
- Reutilizar el patrón de auth/JWT de eplus-tools.

## 11. Decisiones abiertas (pendientes de Óscar)

- **D1 — Corte MVP:** ¿v1 = GitHub automático + guardar metadatos Drive/Gmail (worker de Drive en v2)?
- **D2 — Acceso a repos:** ¿checkpoint de Óscar (botón confirmar) o automático total?
- **D3 — Admin vs superadmin:** ¿admin edita/borra cualquier etiqueta o solo las suyas?

## 12. Siguiente paso

Con D1/D2/D3 cerradas, el VPS puede empezar por la **v1**: modelo de datos + auth + layout
(horizontal+lateral) + herramienta "Etiquetas Madre" (listado + alta + creación de repo GitHub +
guardar metadatos Drive/Gmail). El worker de Drive→MD y Gmail quedan para v2.
