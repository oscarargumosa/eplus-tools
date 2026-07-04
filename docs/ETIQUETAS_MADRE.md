# Etiquetas Madre — Sistema de organización del ecosistema interno

> **Estado:** diseño conceptual cerrado · **Fecha:** 2026-07-04 · **Propietario:** Oscar
> **Para quién es este doc:** handoff a otro Claude. Contiene el concepto completo, las decisiones
> tomadas y las que quedan abiertas. NO cubre implementación técnica (se resolverá al construir).
>
> **Objetivo del sistema:** que cada trabajador de la empresa pueda abrir una "unidad de trabajo"
> (escribir un proyecto, mantener una BD, etc.) y que automáticamente se cree un ecosistema
> sincronizado alrededor de ella, de forma que Oscar (dueño) pueda consultar desde el VPS el estado
> de cualquier cosa sin pedírselo a nadie.

---

## 0. Contexto y origen

Se buscaba nombre para un concepto: un **contenedor sincronizado** que unifica, bajo un mismo
nombre y tema, cinco superficies distintas (repo GitHub, carpeta local, carpeta Drive, etiqueta
Gmail, vault Obsidian). "Proyecto" no servía (colisiona con el proyecto Erasmus real que es el
*contenido*). Se descartaron: Espacio, Hub, Carpeta, Carpeta VPS, Repo (a secas).

**Nombre elegido: `etiqueta madre`.** Razón: es lo único común a las 5 superficies — el acto de
*marcar todo con el mismo distintivo*. El verbo lo entiende cualquier empleado ("etiqueta este
correo / esta carpeta con la etiqueta madre") y transmite jerarquía (de ella cuelga todo).

---

## 1. Qué es una etiqueta madre

Una unidad de trabajo con nombre único que unifica un ecosistema de superficies sincronizadas:

| Superficie | Qué es | Cómo se crea |
|---|---|---|
| **Repo GitHub** | Raíz del estado; aloja los expedientes MD navegables. Es la columna vertebral. | Automática (cuenta personal de Oscar) |
| **Carpeta local** | Sitio de trabajo del empleado asignado | Automática (el Claude local detecta acceso al repo y la crea) |
| **Etiqueta Gmail** | Agrupa todos los correos del tema | Manual de momento (automatizable) |
| **Carpeta(s) Drive** | Documentación viva; vigilada por un Chrome cada X horas | Manual + pegar URL en la app |
| **Vault Obsidian** | Vista centralizada del estado (alimentada por los MD del repo) | Deriva del repo |

Conceptualmente, la etiqueta madre es un **disparador de aprovisionamiento**: al crearla en la
app interna, provisiona su ecosistema. De cara al trabajador se llama "etiqueta"/"carpeta"; el
motor interno la trata como un **registro maestro**.

---

## 2. Flujo de aprovisionamiento (qué pasa al crear una etiqueta madre)

Al dar de alta la etiqueta madre `X` en la app interna (que vivirá en el VPS):

| # | Acción | Automática / Manual | Superficie |
|---|---|---|---|
| 1 | Crear repo `X` en la cuenta personal de GitHub de Oscar (raíz de todo) | **Automática** | GitHub |
| 2 | Dar acceso al repo a los correos asignados → su Claude local detecta el acceso y crea carpeta local `X` | **Automática** (polling del Claude local) | Local |
| 3 | Crear etiqueta `X` en Gmail para agrupar los correos del proyecto | **Manual de momento** (automatizable vía API) | Gmail |
| 4 | Crear carpeta `X` en Drive + **pegar su URL en la app**; un Chrome se dispara cada X horas y lee cambios | **Manual** (carpeta + URL) | Drive |

Todo lo que ocurre en esas superficies fluye (vía Claude local + Chrome + API) hacia los
**expedientes MD del repo**, que son el estado que Oscar consulta desde el VPS.

---

## 3. Los dos tipos de etiqueta madre

No todas se comportan igual. Distinción **estructural** (importa de verdad):

| | **Tipo A — Unidad** | **Tipo B — Área / referencia** |
|---|---|---|
| Ejemplos | Escribas, BD, Apps, Subvenciones, Voluntarios | RRHH, Políticas, Protocolos, Contabilidad |
| Ciclo de vida | Sí (nace → fases → cierra) | No, perenne |
| Dueño/asignado | Sí | No, o responsable de área |
| Etiqueta Gmail | Sí | Normalmente no |
| Ecosistema | Repo + Drive + local + Gmail | Repo/Obsidian; Gmail casi nunca |
| Cantidad | Muchas, crecen a diario | Pocas, estables |

**Regla práctica:** no todo merece etiqueta madre completa. Las áreas de negocio y RRHH son
mayormente Tipo B (un repo/vault de conocimiento por área), no un enjambre de unidades.

---

## 4. Reglas de la taxonomía

1. **Una etiqueta madre = una unidad de trabajo** con su ecosistema (1 repo, 1 etiqueta Gmail,
   1 carpeta local, **1..N carpetas madre en Drive**).
2. **La etiqueta madre es estable durante todo el ciclo de vida.** Un proyecto que se escribe y
   luego se aprueba NO cambia de etiqueta: cambia de *fase* y gana nuevas carpetas madre en Drive
   (rama escritura → rama aprobado). **Los proyectos nunca migran identidad.**
3. **El "área" es una etiqueta blanda, no una jaula** (ver §7).

---

## 5. Convención de nombre

- **La etiqueta madre = el nombre corto del repo, SIN el prefijo del org de GitHub.**
  `ongpasos-droid/eplus-tools` → etiqueta madre `eplus-tools`. El org (`ongpasos-droid`) va a
  cambiar, así que la etiqueta **no depende de él**.
- **El área NO va en el nombre.** El área/tipo es un **metadato** (campo en la app + carpeta en
  Obsidian), no un prefijo. Así un repo cambia de área sin renombrarse → identidad estable.
- **Nombres nuevos de Tipo A (escribas):** formato `[programa]-[sector]-[acrónimo]`
  (p.ej. `KA220-ADU-SAFE`). El año solo donde aporta. Opcional, no obligatorio.

---

## 6. Anidamiento (etiquetas madre jerárquicas)

Las áreas Tipo B con mucho contenido pueden ser **una sola etiqueta madre con sub-etiquetas hijas
anidadas**. El `/` de las etiquetas de Gmail ya es jerárquico y casa 1:1 con subcarpetas de Drive,
local y Obsidian; en GitHub es **un repo** con subcarpetas dentro.

```
Voluntarios                 → 1 repo, 1 Drive raíz, 1 carpeta local, etiqueta Gmail "Voluntarios"
├── Voluntarios/General      (documentación común del área)
├── Voluntarios/2026         → Gmail "Voluntarios/2026", Drive /2026, repo /2026
│   ├── Voluntarios/2026/Juan
│   └── Voluntarios/2026/Marta
├── Voluntarios/2027
└── Voluntarios/2028
```

### Regla de oro: el repo es la frontera de acceso
Un repo = un permiso. Todo el que accede a `voluntarios` ve TODOS los años y personas.
Pregunta única para decidir subcarpeta vs etiqueta madre propia:
**¿esto necesita su propia línea de "quién puede verlo"?**

| Si… | Entonces… |
|---|---|
| Comparte acceso con el resto del área | **Subcarpeta** dentro de la etiqueta madre |
| Necesita acceso distinto (otra persona, datos sensibles RGPD) | **Etiqueta madre propia** (repo propio) |

Por eso las escribas (Tipo A) son repos individuales (Mari Jara ve SU proyecto, no los de otras)
y Voluntarios (Tipo B) puede ser una sola etiqueta con años dentro. **No es el volumen de
contenido: es dónde hay que trazar la línea de acceso.**

⚠️ **Aviso RGPD:** los datos personales de voluntarios son sensibles. Antes de meterlos como
subcarpeta en un repo que ve toda el área, decidir si la parte sensible debe salir a un espacio
con acceso restringido.

---

## 7. Principio: el "área" es una etiqueta blanda

DB vs App vs Web vs Proyecto es una distinción **cosmética**. Operativamente `catalogosepe`,
`eplus-tools` y `erasmuscantabria` se comportan idéntico: cada uno una etiqueta madre Tipo A, con
su repo, carpeta, Drive y Gmail. Que por dentro una sea "datos" y otra "código" no cambia nada del
aprovisionamiento ni de cómo se consulta.

Lo único que importa **estructuralmente**: (1) **Tipo A vs B** y (2) **frontera de acceso**.
El "área" es un campo de texto libre para ordenar Obsidian, no una decisión de arquitectura.
→ No agobiarse clasificando.

---

## 8. Catálogo de áreas

**Tipo A (unidades, muchas, con Gmail):** Escribas · Bases de datos · Apps · Subvenciones ·
Voluntarios · Emprendedores
**Tipo B (referencia, pocas, sin Gmail):** RRHH/Protocolos · Contabilidad y facturación ·
Diseño y marketing (biblioteca de marca) · Infra/Sistema
**Ambiguas (según el caso caen en A o B):** Diseño/Marketing (campaña=A, biblioteca=B) ·
Ventas (deal=A, pero puede solaparse con GHL/CRM)

### RRHH — protocolos y políticas (Tipo B)
Una sola etiqueta madre de referencia = manual de operación de la empresa.
`RRHH` (o `EMPRESA-RRHH`) → repo + Drive + Obsidian, sin etiqueta Gmail. Estructura sugerida:
`/politicas/`, `/protocolos/` (cómo se escribe un proyecto, cómo se abre una etiqueta madre, cómo
se factura…), `/onboarding/`. Este propio documento es un protocolo de RRHH.

---

## 9. Inventario semilla (repos GitHub existentes = primeras etiquetas madre)

Org actual: `ongpasos-droid` (cambiará; la etiqueta madre es el nombre corto).

| Etiqueta madre (repo) | Área | Tipo | Nota (verificada en el repo) |
|---|---|---|---|
| `eplus-tools` | Apps | A | SaaS EU Funding School |
| `directory-unification` | Bases de datos | A | Postgres unificado erasmus-pg |
| `erasmus-db-tools` | Bases de datos | B | tooling de scraping |
| `catalogosepe` | Bases de datos | A | scraping catálogo SEPE |
| `erasmus-emprendedores` | Emprendedores/BD | A | BD interna 2625 leads + visor + spec app |
| `eacea_evaluator` | Apps | A | evaluador EACEA |
| `eufundingschool-moodle` | Apps | A | Moodle formación |
| `firmar-documentos-ongs-europeas` | Apps | A | firma de documentos |
| `kizombaap` | Apps | A | app TIFMAP |
| `erasmus-lab-html` | Apps | A | laboratorio HTML, prototipo previo al SaaS eplus-tools |
| `erasmuscantabria` | Marketing/Web | A | web erasmuscantabria.com + newsletter/leads |
| `proyecto-emociona` | Escribas/Gestión | A | proyecto concreto |
| `fundae` | (sin definir) | ? | **repo vacío**, placeholder reservado |
| `barraquel` | Personal/Externo | A | web del bar de la hermana (¿fuera del ecosistema empresa?) |
| `DESIGNER-projects` | Diseño y marketing | B | proyectos de diseño de Ana |
| `claude-shared-memory` | Infra/Sistema | B | memoria compartida entre claudes |
| `claude-vps-memory` | Infra/Sistema | B | memoria del VPS |
| `boilerplate` | Infra/Sistema | B | plantilla base |

### Etiquetas madre nuevas a crear (proyectos de escribas, Tipo A)
- `KA3-BICYCLE`
- `KA220-ADU-SAFE`
- (candidatas mencionadas: `COVE-OASIS-2026`, `KA2-SUSTRAI-2026` [proyecto vivo TOURSME])

---

## 10. Decisiones abiertas (pendientes de Oscar)

1. **`fundae`** vacío: ¿qué será? (BD, app, o área de contabilidad/facturación Bitectura-FUNDAE).
2. **`barraquel`** (bar de la hermana): ¿vive en el ecosistema de la empresa o en un espacio aparte
   por ser personal/externo?
3. **Escribas vs Subvenciones propias:** frontera clara entre proyectos escritos para clientes
   (KA2/KA3…) y subvenciones que pide la propia empresa para sí (BDNS, regional…).
4. **Grano de áreas de negocio (5–8):** ¿Ventas y Diseño/Marketing llevan etiqueta madre real por
   unidad o son carpetas de área Tipo B? Ojo con solapamiento Ventas ↔ GHL/CRM.

---

## 11. Siguiente paso (no hecho todavía)

Definir los **campos del registro maestro** que la app guardará por cada etiqueta madre. Propuesta
inicial de esquema:

```
nombre           (= repo short name, único)
area             (texto libre, blando — para Obsidian)
tipo             (A | B)
github_repo      (owner/repo actual)
drive_url        (pegada a mano; puede haber varias → carpetas madre)
gmail_label      (nombre de la etiqueta; puede ser jerárquica con "/")
local_path       (ruta autoinstalada en el equipo del asignado)
asignado         (persona responsable; correo con acceso al repo)
fase             (escritura | aprobado | ejecución | cerrado | perenne)
last_synced      (última lectura del Chrome / Claude local)
```

Esto es lo que convierte la taxonomía en algo operable por la app interna del VPS.
