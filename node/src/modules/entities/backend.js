/* ═══════════════════════════════════════════════════════════════
   Entities backend selector — feature flag ENTITIES_BACKEND
   ═══════════════════════════════════════════════════════════════
   Encapsula la decisión de si el módulo entities consulta
   directamente MySQL eplus_tools (modo legacy) o el directory-api
   del VPS (modo nuevo, post-unificación BD Postgres).

   ENTITIES_BACKEND=mysql        (default, modo legacy)
   ENTITIES_BACKEND=directory_api (llama directorio.eufundingschool.com/api/*)

   Cuando controller.js pase a usar `./backend` en lugar de `./model`
   directamente, el switch se activa sin tocar el controller.
   Hoy controller.js sigue usando `./model` — backend.js está aquí
   para que la migración sea un solo grep+replace cuando los
   endpoints del directory-api estén listos.
   ═══════════════════════════════════════════════════════════════ */

const flag = (process.env.ENTITIES_BACKEND || 'mysql').toLowerCase();

let backend;
switch (flag) {
  case 'mysql':
    backend = require('./model');
    break;
  case 'directory_api':
    backend = require('./model.directory');
    break;
  default:
    throw new Error(
      `Invalid ENTITIES_BACKEND='${flag}'. Use 'mysql' (legacy) or 'directory_api' (post-unification).`
    );
}

module.exports = backend;
module.exports._activeBackend = flag;
