<?php
/**
 * Seeder idempotente de la sección "Recursos".
 *
 * Crea (o actualiza, sin duplicar):
 *   - Categoría "Recursos" (slug recursos)
 *   - 4 páginas con la plantilla page-recursos.php:
 *       /recursos/  ·  /recursos/descargables/  ·  /recursos/videos/  ·  /recursos/redes-sociales/
 *   - 3 posts de ejemplo KA1 / KA2 / KA3 en la categoría Recursos,
 *     con meta efs_ka (1|2|3) y efs_kicker.
 *
 * Uso:  php seed-recursos.php [ruta-wp-root]
 *   Por defecto usa el WP de Laragon: C:/laragon/www/eufundingschool
 *
 * Reejecutar es seguro: hace upsert por slug.
 */

$wp_root = isset( $argv[1] ) ? rtrim( $argv[1], '\\/' ) : 'C:/laragon/www/eufundingschool';
$loader  = $wp_root . '/wp-load.php';
if ( ! file_exists( $loader ) ) {
	fwrite( STDERR, "ERROR: no encuentro wp-load.php en $loader\n" );
	exit( 1 );
}
define( 'WP_USE_THEMES', false );
require $loader;

echo "WP cargado: " . get_bloginfo( 'name' ) . " — " . home_url() . "\n";

/* 1) Categoría Recursos --------------------------------------------------- */
$cat = get_category_by_slug( 'recursos' );
if ( ! $cat ) {
	$res    = wp_insert_term( 'Recursos', 'category', array( 'slug' => 'recursos' ) );
	$cat_id = is_wp_error( $res ) ? 0 : (int) $res['term_id'];
	echo "  + categoría 'recursos' creada (id $cat_id)\n";
} else {
	$cat_id = (int) $cat->term_id;
	echo "  = categoría 'recursos' ya existía (id $cat_id)\n";
}
if ( ! $cat_id ) { fwrite( STDERR, "ERROR: sin categoría, abortando\n" ); exit( 1 ); }

// Autor de los posts (en CLI no hay usuario actual): primer administrador.
$admins  = get_users( array( 'role' => 'administrator', 'number' => 1, 'fields' => array( 'ID' ) ) );
$author  = $admins ? (int) $admins[0]->ID : 1;
echo "  autor de los posts: id $author\n";

/* helpers ----------------------------------------------------------------- */
function efs_upsert_page( $title, $path, $slug, $parent_id, $template, $content = '' ) {
	$page = get_page_by_path( $path, OBJECT, 'page' );
	$data = array(
		'post_title'   => $title,
		'post_name'    => $slug,
		'post_status'  => 'publish',
		'post_type'    => 'page',
		'post_parent'  => $parent_id,
		'post_content' => $content,
	);
	if ( $page ) {
		$data['ID'] = $page->ID;
		$id = wp_update_post( $data );
		$verb = 'actualizada';
	} else {
		$id = wp_insert_post( $data );
		$verb = 'creada';
	}
	update_post_meta( $id, '_wp_page_template', $template );
	echo "  · página '$title' $verb (id $id, /$path/)\n";
	return $id;
}

function efs_upsert_post( $title, $slug, $content, $excerpt, $cat_id, $date, $ka, $kicker ) {
	global $author;
	$post = get_page_by_path( $slug, OBJECT, 'post' );
	$data = array(
		'post_title'    => $title,
		'post_name'     => $slug,
		'post_content'  => $content,
		'post_excerpt'  => $excerpt,
		'post_status'   => 'publish',
		'post_type'     => 'post',
		'post_date'     => $date,
		'post_author'   => $author,
		'post_category' => array( $cat_id ),
	);
	if ( $post ) {
		$data['ID'] = $post->ID;
		$id = wp_update_post( $data );
		$verb = 'actualizado';
	} else {
		$id = wp_insert_post( $data );
		$verb = 'creado';
	}
	update_post_meta( $id, 'efs_ka', $ka );
	update_post_meta( $id, 'efs_kicker', $kicker );
	echo "  · post '$title' $verb (id $id, KA$ka)\n";
	return $id;
}

/* 2) Páginas (carcasa + pestañas) ---------------------------------------- */
$tpl = 'page-recursos.php';
$intro = 'Artículos, guías, descargables y vídeos sobre Erasmus+ y financiación europea, para ayudarte a diseñar y gestionar mejor tus proyectos.';
$rid = efs_upsert_page( 'Recursos', 'recursos', 'recursos', 0, $tpl, $intro );
efs_upsert_page( 'Descargables',   'recursos/descargables',   'descargables',   $rid, $tpl );
efs_upsert_page( 'Vídeos',         'recursos/videos',         'videos',         $rid, $tpl );
efs_upsert_page( 'Redes sociales', 'recursos/redes-sociales', 'redes-sociales', $rid, $tpl );

/* 3) Posts de ejemplo KA1 / KA2 / KA3 ------------------------------------ */
$ka1 = <<<'HTML'
<p>La <strong>Acción Clave 1 (KA1)</strong> es la puerta de entrada a Erasmus+ para la mayoría de las organizaciones. Financia <strong>movilidades de aprendizaje</strong>: estancias en otro país para estudiar, formarse, enseñar o adquirir experiencia. Es la acción más accesible y la que más impacto directo tiene sobre las personas participantes.</p>
<h2>¿Qué financia exactamente?</h2>
<p>KA1 cubre los costes de organizar y realizar movilidades: viaje, manutención, apoyo organizativo y, cuando corresponde, apoyo lingüístico y a la inclusión. Según el sector, se traduce en:</p>
<ul>
<li><strong>Educación superior:</strong> estancias de estudiantes y de personal docente y administrativo.</li>
<li><strong>Formación profesional (FP):</strong> prácticas de aprendices y movilidad de formadores.</li>
<li><strong>Educación escolar y de personas adultas:</strong> formación y job-shadowing del profesorado.</li>
<li><strong>Juventud:</strong> intercambios juveniles y movilidad de trabajadores en el ámbito de la juventud.</li>
</ul>
<h2>¿Quién puede participar?</h2>
<p>Centros educativos, entidades de FP, ONGs, ayuntamientos y organizaciones juveniles. Muchas acceden a través de la <strong>acreditación Erasmus+</strong>, que da acceso simplificado y recurrente a financiación de movilidad sin competir en cada convocatoria.</p>
<h2>Por dónde empezar</h2>
<p>Define el perfil de tus participantes y los objetivos de aprendizaje, identifica organizaciones de acogida en otros países y valora si te conviene solicitar la acreditación. Un buen proyecto KA1 parte de una necesidad real de tu organización y de las personas a las que sirve.</p>
<p><em>¿Quieres llevarlo a la práctica? En nuestra <a href="https://campus.eufundingschool.com">Academia</a> tienes el curso dedicado a KA1.</em></p>
HTML;

$ka2 = <<<'HTML'
<p>La <strong>Acción Clave 2 (KA2)</strong> financia la <strong>cooperación entre organizaciones</strong> de distintos países para desarrollar, compartir y transferir prácticas innovadoras. Si KA1 mueve personas, KA2 mueve <em>ideas y proyectos</em>: es donde se construyen consorcios europeos y se generan resultados que perduran.</p>
<h2>Dos puertas de entrada</h2>
<ul>
<li><strong>Asociaciones de cooperación:</strong> proyectos más grandes y ambiciosos, pensados para organizaciones con experiencia que quieren innovar y escalar resultados.</li>
<li><strong>Asociaciones de pequeña escala:</strong> presupuesto y requisitos reducidos, diseñadas para entidades pequeñas o nuevas en el programa. La mejor forma de empezar.</li>
</ul>
<h2>Las claves de un buen proyecto KA2</h2>
<p>Un proyecto KA2 sólido nace de una <strong>necesidad compartida</strong> por todo el consorcio y propone una respuesta concreta. Los evaluadores valoran especialmente:</p>
<ul>
<li>Una <strong>asociación equilibrada</strong>, donde cada socio aporta y se beneficia.</li>
<li>Resultados <strong>transferibles</strong> más allá del propio proyecto.</li>
<li>Un plan realista de <strong>gestión, calidad y difusión</strong>.</li>
</ul>
<h2>El reto: el consorcio</h2>
<p>Encontrar los socios adecuados es lo que más cuesta. Busca organizaciones que compartan tu objetivo y aporten capacidades complementarias, no solo "rellenar" países. Un consorcio bien elegido es la mitad de un proyecto aprobado.</p>
<p><em>En <a href="https://intake.eufundingschool.com/">Proyectos</a> puedes encontrar socios y diseñar tu propuesta KA2 paso a paso.</em></p>
HTML;

$ka3 = <<<'HTML'
<p>La <strong>Acción Clave 3 (KA3)</strong> es la menos conocida, pero la más estratégica: financia el <strong>apoyo al desarrollo de las políticas y a la cooperación</strong>. Su objetivo es conectar lo que ocurre sobre el terreno con la <strong>agenda política europea</strong>, para que las buenas prácticas influyan en cómo se diseñan las políticas de educación, formación y juventud.</p>
<h2>¿Qué tipo de iniciativas apoya?</h2>
<ul>
<li>Proyectos que prueban <strong>enfoques innovadores de política</strong> a pequeña escala antes de aplicarlos de forma amplia.</li>
<li><strong>Diálogo con la juventud</strong> y participación de los jóvenes en las decisiones que les afectan.</li>
<li>Acciones de <strong>sensibilización, redes y cooperación</strong> en torno a prioridades europeas.</li>
</ul>
<h2>¿A quién se dirige?</h2>
<p>Sobre todo a <strong>administraciones públicas, redes europeas y organizaciones con experiencia</strong> y capacidad de incidencia. Buena parte de KA3 se gestiona mediante convocatorias específicas a nivel europeo, más que por las agencias nacionales.</p>
<h2>¿Por qué te interesa aunque no la solicites?</h2>
<p>Entender KA3 te ayuda a <strong>alinear tus proyectos KA1 y KA2 con las prioridades políticas</strong> de la UE. Mostrar que tu proyecto contribuye a esas prioridades es uno de los factores que más suma en la evaluación.</p>
<p><em>Profundiza en la estrategia del programa en nuestra <a href="https://campus.eufundingschool.com">Academia</a>.</em></p>
HTML;

efs_upsert_post(
	'Erasmus+ KA1: movilidades para aprender, enseñar y formarte en Europa',
	'erasmus-ka1-movilidades', $ka1,
	'Qué financia la Acción Clave 1, quién puede participar y cómo aprovechar las movilidades de estudiantes, personal y jóvenes.',
	$cat_id, '2026-06-18 09:00:00', '1', 'Erasmus+ · Movilidad'
);
efs_upsert_post(
	'Erasmus+ KA2: cooperación entre organizaciones para proyectos de impacto',
	'erasmus-ka2-cooperacion', $ka2,
	'Asociaciones de cooperación y de pequeña escala: cómo construir un consorcio europeo y diseñar un proyecto con impacto real.',
	$cat_id, '2026-06-18 10:00:00', '2', 'Erasmus+ · Cooperación'
);
efs_upsert_post(
	'Erasmus+ KA3: apoyo a la reforma de las políticas europeas',
	'erasmus-ka3-politicas', $ka3,
	'La Acción Clave 3 conecta la práctica con la política. Descubre qué iniciativas financia y a quién se dirige.',
	$cat_id, '2026-06-18 11:00:00', '3', 'Erasmus+ · Políticas'
);

flush_rewrite_rules( false );
echo "Rewrite rules flushed.\n";
echo "Hecho. Si alguna URL /recursos/... diera 404, ve a Ajustes → Enlaces permanentes → Guardar.\n";
