/* Script de lab.html: en fichero aparte (no en línea) por la CSP. */
function show(n){
  document.querySelectorAll('.vsection').forEach((el,i)=>{el.classList.toggle('active',i===n)});
  document.querySelectorAll('.vtab').forEach((el,i)=>{el.classList.toggle('active',i===n)});
}

/* Botones de la página: data-action="Lab.funcion" (js/acciones.js) */
Acciones.modulo('Lab', { show });
