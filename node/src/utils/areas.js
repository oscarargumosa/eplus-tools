/* ═══════════════════════════════════════════════════════════════
   Áreas de la fase beta cerrada (oct-2026)
   ─────────────────────────────────────────────────────────────
   Partes de Studio que el admin abre a cada persona desde
   «Usuarios y accesos». Sin el área, la API devuelve 403
   AREA_REQUIRED (middleware/auth.js → requireArea) y la SPA enseña
   la pantalla «Fase beta» con «Solicitar acceso».
   El rol 'admin' tiene todas siempre. Para añadir un área: una
   entrada aquí, su requireArea en las rutas y su etiqueta en
   public/js/beta-access.js.
   ═══════════════════════════════════════════════════════════════ */

const AREAS = {
  proyectos: {
    label: 'Proyectos',
    // Adónde lleva el enlace del correo «Ya tienes acceso».
    path:  '/#my-projects',
  },
  academia: {
    label: 'Academia',
    path:  '/academia',
  },
  comunidad: {
    label: 'Comunidad',
    path:  '/comunidad',
  },
};

const AREA_KEYS = Object.keys(AREAS);

function isArea(a) { return typeof a === 'string' && Object.prototype.hasOwnProperty.call(AREAS, a); }
function areaLabel(a) { return isArea(a) ? AREAS[a].label : String(a || ''); }

module.exports = { AREAS, AREA_KEYS, isArea, areaLabel };
