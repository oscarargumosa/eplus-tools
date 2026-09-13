# Inventario: qué hay en dev y qué falta

> Comprobación del 13-sep-2026, al montar la instancia dev del VPS. Objetivo: verificar que
> no se pierde nada de lo que había en producción. Ver `ENTORNOS.md`.

---

## 1 · Base de datos: completa

Las **106 tablas** de `eplus_tools` están en `eplus_tools_dev` con el **mismo número exacto de
filas** (contado con `COUNT(*)`, no con la estimación de `information_schema`).

Única diferencia: `events` (814 en producción, 860 en dev). Es telemetría, y los de más son de
las pruebas hechas en dev — sirve además de prueba de que dev escribe en su propia base.

Lo que importa, verificado uno a uno:

| | |
|---|---|
| Proyectos | 4 — ARISE (KA3-Youth, *writing*), test, aaa, Mindcare (los 3 CoVE, *draft*) |
| Organizaciones | 4 — EXELIA, centre sectoriel (Túnez), Creativity Works Preston, ASOCIACIÓN PERMACULTURA |
| Socios | 22 |
| Usuarios | 5 |
| Contextos de intake | 4 |
| Documentos (registros) | 4 — **pero los ficheros no existen: ver §3** |

## 2 · Lo que faltaba en dev y ya está copiado

- **`data/call_vectors`** (689 MB, 129 ficheros) y **`data/call_structured`** (1,4 MB).
  Producción los recibe por *bind mount* desde `/data/eplus-shared`; dev no tenía nada. Sin
  ellos la búsqueda semántica de convocatorias no arranca. Verificado: `rag-status` responde
  **23.659 chunks en 128 convocatorias**.
- **`DIRECTORY_API_KEY`**. Sin ella el módulo de entidades caía. Verificado: el directorio
  responde **328.675 entidades**.
- `AI_BRIDGE_TOKEN`, `AI_MODEL` y `APP_URL`.

## 3 · Pérdida ya consumada: los ficheros subidos

**Los 4 documentos registrados en `documents` apuntan a PDFs que no existen en ningún sitio.**

```
storage_path: /uploads/documents/0ca65274-...-1775416189135.pdf   (205 KB)
storage_path: /uploads/documents/0ca65274-...-1775416483832.pdf   (918 KB, «guia expertos 2026»)
…
```

Buscados por todo el VPS: no aparecen. Y la carpeta del contenedor de producción está vacía
salvo un `.gitkeep` con fecha del último despliegue.

**La causa:** el contenedor de Coolify solo tiene dos volúmenes, y ninguno es para las subidas:

```
/data/eplus-shared/call_structured -> /app/data/call_structured
/data/eplus-shared/call_vectors    -> /app/data/call_vectors
```

`/app/public/uploads/` vive dentro del contenedor, así que **cada despliegue borra todo lo que
los usuarios hayan subido**. No es un problema del clon de dev: los ficheros ya se habían
perdido en producción.

**Qué hay que hacer** (toca el panel de Coolify, decisión de Óscar):

1. Añadir un volumen persistente para `/app/public/uploads`.
2. Decidir qué hacer con los 4 registros huérfanos: borrarlos o marcarlos como no disponibles,
   para que la UI no ofrezca una descarga que da 404.

## 4 · Lo que a propósito NO se copió a dev

| Variable | Por qué no |
|---|---|
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` | Son API de pago por token. La regla del ecosistema es IA por suscripción, vía `ai-bridge` |
| `RESEND_API_KEY`, `EMAIL_FROM` | Dev podría mandar correo de verdad a usuarios reales mientras se hacen pruebas |
| `GHL_API_KEY`, `GHL_LOCATION_ID` | Dev escribiría en el CRM real |
| `GOOGLE_CLIENT_ID`, `OIDC_*` | El callback no tiene autorizado `dev.eufundingstudio.com`: no funcionaría aunque se copie |

**Consecuencia conocida:** en dev, la **búsqueda semántica de convocatorias no funciona**.
Los vectores están, pero para vectorizar *la consulta del usuario* el código llama a OpenAI
(`text-embedding-3-small`) y devuelve `Missing credentials`. Todo lo demás del módulo
—listado, filtros, fichas— sí funciona.

Esto deja a la vista una contradicción que ya existía en producción: los embeddings de
convocatorias van por API de pago de OpenAI, no por suscripción. Decisión de Óscar si se migra
a `ai-bridge` o se asume.
