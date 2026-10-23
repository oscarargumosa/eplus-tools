/**
 * Simple request body validator.
 * Usage: validate({ name: 'required', email: 'required', age: 'optional' })
 */
function validate(schema) {
  return (req, res, next) => {
    const errors = [];
    for (const [field, rule] of Object.entries(schema)) {
      if (rule === 'required' && (req.body[field] === undefined || req.body[field] === null || req.body[field] === '')) {
        errors.push(`${field} is required`);
      }
    }
    if (errors.length > 0) {
      return res.status(400).json({ ok: false, error: 'Faltan datos obligatorios', details: errors });
    }
    next();
  };
}

module.exports = validate;
