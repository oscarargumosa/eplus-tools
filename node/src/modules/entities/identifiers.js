/* ═══════════════════════════════════════════════════════════════
   OID vs PIC — dos identificadores distintos de la misma entidad
   ═══════════════════════════════════════════════════════════════
   NO son sinónimos y no se deben fusionar nunca:

   · OID (Organisation ID) — `E` + 8-9 dígitos, p.ej. E10151149.
     Es el identificador del Organisation Registration System (ORS),
     el que usa Erasmus+ desde la migración de 2019-2020.

   · PIC (Participant Identification Code) — 9 dígitos, p.ej. 940435371.
     Es el del Participant Portal. Sigue vivo en Horizon Europe y otros
     programas de gestión directa.

   Una misma organización suele tener los dos. Cada uno vive en su
   columna (`entities.oid` / `entities.pic`) y así debe seguir.

   EL PROBLEMA REAL no es de modelo, es de DATOS: hay filas en las que
   el OID quedó guardado en la columna `pic` y `oid` se quedó vacío
   (caso ORIEL APS, reportado al VPS el 2026-06-27). Mientras eso no se
   repare en origen, la app no puede fiarse de la COLUMNA: tiene que
   mirar el FORMATO del valor, que sí es inequívoco.

   Este módulo es esa capa. Es determinista (no adivina) y se vuelve un
   no-op en cuanto el dato de origen quede limpio.
   ═══════════════════════════════════════════════════════════════ */

const RE_OID = /^E\d{6,}$/i;   // E + al menos 6 dígitos (los reales son 8-9)
const RE_PIC = /^\d{9}$/;      // exactamente 9 dígitos

/* Qué es este valor, mirando solo su forma. null = ninguno de los dos. */
function idKind(value) {
  const v = String(value == null ? '' : value).trim();
  if (!v) return null;
  if (RE_OID.test(v)) return 'oid';
  if (RE_PIC.test(v)) return 'pic';
  return null;
}

const isOid = (v) => idKind(v) === 'oid';
const isPic = (v) => idKind(v) === 'pic';

/* Coloca cada identificador en su sitio a partir del formato.
   Devuelve { oid, pic, oid_recovered } sin tocar nada más.
   - oid vacío + pic con forma de OID  → el OID se recupera de pic y pic se vacía.
   - oid con forma de PIC y pic vacío  → se intercambian.
   - cualquier otro caso              → se respeta lo que venga. */
function resolveIds(row = {}) {
  const oidRaw = String(row.oid == null ? '' : row.oid).trim();
  const picRaw = String(row.pic == null ? '' : row.pic).trim();

  if (!oidRaw && isOid(picRaw)) {
    return { oid: picRaw.toUpperCase(), pic: null, oid_recovered: true };
  }
  if (!picRaw && isPic(oidRaw)) {
    return { oid: null, pic: oidRaw, oid_recovered: false };
  }
  return { oid: oidRaw || null, pic: picRaw || null, oid_recovered: false };
}

/* Aplica resolveIds a una fila de entidad, conservando el resto de campos. */
function normalizeEntityIds(row) {
  if (!row || typeof row !== 'object') return row;
  const { oid, pic, oid_recovered } = resolveIds(row);
  return { ...row, oid, pic, oid_recovered };
}

const normalizeEntityIdsAll = (rows) =>
  (Array.isArray(rows) ? rows : []).map(normalizeEntityIds);

module.exports = { idKind, isOid, isPic, resolveIds, normalizeEntityIds, normalizeEntityIdsAll, RE_OID, RE_PIC };
