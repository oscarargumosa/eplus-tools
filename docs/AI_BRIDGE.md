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
