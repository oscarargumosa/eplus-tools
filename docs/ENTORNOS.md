# Entornos de EU Funding Studio

> Doc canónico de **qué instancia es cuál**, dónde vive y contra qué base de datos habla.
> Escrito el 2026-09-13, cuando la copia de trabajo del VPS todavía apuntaba a la BD de producción.

---

## 1 · Producción (live)

| | |
|---|---|
| **URL** | https://intake.eufundingschool.com |
| Alias | `app.eufundingschool.com` → redirige 301 a intake |
| Dónde corre | Contenedor de Coolify `t14ghiihp7i5y8xi9tz8n5m1`, puerto `3006` del VPS |
| Rama | `main` — **cada push a main despliega solo** |
| Base de datos | MySQL `eplus_tools` en el contenedor `wordpress-eufunding-db-1` (`172.19.0.5:3306`) |
| Variables | En el panel de Coolify, **no** en el repo |
| Entrada | Login de la propia app (`oscarargumosa@gmail.com`, rol admin) |

El proxy es el nginx del host: `/etc/nginx/conf.d/intake.eufundingschool.com.conf`.

## 2 · Dev del VPS

| | |
|---|---|
| **URL** | https://dev.eufundingstudio.com — activa, con certificado |
| Dónde corre | `/opt/eplus-tools-dev`, servicio systemd `eplus-dev.service`, puerto `3013` |
| Rama | `dev-vps` |
| Base de datos | MySQL `eplus_tools_dev` (127.0.0.1:3306) — **nunca `eplus_tools`** |
| Variables | `/opt/eplus-tools-dev/.env` |
| Logs | `/var/log/eplus-dev.log` · `journalctl -u eplus-dev -f` |
| Montaje | `./scripts/setup-dev-vps.sh clon` (copia de la live) o `… limpia` (BD vacía + migraciones) |

`JWT_SECRET` es distinto del de producción a propósito: una sesión de dev no vale en la live y
al revés. El nginx de dev manda `X-Robots-Tag: noindex` y tiene el basic auth preparado
(comentado) en `/etc/nginx/conf.d/dev.eufundingstudio.com.conf`.

La BD de dev es un **clon** de la live (13-sep-2026). Las contraseñas de usuario pueden
divergir: la de Óscar se repuso solo en dev, la de producción quedó intacta.

## 3 · La web oficial (futura)

`eufundingstudio.com` está registrado en Namecheap (jul-2026) pero **aparcado a propósito**:
la raíz no tiene registro A. Será la web pública el día del lanzamiento. El flujo previsto es
`dev.eufundingstudio.com` → `intake.eufundingschool.com` (semi-live, la puerta de antes) →
`eufundingstudio.com` (oficial).

## 4 · Local del PC (Laragon)

Rama `dev-local`, MySQL de Laragon. Ver `CLAUDE.md` §Servidor y Entorno.

## 5 · Cron de datos

`/opt/eplus-tools-cron`, rama `data-auto`, `eplus-data-refresh.service`. Solo refresca datos de
convocatorias; **no** es una instancia de la app.

## 6 · Checkout obsoleto

`/opt/eplus-tools` quedó parado en la rama `feat/visor-kb` (27-jun-2026) y no sirve nada.
No trabajar ahí.

---

## Regla de separación

**Ninguna copia de trabajo apunta a `eplus_tools`.** Esa BD es solo para el contenedor de
Coolify. Si un `.env` de `/opt/eplus-tools-dev` vuelve a tener `DB_NAME=eplus_tools`, está mal:
el original que lo tenía se guardó como `.env.apuntaba-a-PROD.bak` y no debe restaurarse.

Para mover trabajo de dev a producción se sigue el protocolo de ramas de `CLAUDE.md`:
`dev-vps` → `/merge` → `main` → Coolify despliega.
