# AI Bridge — la IA de suscripción dentro del contenedor

Escrito el 7 de septiembre de 2026, al desplegar EU Vision (TASK-012) en producción.

## El problema

Las funciones de IA del SaaS llaman a `node/src/utils/claude-cli.js`, que lanza
`claude -p` (Claude Code headless, autenticado con la **suscripción** de Óscar).
Nunca la API de pago: esa es regla de negocio, no preferencia.

En local funciona porque el CLI está instalado. En producción la app corre en un
contenedor de Coolify que no tiene ni el binario ni las credenciales, así que
`spawn('claude')` falla con `ENOENT` y el botón de «Redactar con IA» devuelve 503.

## La solución

Un servicio en el **host** —donde el CLI sí está autenticado— que expone ese mismo
`claude -p` por HTTP, y solo a la red interna de Docker.

```
contenedor e+ tools ──POST /run──▶ <gateway-coolify>:4020 (host) ──▶ claude -p ──▶ suscripción
```

- **Código:** `/opt/ai-bridge/server.js` (no versionado en este repo; vive en el VPS).
- **Servicio:** `ai-bridge.service` (systemd, `enable`d, `Restart=always`).
- **Token:** `/opt/ai-bridge/.env`, permisos 600.
- **Escucha:** `127.0.0.1:4020` (pruebas desde el host) y `<gateway-coolify>:4020`
  (gateway de la red `coolify`; IP: ver nota interna del VPS). **No** escucha en `0.0.0.0`.

### Contrato

```
GET  /health                       → { ok, running, max }
POST /run                          → { ok: true, text, ms }
     cabecera X-Bridge-Token: <token>
     body { prompt, model?, timeoutMs? }
```

Errores: `401` token inválido · `413` prompt > 200 KB · `429` ocupado (`AI_BUSY`,
máx. 2 en paralelo) · `502` fallo o timeout del CLI.

### Blindaje

El CLI se lanza **sin ninguna herramienta** (`--disallowed-tools Bash Edit Write
Read WebFetch WebSearch Glob Grep Task NotebookEdit`) y con `cwd` en un directorio
vacío: solo puede generar texto, no tocar disco ni red. El token se compara en
tiempo constante. La unidad systemd va con `ProtectSystem=strict`.

## Cómo lo usa la app

`claude-cli.js` mira `AI_BRIDGE_URL`:

- **definida** → habla con el puente (producción);
- **vacía** → `spawn('claude')` como siempre (desarrollo local, sin cambios).

Variables en Coolify (app `e+ tools`; uuid: ver nota interna del VPS):

| Variable | Valor |
|---|---|
| `AI_BRIDGE_URL` | `http://<gateway-coolify>:4020` |
| `AI_BRIDGE_TOKEN` | el de `/opt/ai-bridge/.env` |

`VISION_AI_SUBSCRIPTION=off` sigue desactivando la IA en cualquiera de las dos vías.

## Diagnóstico

```bash
systemctl status ai-bridge
journalctl -u ai-bridge -f          # una línea por petición, con ms y tamaños
curl -s http://127.0.0.1:4020/health
```

Si el gateway de la red `coolify` cambiara de IP (recrear la red), hay que
actualizar `BRIDGE_HOSTS` en `/opt/ai-bridge/.env` y `AI_BRIDGE_URL` en Coolify:
`docker inspect <contenedor> --format '{{range .NetworkSettings.Networks}}{{.Gateway}}{{end}}'`.

## Lo que este puente no arregla

La latencia es la del CLI: ~6 s para una respuesta corta, y hasta el timeout para
una redacción larga. El front tiene que enseñar progreso, no bloquear. Y con dos
peticiones en paralelo como tope, si EU Vision se usa de verdad en una cohorte
habrá que subir `MAX_CONCURRENT` o encolar.

---

## Toda la IA del SaaS por el puente (8-oct-2026)

Antes solo EU Vision usaba el puente; el resto (`utils/ai.js`) llamaba a la API
de pago de Anthropic y, en la live, fallaba porque `ANTHROPIC_API_KEY` no está
definida. Desde este cambio:

| Pieza | Cómo funciona ahora |
|---|---|
| `utils/ai.js` `callClaude` / `callClaudeChat` | Con `AI_BRIDGE_URL` → puente, **nunca** `api.anthropic.com` (`getClient()` lanza `AI_API_DISABLED`). El system prompt va dentro del prompt en `<instructions>`; el chat multi-turno se serializa en `<conversation><user>…<assistant>…`. `max_tokens` ≤ 1200 se convierte en una pista de longitud; los JSON se siguen sacando del texto (`extractJson`). Sin puente y sin clave → `AI_NOT_CONFIGURED` (503). `isConfigured()` sustituye a los `if (!process.env.ANTHROPIC_API_KEY)`. |
| `opts.model: 'cheap'` | Por el puente pasa `--model haiku` (`AI_BRIDGE_MODEL_CHEAP`). El resto usa `AI_BRIDGE_MODEL` (vacío = el modelo por defecto del CLI). |
| `master/anthropic-client.js` `callWithCache` (CAG, diagnose) | Con puente: concatena bloques system/user, sin caché ni streaming; `onText` recibe el texto completo al final; `costUsd: 0`. |
| `services/ai-parse.js` | Por `ai.callClaude`; con puente el documento se recorta a `AI_PARSE_BRIDGE_MAX_CHARS` (150.000) para no pasar de los 200 KB del puente. |
| `exporter/translate.js` | Trozos de 25.000 caracteres con puente (la respuesta tiene que caber en < 290 s). |
| `ai_usage_log` | `provider = 'ai-bridge'`, tokens estimados (1 tok ≈ 3,5 caracteres). |

### Cola y reintentos (`utils/claude-cli.js`)

- Semáforo de `AI_BRIDGE_CONCURRENCY` (2) llamadas a la vez por proceso.
- Si el puente devuelve 429 (lo comparten otras apps) → reintento con backoff
  1,5 s · 3 s · 6 s · 12 s (`AI_BRIDGE_RETRIES`, 4). Agotados → `AI_BUSY` 503
  «La IA está ocupada…».
- Espera máxima en cola `AI_BRIDGE_QUEUE_TIMEOUT_MS` (120 s) → `AI_BUSY`.
- Timeout por llamada `AI_BRIDGE_TIMEOUT_MS` (240 s), tope duro 290 s (el
  `fetch` de Node corta a los 300 s esperando cabeceras) → `AI_TIMEOUT` 504.
- Puente caído → `AI_UNAVAILABLE` 503. Prompt > 195 KB → `AI_PROMPT_TOO_LARGE` 413.

### Límites de uso (`middleware/aiLimit.js`)

Montado tras `requireAuth` en vision generate, smart-shortlist, evaluator
upload-parse, developer (generate/evaluate/improve/refine/interview/prep…/ai-fill/
risks/regenerate), intake interview, convocatorias chat, master (compile,
regenerate, diagnose, refine, compress), diagnose propose, voice transcribe y la
descarga `.docx` cuando lleva `?lang=` (traducción).

| Variable | Defecto | Qué hace |
|---|---|---|
| `AI_USER_HOURLY_LIMIT` | 30 | llamadas/hora por usuario |
| `AI_ADMIN_HOURLY_LIMIT` | 300 | ídem para `role=admin` (0 = sin límite) |
| `AI_GLOBAL_DAILY_LIMIT` | 1000 | tope diario de toda la plataforma (día UTC; admins no se bloquean) |

Contadores en memoria (un proceso): se reinician al redesplegar. Respuesta 429
`AI_RATE_LIMITED` / `AI_DAILY_CAP` en español. `enforceRefineCap` sigue aparte.

### RAG de convocatorias (embeddings locales)

- `convocatorias/rag.js` usa `services/embeddings.js` (Xenova/all-MiniLM-L6-v2,
  384 dim, local) y responde por el puente.
- Índice nuevo en `CALL_VECTORS_LOCAL_DIR` (defecto `data/call_vectors_local`),
  generado con `nice -n 15 node scripts/embed-calls-local.js` (lee el texto de
  `data/call_extracts` o, si no está, el de `data/call_vectors`, **sin tocarlo**).
  128 convocatorias ≈ 25 min de CPU en el VPS. Se recarga solo si cambia `_index.json`.
- Sin índice local → búsqueda por palabras clave (feed + texto de los fragmentos).
- `scripts/embed-calls.js` (OpenAI) queda bloqueado salvo `--allow-paid-api`.
- `scripts/structure-call.js` usa `claude-cli.js` (puente o CLI local).
- `EMBEDDINGS_CACHE_DIR` (opcional): carpeta de caché del modelo de embeddings.

Ojo: MiniLM es un modelo inglés; las preguntas en español encuentran peor que con
los vectores de OpenAI. Si se nota, valorar un modelo multilingüe local
(p. ej. `Xenova/paraphrase-multilingual-MiniLM-L12-v2`) y reindexar.

### Dictado por voz

Sin OpenAI. `voice/controller.js` transcribe en local:
- `WHISPER_URL` → servidor compatible con whisper.cpp (`/inference`). No hay
  ninguno en marcha; el binario de `/opt/whisper.cpp` muere con «invalid
  opcode» (compilado para otra CPU).
- `WHISPER_PY=1` → `scripts/whisper-local.py` con faster-whisper (instalado en
  el host, modelos `tiny`/`small` en caché; `WHISPER_PY_MODEL`, defecto `small`:
  ~10-15 s y ~700 MB por dictado). Solo sirve fuera del contenedor.
- Ninguna → `503 VOICE_UNAVAILABLE` y el front (`voice-input.js`) muestra
  «El dictado por voz no está disponible…» sin pedir micrófono.
La traducción al idioma de trabajo va por el puente (haiku).

### Gemini

Solo `developer/model.js` (`callAI`, borradores) y solo si `GEMINI_ENABLED=true`
**y** `GEMINI_API_KEY`. Si falla, cae a `callClaude` (puente). No definir
`GEMINI_ENABLED` en producción: es otra API de pago.

### Variables en la live

- Necesarias: `AI_BRIDGE_URL`, `AI_BRIDGE_TOKEN` (ya están).
- Se pueden **quitar**: `OPENAI_API_KEY` (nada la usa en `node/src`), `ANTHROPIC_API_KEY`.
- Opcionales: las de límites y cola de arriba, `CALL_VECTORS_LOCAL_DIR` (si el
  índice local vive en el volumen compartido, p. ej. `data/call_vectors_local`).
