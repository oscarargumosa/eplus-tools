/* Página pública del certificado (/academia/certificado/:serial):
   botón «Imprimir o guardar en PDF». En fichero aparte por la CSP. */
document.getElementById('imprimir')?.addEventListener('click', () => window.print());
