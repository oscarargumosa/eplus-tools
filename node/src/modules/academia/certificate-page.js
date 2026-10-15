/* Página pública del certificado: /academia/certificado/:serial
   Sirve para verificarlo (quien tenga el enlace ve que es auténtico) y para
   imprimirlo o guardarlo en PDF desde el navegador. Colores de Studio.      */

const { certificate } = require('./model');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

module.exports = async function certificatePage(req, res) {
  let c = null;
  try { c = await certificate(req.params.serial); } catch (e) { console.error('[academia] certificado', e); }
  res.set('X-Robots-Tag', 'noindex');
  if (!c) {
    return res.status(404).send(`<!doctype html><meta charset="utf-8"><title>Certificado no encontrado</title>
<body style="font-family:Poppins,sans-serif;padding:48px;color:#222351">No existe ningún certificado con el número <b>${esc(req.params.serial)}</b>.</body>`);
  }
  const fecha = new Date(c.issued_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  res.send(`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Certificado · ${esc(c.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  :root{--navy:#3c45a3;--yellow:#d6e949;--lav:#997fc7;--ink:#222351;--muted:#474551}
  *{box-sizing:border-box}
  body{margin:0;background:#eeeeee;font-family:Poppins,system-ui,sans-serif;color:var(--ink)}
  .bar{max-width:1000px;margin:24px auto 0;display:flex;justify-content:flex-end;gap:10px;padding:0 16px}
  .bar button{background:var(--navy);color:var(--yellow);border:0;border-radius:10px;padding:10px 18px;font:600 14px Poppins;cursor:pointer}
  .cert{max-width:1000px;aspect-ratio:1.414/1;margin:16px auto 40px;background:#fff;position:relative;overflow:hidden;
        display:flex;flex-direction:column;justify-content:space-between;padding:6% 7%;box-shadow:0 10px 40px rgba(60,69,163,.15)}
  .cert:before{content:"";position:absolute;inset:0 0 auto 0;height:14px;background:var(--navy)}
  .cert:after{content:"";position:absolute;right:-120px;bottom:-120px;width:360px;height:360px;border-radius:50%;background:var(--lav);opacity:.35}
  .top{display:flex;justify-content:space-between;align-items:center}
  .brand{font-size:26px;font-weight:800;letter-spacing:-.02em;color:var(--navy);line-height:1}
  .brand span{box-shadow:inset 0 -.32em 0 var(--yellow)}
  .kicker{font-size:13px;letter-spacing:.25em;text-transform:uppercase;color:var(--muted);font-weight:600}
  h1{font-size:clamp(28px,4.4vw,48px);font-weight:800;color:var(--navy);margin:.2em 0 .1em;line-height:1.1}
  .name{font-size:clamp(24px,3.6vw,40px);font-weight:700;margin:.2em 0;border-bottom:3px solid var(--yellow);display:inline-block;padding-bottom:4px}
  .course{font-size:clamp(16px,2vw,22px);font-weight:600;color:var(--navy)}
  .meta{display:flex;gap:40px;flex-wrap:wrap;font-size:13px;color:var(--muted);position:relative;z-index:1}
  .meta b{display:block;color:var(--ink);font-size:15px}
  @media print{body{background:#fff}.bar{display:none}.cert{margin:0;box-shadow:none;max-width:none;width:100%}@page{size:A4 landscape;margin:0}}
</style></head>
<body>
<div class="bar"><button onclick="window.print()">Imprimir o guardar en PDF</button></div>
<main class="cert">
  <div class="top"><span class="brand">EU Funding <span>Studio</span></span><span class="kicker">Certificado de aprovechamiento</span></div>
  <div>
    <div class="kicker">Se certifica que</div>
    <div class="name">${esc(c.full_name)}</div>
    <p style="margin:18px 0 6px;font-size:16px;color:var(--muted)">ha completado y superado el curso</p>
    <h1>${esc(c.title)}</h1>
    <div class="course">${c.modules} módulos · ${c.lessons} lecciones${c.hours ? ` · ${c.hours} horas` : ''}</div>
  </div>
  <div class="meta">
    <div>Fecha de emisión<b>${esc(fecha)}</b></div>
    <div>Número de certificado<b>${esc(c.serial)}</b></div>
    <div>Verificación<b>${esc(req.get('host'))}/academia/certificado/${esc(c.serial)}</b></div>
  </div>
</main>
</body></html>`);
};
