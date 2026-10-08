/* ── Subida de imágenes públicas (logos, avatares…) ──────────────
   Solo JPG, PNG, WebP y GIF. El tipo se detecta por los primeros bytes
   (magic numbers), no por el mimetype ni la extensión que manda el cliente,
   y la extensión del fichero la elige el servidor. Sin SVG (puede llevar JS).

   Uso con multer memoryStorage:
     const img = ensureSafeImage(req.file.buffer);   // lanza 400 si no vale
     fs.writeFile(path.join(dir, 'logo-' + Date.now() + img.ext), req.file.buffer)

   Uso con multer diskStorage (el fichero ya está en disco):
     router.post('/x', upload.single('logo'), imageUploadGuard(), ctrl.x)
   El guard valida, renombra a la extensión correcta (req.file.filename/path
   quedan actualizados) o borra el fichero y responde 400. */
const fs   = require('fs');
const fsp  = require('fs/promises');
const path = require('path');

const TYPES = {
  jpeg: { mime: 'image/jpeg', ext: '.jpg' },
  png:  { mime: 'image/png',  ext: '.png' },
  webp: { mime: 'image/webp', ext: '.webp' },
  gif:  { mime: 'image/gif',  ext: '.gif' },
};

/** Detecta el tipo por los bytes iniciales. Devuelve { type, mime, ext } o null. */
function validateImageBuffer(buf) {
  if (!buf || buf.length < 12) return null;
  let type = null;
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) type = 'jpeg';
  else if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) type = 'png';
  else if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') type = 'webp';
  else if (['GIF87a', 'GIF89a'].includes(buf.toString('ascii', 0, 6))) type = 'gif';
  return type ? { type, ...TYPES[type] } : null;
}

/** Igual que validateImageBuffer pero lanza un error 400 si no es una imagen admitida. */
function ensureSafeImage(buf) {
  const info = validateImageBuffer(buf);
  if (!info) {
    const e = new Error('Formato no admitido: sube una imagen JPG, PNG, WebP o GIF');
    e.status = 400;
    e.code = 'INVALID_IMAGE';
    throw e;
  }
  return info;
}

/** Lee los primeros bytes de un fichero en disco. */
async function readHead(filePath, n = 16) {
  const fh = await fsp.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(n);
    const { bytesRead } = await fh.read(buf, 0, n, 0);
    return buf.subarray(0, bytesRead);
  } finally { await fh.close(); }
}

/** Middleware tras multer diskStorage (campo single). */
function imageUploadGuard() {
  return async (req, res, next) => {
    if (!req.file || !req.file.path) return next();
    try {
      const info = ensureSafeImage(await readHead(req.file.path));
      // Extensión elegida por el servidor según el tipo real
      const base = path.basename(req.file.filename, path.extname(req.file.filename));
      const filename = base + info.ext;
      const dest = path.join(path.dirname(req.file.path), filename);
      if (dest !== req.file.path) await fsp.rename(req.file.path, dest);
      Object.assign(req.file, { filename, path: dest, mimetype: info.mime });
      next();
    } catch (e) {
      fs.unlink(req.file.path, () => {});
      res.status(e.status || 500).json({ ok: false, error: { code: e.code || 'UPLOAD_ERROR', message: e.message } });
    }
  };
}

module.exports = { validateImageBuffer, ensureSafeImage, imageUploadGuard, IMAGE_TYPES: TYPES };
