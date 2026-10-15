/* Página pública del certificado: /academia/certificado/:serial
   Sirve para verificarlo (quien tenga el enlace ve que es auténtico) y para
   imprimirlo o guardarlo en PDF desde el navegador. Manual de marca de
   EU Funding Studio (oct-2026): logo oficial, azul #3C45A3, lima #D6E949,
   crema #F0EDEB y Poppins. Se imprime en una sola hoja A4 apaisada.        */

const { certificate } = require('./model');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

module.exports = async function certificatePage(req, res) {
  let c = null;
  try { c = await certificate(req.params.serial); } catch (e) { console.error('[academia] certificado', e); }
  res.set('X-Robots-Tag', 'noindex');
  if (!c) {
    return res.status(404).send(`<!doctype html><meta charset="utf-8"><title>Certificado no encontrado</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
<body style="margin:0;font-family:Poppins,system-ui,sans-serif;padding:48px;color:#222351;background:#f8f7f5"><img src="/img/marca/logo-horizontal-azul.svg" alt="EU Funding Studio" style="display:block;height:24px;margin-bottom:28px">No existe ningún certificado con el número <b>${esc(req.params.serial)}</b>.</body>`);
  }
  const fecha = new Date(c.issued_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  res.send(`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Certificado · ${esc(c.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400;1,500&display=swap" rel="stylesheet">
<style>
  :root{--blue:#3c45a3;--lime:#d6e949;--ink:#222351;--cream:#f0edeb;--soft:#e7e1f3;--muted:#55577a}
  *{box-sizing:border-box}
  /* Que fondos y marcador lima salgan al imprimir aunque el navegador no imprima fondos */
  html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{margin:0;background:var(--cream);font-family:Poppins,system-ui,sans-serif;color:var(--ink)}
  .bar{max-width:1000px;margin:24px auto 0;display:flex;justify-content:flex-end;gap:10px;padding:0 16px}
  .bar button{background:var(--blue);color:#fff;border:0;border-radius:999px;padding:11px 22px;font:600 14px Poppins,system-ui,sans-serif;cursor:pointer}
  .bar button:hover{background:#514daa}
  .cert{max-width:1000px;aspect-ratio:1.414/1;margin:16px auto 40px;background:#fff;position:relative;overflow:hidden;border-radius:20px;
        display:flex;flex-direction:column;justify-content:space-between;gap:24px;padding:6% 7% 5%;box-shadow:0 24px 48px rgba(60,69,163,.10)}
  .cert:before{content:"";position:absolute;inset:0 0 auto 0;height:14px;background:var(--blue)}
  /* Icono de marca (lápiz) como acento decorativo, en lavanda suave */
  .cert:after{content:"";position:absolute;right:-4%;bottom:-8%;width:38%;aspect-ratio:1;background:var(--soft);
        -webkit-mask:url(/img/marca/icono-azul.svg) center/contain no-repeat;mask:url(/img/marca/icono-azul.svg) center/contain no-repeat}
  .cert>*{position:relative;z-index:1}
  .top{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}
  .logo{display:block;height:30px;width:auto}
  .kicker{font-size:13px;letter-spacing:.22em;text-transform:uppercase;color:var(--muted);font-weight:600}
  h1{font-size:clamp(26px,4.2vw,46px);font-weight:600;color:var(--blue);margin:.15em 0 .15em;line-height:1.12;letter-spacing:-.01em;max-width:85%}
  .name{font-size:clamp(24px,3.6vw,40px);font-weight:600;margin:.25em 0;line-height:1.25;color:var(--ink)}
  .name span{background:linear-gradient(transparent 58%,var(--lime) 58%,var(--lime) 92%,transparent 92%);
        -webkit-box-decoration-break:clone;box-decoration-break:clone;padding:0 .12em;margin-left:-.12em}
  .lead{margin:18px 0 6px;font-size:16px;color:var(--muted);font-style:italic}
  .course{font-size:clamp(16px,2vw,22px);font-weight:300;color:var(--blue)}
  .meta{display:flex;gap:16px 40px;flex-wrap:wrap;font-size:13px;color:var(--muted);background:var(--cream);border-radius:16px;padding:16px 22px;max-width:78%}
  .meta b{display:block;color:var(--ink);font-size:15px;font-weight:600;word-break:break-all}
  @media (max-width:640px){
    .cert{aspect-ratio:auto;margin:12px;padding:40px 22px 28px;border-radius:16px}
    .cert:after{width:55%;bottom:-4%}
    h1{max-width:none}.meta{max-width:none}
  }
  @media print{
    body{background:#fff}.bar{display:none}
    .cert{margin:0;box-shadow:none;max-width:none;width:297mm;height:210mm;aspect-ratio:auto;border-radius:0;page-break-inside:avoid}
    h1{font-size:40px}.name{font-size:36px}.course{font-size:20px}
    @page{size:A4 landscape;margin:0}
  }
</style></head>
<body>
<div class="bar"><button onclick="window.print()">Imprimir o guardar en PDF</button></div>
<main class="cert">
  <div class="top"><img class="logo" src="/img/marca/logo-horizontal-azul.svg" alt="EU Funding Studio" width="280" height="30"><span class="kicker">Certificado de aprovechamiento</span></div>
  <div>
    <div class="kicker">Se certifica que</div>
    <div class="name"><span>${esc(c.full_name)}</span></div>
    <p class="lead">ha completado y superado el curso</p>
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
