/* Antes de pintar: modo captura (?shot=1) para el banco de pruebas, y
   anclas de la app (#login, #register) que ya no existen para invitados. */
(function () {
  var d = document.documentElement;
  d.classList.add('js');
  if (/[?&]shot=1/.test(location.search)) d.classList.add('modo-captura');
  var h = location.hash.slice(1);
  var q = location.search.replace(/^\?/, '');
  if (h === 'login' || h === 'entrar') location.replace('/entrar' + (q ? '?' + q : ''));
  else if (h === 'register' || h === 'registro' || h === 'crear-cuenta') location.replace('/crear-cuenta' + (q ? '?' + q : ''));
})();
