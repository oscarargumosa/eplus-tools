<?php
// ─────────────────────────────────────────────────────────────────
//  scripts/moodle/import-course.php
//
//  Importa un curso completo en Moodle a partir de un JSON de
//  lecciones (formato _MOODLE_VPS.json: secciones → cursos →
//  capítulos → lecciones, con vídeos ya alojados en Bunny Stream).
//
//  Crea:
//    · 1 curso (formato "topics")
//    · 1 tema por cada `collection` del JSON
//    · 1 Etiqueta (mod_label) por cada cambio de `capitulo`
//    · 1 Página (mod_page) por lección, con el iframe de Bunny
//      arriba y el texto de la lección debajo (TipTap JSON → HTML)
//
//  Es IDEMPOTENTE: guarda un fichero de estado con el id de Moodle
//  de cada elemento creado. Relanzarlo no duplica nada y retoma lo
//  que faltara. No borra nada.
//
//  Uso (dentro del servidor/contenedor del Moodle):
//    php scripts/moodle/import-course.php \
//        --json=data/moodle/marketing-ventas.json \
//        --moodle=/var/www/html \
//        --category=<id de la galería de cursos>
//
//  Antes de la pasada real, comprobar sin tocar Moodle:
//    php scripts/moodle/import-course.php --json=... --dry-run
//
//  Y descubrir la categoría destino:
//    php scripts/moodle/import-course.php --moodle=... --list-categories
// ─────────────────────────────────────────────────────────────────

define('CLI_SCRIPT', true);

// ── Opciones ────────────────────────────────────────────────────
$opts = getopt('', [
    'json:', 'moodle:', 'category:', 'shortname:', 'fullname:', 'state:',
    'limit:', 'keep-prefix', 'dry-run', 'check', 'list-categories', 'help',
]);

if (isset($opts['help'])) {
    fwrite(STDOUT, <<<TXT
Uso: php import-course.php [opciones]

  --json=RUTA         JSON de lecciones (obligatorio salvo --list-categories)
  --moodle=RUTA       Raíz del Moodle (donde está config.php). Obligatorio
                      salvo en --dry-run. Admite también la ruta al propio
                      config.php.
  --category=ID       Id de la categoría destino (la galería de cursos).
                      Por defecto 1 (Miscellaneous / Category 1).
  --shortname=TEXTO   Nombre corto del curso. Por defecto MKTVENTAS.
  --fullname=TEXTO    Nombre completo. Por defecto, curso_moodle del JSON.
  --state=RUTA        Fichero de estado. Por defecto <json>.state.json
  --limit=N           Procesa solo las N primeras lecciones (pruebas).
  --keep-prefix       Conserva el prefijo "SS.CC " en el título del tema.
                      Por defecto se quita (el orden se conserva igual).
  --dry-run           No toca Moodle: valida el JSON, convierte los textos
                      e imprime el plan y el HTML de muestra.
  --check             Solo cuenta lo que hay en Moodle y lo contrasta con
                      el JSON. No crea nada.
  --list-categories   Lista las categorías del Moodle y sale.
  --help              Esta ayuda.

TXT);
    exit(0);
}

$dryrun       = isset($opts['dry-run']);
$checkonly    = isset($opts['check']);
$listcats     = isset($opts['list-categories']);
$keepprefix   = isset($opts['keep-prefix']);
$categoryid   = isset($opts['category']) ? (int)$opts['category'] : 1;
$shortname    = $opts['shortname'] ?? 'MKTVENTAS';
$limit        = isset($opts['limit']) ? (int)$opts['limit'] : 0;
$jsonpath     = $opts['json']   ?? null;
$moodlepath   = $opts['moodle'] ?? null;

function fail(string $msg): void {
    fwrite(STDERR, "ERROR: $msg\n");
    exit(1);
}
function out(string $msg): void {
    fwrite(STDOUT, $msg . "\n");
}

// ── Carga del Moodle (salvo dry-run) ────────────────────────────
if (!$dryrun) {
    if (!$moodlepath) {
        fail('falta --moodle=/ruta/al/moodle (o usa --dry-run).');
    }
    $configfile = is_dir($moodlepath)
        ? rtrim($moodlepath, '/') . '/config.php'
        : $moodlepath;
    if (!is_readable($configfile)) {
        fail("no encuentro el config.php de Moodle en: $configfile");
    }
    require_once($configfile);
    require_once($CFG->dirroot . '/course/lib.php');
    require_once($CFG->dirroot . '/course/modlib.php');
    require_once($CFG->libdir . '/resourcelib.php');
    require_once($CFG->libdir . '/modinfolib.php');
    \core\session\manager::set_user(get_admin());
}

// ── --list-categories ───────────────────────────────────────────
if ($listcats) {
    if ($dryrun) {
        fail('--list-categories necesita acceso al Moodle (quita --dry-run).');
    }
    global $DB;
    $cats = $DB->get_records('course_categories', null, 'sortorder ASC',
        'id, name, parent, coursecount');
    out(str_pad('ID', 6) . str_pad('PADRE', 7) . str_pad('CURSOS', 8) . 'NOMBRE');
    foreach ($cats as $c) {
        out(str_pad((string)$c->id, 6) . str_pad((string)$c->parent, 7)
            . str_pad((string)$c->coursecount, 8) . $c->name);
    }
    exit(0);
}

// ── Carga y validación del JSON ─────────────────────────────────
if (!$jsonpath) {
    fail('falta --json=/ruta/al/fichero.json');
}
if (!is_readable($jsonpath)) {
    fail("no puedo leer el JSON: $jsonpath");
}
$data = json_decode(file_get_contents($jsonpath), true);
if (!is_array($data) || empty($data['lecciones'])) {
    fail('el JSON no tiene la forma esperada (falta "lecciones").');
}

$embedbase = rtrim($data['embed_base'] ?? '', '/') . '/';
$fullname  = $opts['fullname'] ?? ($data['curso_moodle'] ?? 'Curso importado');
$statepath = $opts['state'] ?? ($jsonpath . '.state.json');

$lecciones = $data['lecciones'];

// El orden correcto es (seccion_n, curso_n, capitulo_n, leccion_n).
// No nos fiamos del orden del array: ordenamos explícitamente.
usort($lecciones, function ($a, $b) {
    return [$a['seccion_n'], $a['curso_n'], $a['capitulo_n'], $a['leccion_n']]
       <=> [$b['seccion_n'], $b['curso_n'], $b['capitulo_n'], $b['leccion_n']];
});
if ($limit > 0) {
    $lecciones = array_slice($lecciones, 0, $limit);
}

// Claves de identidad usadas en el fichero de estado.
function temakey(array $l): string   { return $l['seccion_n'] . '.' . $l['curso_n']; }
function capkey(array $l): string    { return temakey($l) . '.' . $l['capitulo_n']; }
function leckey(array $l): string    { return capkey($l) . '.' . $l['leccion_n']; }

// Temas = collections, en orden de aparición tras ordenar.
$temas = [];  // temakey => ['collection'=>, 'seccion'=>, 'n_lecciones'=>]
foreach ($lecciones as $l) {
    $k = temakey($l);
    if (!isset($temas[$k])) {
        $temas[$k] = [
            'collection'  => $l['collection'],
            'seccion'     => $l['seccion'],
            'n_lecciones' => 0,
        ];
    }
    $temas[$k]['n_lecciones']++;
}

// ── TipTap (ProseMirror) JSON → HTML ────────────────────────────
// El campo `texto` del JSON no viene en Markdown como decía el
// encargo: son documentos TipTap serializados. Se convierten aquí.
function tiptap_to_html($node): string {
    if (is_string($node)) { return htmlspecialchars($node, ENT_QUOTES, 'UTF-8'); }
    if (!is_array($node)) { return ''; }
    if (!isset($node['type']) && isset($node[0])) {  // lista de nodos
        $html = '';
        foreach ($node as $child) { $html .= tiptap_to_html($child); }
        return $html;
    }

    $children = '';
    foreach (($node['content'] ?? []) as $child) {
        $children .= tiptap_to_html($child);
    }
    $attrs = $node['attrs'] ?? [];

    switch ($node['type'] ?? '') {
        case 'doc':
            return $children;

        case 'text':
            $text = htmlspecialchars($node['text'] ?? '', ENT_QUOTES, 'UTF-8');
            foreach (array_reverse($node['marks'] ?? []) as $mark) {
                switch ($mark['type'] ?? '') {
                    case 'bold':      $text = '<strong>' . $text . '</strong>'; break;
                    case 'italic':    $text = '<em>' . $text . '</em>'; break;
                    case 'underline': $text = '<u>' . $text . '</u>'; break;
                    case 'strike':    $text = '<s>' . $text . '</s>'; break;
                    case 'code':      $text = '<code>' . $text . '</code>'; break;
                    case 'link':
                        $href = htmlspecialchars($mark['attrs']['href'] ?? '', ENT_QUOTES, 'UTF-8');
                        $text = '<a href="' . $href . '" target="_blank" rel="noopener noreferrer">'
                              . $text . '</a>';
                        break;
                }
            }
            return $text;

        case 'paragraph':
            return trim($children) === '' ? '' : '<p>' . $children . '</p>';

        case 'heading':
            $level = max(2, min(6, (int)($attrs['level'] ?? 3)));  // h1 lo pone Moodle
            return "<h$level>" . $children . "</h$level>";

        case 'hardBreak':      return '<br>';
        case 'horizontalRule': return '<hr>';
        case 'bulletList':     return '<ul>' . $children . '</ul>';
        case 'orderedList':    return '<ol>' . $children . '</ol>';
        case 'listItem':       return '<li>' . $children . '</li>';
        case 'blockquote':     return '<blockquote>' . $children . '</blockquote>';
        case 'codeBlock':      return '<pre><code>' . $children . '</code></pre>';

        case 'image':
            $src = htmlspecialchars($attrs['src'] ?? '', ENT_QUOTES, 'UTF-8');
            $alt = htmlspecialchars($attrs['alt'] ?? '', ENT_QUOTES, 'UTF-8');
            return $src === '' ? '' :
                '<p><img src="' . $src . '" alt="' . $alt . '" style="max-width:100%;height:auto"></p>';

        default:
            return $children;  // nodo desconocido: no perdemos el contenido
    }
}

function texto_a_html(string $texto): string {
    $texto = trim($texto);
    if ($texto === '') { return ''; }
    if ($texto[0] === '{' || $texto[0] === '[') {
        $doc = json_decode($texto, true);
        if (is_array($doc)) { return tiptap_to_html($doc); }
    }
    // Si algún día llega HTML o texto plano, no lo rompemos.
    if (preg_match('/<\w+[^>]*>/', $texto)) { return $texto; }
    return '<p>' . nl2br(htmlspecialchars($texto, ENT_QUOTES, 'UTF-8')) . '</p>';
}

function iframe_bunny(string $embedbase, string $videoid): string {
    $src = htmlspecialchars($embedbase . $videoid . '?autoplay=false', ENT_QUOTES, 'UTF-8');
    return '<div style="max-width:900px">'
         . '<iframe src="' . $src . '" loading="lazy" '
         . 'style="border:0;width:100%;aspect-ratio:16/9" '
         . 'allow="encrypted-media;picture-in-picture" allowfullscreen></iframe>'
         . '</div>';
}

function contenido_leccion(array $l, string $embedbase): string {
    $partes = [];
    if (!empty($l['tiene_video']) && !empty($l['video_id'])) {
        $partes[] = iframe_bunny($embedbase, $l['video_id']);
    }
    $html = texto_a_html((string)($l['texto'] ?? ''));
    if ($html !== '') { $partes[] = $html; }
    return implode("\n", $partes);
}

function nombre_tema(string $collection, bool $keepprefix): string {
    if ($keepprefix) { return $collection; }
    return preg_replace('/^\d{2}\.\d{2}\s+/', '', $collection);
}

// ── Resumen de lo que se va a hacer ─────────────────────────────
$n_lecciones = count($lecciones);
$n_temas     = count($temas);
$n_capitulos = count(array_unique(array_map('capkey', $lecciones)));
$n_videos    = count(array_filter($lecciones, fn($l) => !empty($l['tiene_video'])));
$n_textos    = count(array_filter($lecciones, fn($l) => trim((string)($l['texto'] ?? '')) !== ''));

out("Curso        : $fullname ($shortname)");
out("JSON         : $jsonpath");
out("Temas        : $n_temas");
out("Capítulos    : $n_capitulos  (→ etiquetas)");
out("Lecciones    : $n_lecciones  (→ páginas)  ·  con vídeo: $n_videos  ·  con texto: $n_textos");
out('');

// ── --dry-run: ni tocamos Moodle ────────────────────────────────
if ($dryrun) {
    foreach ($temas as $k => $t) {
        out(sprintf('  Tema %-6s %-52s [%s] %d lecciones',
            $k, nombre_tema($t['collection'], $keepprefix), $t['seccion'], $t['n_lecciones']));
    }
    out('');
    $muestra = null;
    foreach ($lecciones as $l) {
        if (!empty($l['tiene_video']) && trim((string)$l['texto']) !== '') { $muestra = $l; break; }
    }
    $muestra = $muestra ?? $lecciones[0];
    out('── Muestra de página: ' . $muestra['leccion'] . ' ──');
    out(contenido_leccion($muestra, $embedbase));
    out('');
    out('DRY RUN: no se ha tocado Moodle.');
    exit(0);
}

global $DB, $CFG;

// ── Estado (idempotencia) ───────────────────────────────────────
$state = ['course_id' => null, 'sections' => [], 'modules' => []];
if (is_readable($statepath)) {
    $loaded = json_decode(file_get_contents($statepath), true);
    if (is_array($loaded)) { $state = $loaded + $state; }
}
function guardar_estado(string $path, array $state): void {
    file_put_contents($path, json_encode($state, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
}

// ── El curso ────────────────────────────────────────────────────
$course = null;
if (!empty($state['course_id'])) {
    $course = $DB->get_record('course', ['id' => $state['course_id']]);
}
if (!$course) {
    $course = $DB->get_record('course', ['shortname' => $shortname]);
    if ($course) {
        out("Curso existente reutilizado por shortname: id={$course->id}");
    }
}

if (!$course) {
    if ($checkonly) { fail("no existe ningún curso con shortname=$shortname."); }
    $nuevo = (object)[
        'category'       => $categoryid,
        'fullname'       => $fullname,
        'shortname'      => $shortname,
        'summary'        => '',
        'summaryformat'  => FORMAT_HTML,
        'format'         => 'topics',
        'numsections'    => $n_temas,
        'visible'        => 1,
        'startdate'      => time(),
        'showgrades'     => 1,
        'newsitems'      => 0,
        'lang'           => 'es',
    ];
    $course = create_course($nuevo);
    $state['course_id'] = $course->id;
    guardar_estado($statepath, $state);
    out("Curso creado: id={$course->id}");
} else {
    $state['course_id'] = $course->id;
}
$courseurl = $CFG->wwwroot . '/course/view.php?id=' . $course->id;

// ── --check: contar y contrastar, sin crear nada ────────────────
if ($checkonly) {
    $temas_moodle = $DB->count_records_select('course_sections',
        'course = :c AND section > 0', ['c' => $course->id]);
    $sql = 'SELECT COUNT(cm.id) FROM {course_modules} cm
              JOIN {modules} m ON m.id = cm.module
             WHERE cm.course = :c AND m.name = :n AND cm.deletioninprogress = 0';
    $pag = $DB->count_records_sql($sql, ['c' => $course->id, 'n' => 'page']);
    $lab = $DB->count_records_sql($sql, ['c' => $course->id, 'n' => 'label']);

    out("Curso: $courseurl");
    foreach ([['Temas', $temas_moodle, $n_temas],
              ['Páginas', $pag, $n_lecciones],
              ['Etiquetas', $lab, $n_capitulos]] as [$et, $real, $esperado]) {
        $dif = $real - $esperado;
        $marca = $dif === 0 ? 'OK' : sprintf('DIFERENCIA %+d', $dif);
        out(sprintf('  %-10s Moodle: %-5d JSON: %-5d  %s', $et, $real, $esperado, $marca));
    }
    exit(0);
}

// ── Módulos disponibles ─────────────────────────────────────────
$moduleids = [];
foreach (['page', 'label'] as $modname) {
    $m = $DB->get_record('modules', ['name' => $modname]);
    if (!$m) { fail("el módulo '$modname' no está instalado en este Moodle."); }
    $moduleids[$modname] = $m->id;
}

/**
 * Crea una actividad (page/label) en una sección y devuelve el cmid.
 */
function crear_modulo(object $course, int $sectionnum, string $modname,
                      int $moduleid, string $name, string $html): int {
    $mi = (object)[
        'modulename'          => $modname,
        'module'              => $moduleid,
        'course'              => $course->id,
        'section'             => $sectionnum,
        'visible'             => 1,
        'visibleoncoursepage' => 1,
        'cmidnumber'          => '',
        'groupmode'           => 0,
        'groupingid'          => 0,
        'availability'        => null,
        'completion'          => 0,
        'completionview'      => 0,
        'completionexpected'  => 0,
        'completiongradeitemnumber' => null,
        'name'                => $name,
        'intro'               => '',
        'introformat'         => FORMAT_HTML,
    ];

    if ($modname === 'label') {
        $mi->intro      = $html;
        $mi->introeditor = ['text' => $html, 'format' => FORMAT_HTML, 'itemid' => 0];
    } else {  // page
        $mi->intro         = '';
        $mi->introeditor   = ['text' => '', 'format' => FORMAT_HTML, 'itemid' => 0];
        $mi->content       = $html;
        $mi->contentformat = FORMAT_HTML;
        $mi->page          = ['text' => $html, 'format' => FORMAT_HTML, 'itemid' => 0];
        $mi->display            = RESOURCELIB_DISPLAY_OPEN;
        $mi->printheading       = 1;
        $mi->printintro         = 0;
        $mi->printlastmodified  = 1;
        $mi->popupwidth         = 620;
        $mi->popupheight        = 450;
    }

    $creado = add_moduleinfo($mi, $course);
    return (int)$creado->coursemodule;
}

/** ¿Sigue existiendo ese cmid? (por si alguien lo borró a mano) */
function cm_existe($DB, $cmid): bool {
    return $cmid && $DB->record_exists_select('course_modules',
        'id = :id AND deletioninprogress = 0', ['id' => $cmid]);
}

// ── Temas ───────────────────────────────────────────────────────
$sectionnum = 0;
$temas_creados = 0;
foreach ($temas as $k => $t) {
    $sectionnum++;
    $state['sections'][$k] = $sectionnum;
    $sectionrec = $DB->get_record('course_sections',
        ['course' => $course->id, 'section' => $sectionnum]);
    if (!$sectionrec) {
        $sectionrec = course_create_section($course->id, $sectionnum);
    }
    $nombre = nombre_tema($t['collection'], $keepprefix);
    if ($sectionrec->name !== $nombre) {
        course_update_section($course, $sectionrec, (object)[
            'name'          => $nombre,
            'summary'       => $t['seccion'],
            'summaryformat' => FORMAT_HTML,
        ]);
        $temas_creados++;
    }
}
guardar_estado($statepath, $state);
out("Temas preparados: $sectionnum (renombrados en esta pasada: $temas_creados)");

// ── Etiquetas (capítulos) y páginas (lecciones) ─────────────────
$paginas_nuevas = 0;
$etiquetas_nuevas = 0;
$saltadas = 0;
$fallos = [];
$capitulo_actual = null;

foreach ($lecciones as $i => $l) {
    $tk = temakey($l);
    $ck = capkey($l);
    $lk = leckey($l);
    $sec = $state['sections'][$tk];

    // Etiqueta de capítulo, al cambiar de capítulo.
    if ($ck !== $capitulo_actual) {
        $capitulo_actual = $ck;
        $key = 'cap:' . $ck;
        if (!cm_existe($DB, $state['modules'][$key] ?? null)) {
            try {
                $html = '<h3>' . htmlspecialchars($l['capitulo'], ENT_QUOTES, 'UTF-8') . '</h3>';
                $cmid = crear_modulo($course, $sec, 'label', $moduleids['label'],
                                     $l['capitulo'], $html);
                $state['modules'][$key] = $cmid;
                $etiquetas_nuevas++;
                guardar_estado($statepath, $state);
            } catch (Throwable $e) {
                $fallos[] = "Etiqueta $ck ({$l['capitulo']}): " . $e->getMessage();
            }
        }
    }

    // Página de la lección.
    $key = 'lec:' . $lk;
    if (cm_existe($DB, $state['modules'][$key] ?? null)) {
        $saltadas++;
        continue;
    }
    try {
        $html = contenido_leccion($l, $embedbase);
        $cmid = crear_modulo($course, $sec, 'page', $moduleids['page'],
                             $l['leccion'], $html);
        $state['modules'][$key] = $cmid;
        $paginas_nuevas++;
        guardar_estado($statepath, $state);
    } catch (Throwable $e) {
        // Una lección que falla no aborta las 279: se registra y seguimos.
        $fallos[] = "Lección $lk ({$l['leccion']}): " . $e->getMessage();
    }

    if (($i + 1) % 25 === 0) {
        out('  ... ' . ($i + 1) . "/$n_lecciones lecciones procesadas");
    }
}

guardar_estado($statepath, $state);
rebuild_course_cache($course->id, true);

// ── Informe final, con los números reales de Moodle ─────────────
$temas_moodle = $DB->count_records_select('course_sections',
    'course = :c AND section > 0', ['c' => $course->id]);
$sql = 'SELECT COUNT(cm.id) FROM {course_modules} cm
          JOIN {modules} m ON m.id = cm.module
         WHERE cm.course = :c AND m.name = :n AND cm.deletioninprogress = 0';
$pag = $DB->count_records_sql($sql, ['c' => $course->id, 'n' => 'page']);
$lab = $DB->count_records_sql($sql, ['c' => $course->id, 'n' => 'label']);

out('');
out('── Resultado ───────────────────────────────────────────────');
out("Curso      : id={$course->id}  $courseurl");
out("Estado     : $statepath");
out("Creado ahora: $paginas_nuevas páginas, $etiquetas_nuevas etiquetas. Saltadas por existir: $saltadas");
out('');
out('Contado en Moodle (no lo esperado, lo real):');
foreach ([['Temas', $temas_moodle, $n_temas],
          ['Páginas', $pag, $n_lecciones],
          ['Etiquetas', $lab, $n_capitulos]] as [$et, $real, $esperado]) {
    $dif = $real - $esperado;
    out(sprintf('  %-10s Moodle: %-5d JSON: %-5d  %s',
        $et, $real, $esperado, $dif === 0 ? 'OK' : sprintf('DIFERENCIA %+d', $dif)));
}

if ($fallos) {
    out('');
    out('Fallos (' . count($fallos) . '):');
    foreach ($fallos as $f) { out('  · ' . $f); }
    exit(2);
}
out('');
out('Sin fallos.');
exit(0);
