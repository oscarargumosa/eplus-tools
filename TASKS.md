# TASKS — eplus-tools dev-vps

> Última actualización: 2026-04-04
> Regla: máx 3-4 acciones por bloque. Hacer push al terminar cada bloque. Al retomar, leer este archivo primero.

---

## TAREA 4 — Dashboard con datos reales

**Objetivo:** El dashboard muestra contadores y actividad real del usuario desde la DB, no placeholders.

### Bloque 4.1 — Endpoint stats [ ]
- Crear `node/src/modules/dashboard/model.js`: queries para contar proyectos, socios, actividades del usuario
- Crear `node/src/modules/dashboard/routes.js`: `GET /v1/dashboard/stats`
- Registrar en server.js
- Push inmediato

### Bloque 4.2 — Frontend stats [ ]
- Modificar `public/js/app.js`: en `navigate('dashboard')`, llamar `/v1/dashboard/stats` y pintar datos
- Actualizar cards del dashboard en HTML con ids para poder inyectar datos
- Push inmediato

### Bloque 4.3 — Actividad reciente [ ]
- Añadir query de actividad reciente (últimas 5 acciones: proyectos/socios creados/modificados)
- Renderizar lista de actividad en dashboard
- Push inmediato

---

## TAREA 5 — Editor inline en Data E+ (admin panel)

**Objetivo:** Las secciones de Data E+ (países, per diem, categorías personal) permiten editar directamente en la tabla, sin modales separados.

### Bloque 5.1+5.2+5.3 — Inline edit todas las secciones [DONE]
- Implementado en admin.js: países, per diem, personal, convocatorias
- Push: commit a6d1b5f

---

## URGENTE (pendiente de acción de Oscar)

### Bloque U.1 — Docker socket [ ]
- Añadir `/var/run/docker.sock:/var/run/docker.sock` en compose volumes de Coolify
- (Requiere acción manual en Coolify UI)

### Bloque U.2 — Migraciones y rol admin [ ]
- Ejecutar `020_admin_ref_tables.sql` y `022_erasmus_eligibility.sql` en MySQL
- `UPDATE users SET role='admin' WHERE email='<correo del admin>'` (ver nota interna del VPS)
- (Requiere merge a main + acceso MySQL)

### Bloque U.3 — Merge dev-vps → main [ ]
- Claude PC hace merge de dev-vps a main
- Auto-deploy configurado vía webhook GitHub→Coolify ✅

---

## COMPLETADAS

- [DONE] Resumen matutino (morning-summary-v2.cjs + scheduler.js)
- [DONE] Fix container Docker (node:22 image)
- [DONE] Panel admin Data E+ — estructura base (convocatorias, países, per diem, personal)
- [DONE] Fix bugs admin panel (uuid, API.del, Toast, titles)
- [DONE] Credenciales Coolify y GitHub en .env y memoria
- [DONE] Tarea 5 — Inline edit todas las secciones Data E+
- [DONE] Elegibilidad Erasmus+ — 14 regiones, ~130 países, filtros por tipo/región
- [DONE] Webhook GitHub→Coolify auto-deploy en main
