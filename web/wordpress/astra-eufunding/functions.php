<?php
/**
 * EU Funding School — Astra Child
 *
 * Notas de diseño:
 * - El tema hereda de Astra. Solo añade/sobrescribe lo que marca diferencia.
 * - Plantillas custom: home.php (blog index), single.php, archive.php.
 * - CSS custom vive en style.css, cargado después del padre.
 * - Template partials reutilizables en /template-parts/ (cta-newsletter, cta-sandbox).
 */

if ( ! defined( 'ABSPATH' ) ) exit;

define( 'EFS_CHILD_VERSION', '0.3.0' );

/* -------------------------------------------------------------------------
 * Enqueue parent + child styles + Poppins
 * Poppins es la fuente compartida del ecosistema (WP + tool E+), alineada
 * con las Presentation Templates de EU Funding School.
 * Tokens completos en web/brand/tokens.css del monorepo.
 * ------------------------------------------------------------------------- */
add_action( 'wp_enqueue_scripts', function () {
	wp_enqueue_style(
		'efs-poppins',
		'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800;900&display=swap',
		array(),
		null
	);

	// Material Symbols — iconos de la carcasa Recursos (sidebar + tarjetas).
	wp_enqueue_style(
		'efs-material-symbols',
		'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200',
		array(),
		null
	);

	$parent_handle = 'astra-theme-css';
	wp_enqueue_style(
		'astra-eufunding',
		get_stylesheet_directory_uri() . '/style.css',
		array( $parent_handle, 'efs-poppins' ),
		EFS_CHILD_VERSION
	);
}, 20 );

/* -------------------------------------------------------------------------
 * Landing page template support — a page assigned to the
 * "Landing (sin menú)" template gets body class efs-landing-page
 * ------------------------------------------------------------------------- */
add_filter( 'theme_page_templates', function ( $templates ) {
	$templates['page-landing.php']  = 'Landing (sin menú)';
	$templates['page-recursos.php'] = 'Recursos (carcasa + sidebar)';
	return $templates;
} );

/* -------------------------------------------------------------------------
 * Recursos: ¿la vista actual pertenece a la sección Recursos?
 *   - una página con la plantilla page-recursos.php (Artículos / pestañas), o
 *   - un post en la categoría "recursos" (vista de artículo).
 * Usado para pintar la carcasa con sidebar (body class efs-recursos).
 * ------------------------------------------------------------------------- */
function efs_is_recursos() {
	if ( is_page() ) {
		return 'page-recursos.php' === get_post_meta( get_the_ID(), '_wp_page_template', true );
	}
	if ( is_singular( 'post' ) ) {
		return has_category( 'recursos' );
	}
	return false;
}

/* -------------------------------------------------------------------------
 * Presentación KA de un artículo de Recursos.
 * Lee el meta `efs_ka` (1|2|3) y devuelve clase de gradiente, etiqueta,
 * icono Material Symbols y "kicker" (meta `efs_kicker`). Compartido por la
 * tarjeta (page-recursos.php) y el detalle (single.php).
 * ------------------------------------------------------------------------- */
function efs_ka_meta( $post_id ) {
	$n     = (int) get_post_meta( $post_id, 'efs_ka', true ); // 1|2|3, 0 = sin nivel
	$icons = array( 1 => 'flight_takeoff', 2 => 'handshake', 3 => 'account_balance' );
	$kick  = get_post_meta( $post_id, 'efs_kicker', true );
	return array(
		'n'      => $n,
		'class'  => $n ? 'ka' . $n : '',
		'tag'    => $n ? 'KA' . $n : '',
		'icon'   => isset( $icons[ $n ] ) ? $icons[ $n ] : 'article',
		'kicker' => $kick ? $kick : 'Erasmus+',
	);
}

add_filter( 'template_include', function ( $template ) {
	if ( is_page() ) {
		$page_template = get_post_meta( get_the_ID(), '_wp_page_template', true );
		if ( 'page-landing.php' === $page_template ) {
			$candidate = locate_template( 'page-landing.php' );
			if ( $candidate ) return $candidate;
		}
	}
	return $template;
} );

add_filter( 'body_class', function ( $classes ) {
	// La home NUNCA recibe la clase efs-landing-page aunque use el template
	// "Landing (sin menú)": queremos top bar en eufundingschool.com porque el
	// tráfico actual es orgánico/recomendación (necesita acceso a Blog y Sandbox).
	// El template page-landing.php se reserva para landings de campañas pagadas
	// en URLs específicas tipo /lp/ka210-sports.
	if ( is_page() && ! is_front_page() ) {
		$tpl = get_post_meta( get_the_ID(), '_wp_page_template', true );
		if ( 'page-landing.php' === $tpl ) $classes[] = 'efs-landing-page';
	}
	if ( efs_is_recursos() ) $classes[] = 'efs-recursos';
	return $classes;
} );

/* -------------------------------------------------------------------------
 * Helper: render CTA partial
 * ------------------------------------------------------------------------- */
function efs_cta( $slug ) {
	get_template_part( 'template-parts/cta', $slug );
}

/* -------------------------------------------------------------------------
 * Shortcodes para usar los CTAs dentro de páginas/posts editados en wp-admin.
 *   [efs_newsletter]   → form del boletín (POST a /v1/subscribers)
 *   [efs_sandbox]      → caja CTA hacia el sandbox del tool
 * ------------------------------------------------------------------------- */
add_shortcode( 'efs_newsletter', function ( $atts ) {
	$atts = shortcode_atts( array( 'variant' => '' ), $atts, 'efs_newsletter' );
	// Pass variant to the partial via a global the partial can read.
	$GLOBALS['efs_newsletter_variant'] = $atts['variant']; // 'bare' = no outer card
	ob_start();
	get_template_part( 'template-parts/cta', 'newsletter' );
	unset( $GLOBALS['efs_newsletter_variant'] );
	return ob_get_clean();
} );

add_shortcode( 'efs_sandbox', function () {
	ob_start();
	get_template_part( 'template-parts/cta', 'sandbox' );
	return ob_get_clean();
} );

/* -------------------------------------------------------------------------
 * Tweaks to Astra defaults that the blog needs
 * ------------------------------------------------------------------------- */

// Show 9 posts per page on blog index (instead of default 10 but more grid-friendly)
add_action( 'pre_get_posts', function ( $q ) {
	if ( ! is_admin() && $q->is_main_query() && ( $q->is_home() || $q->is_archive() ) ) {
		$q->set( 'posts_per_page', 9 );
	}
} );

// Excerpt length and more string tuned for blog cards
add_filter( 'excerpt_length', function () { return 28; }, 999 );
add_filter( 'excerpt_more',   function () { return '…'; }, 999 );

// Disable wp_page_menu() fallback globally — we always want the assigned nav_menu,
// never an auto-generated list of every published page.
add_filter( 'wp_page_menu', '__return_empty_string', 999 );

/* -------------------------------------------------------------------------
 * TOP BAR común (web + tool).
 *
 * Render: franja delgada en la cabecera con logo + 3 items de menú +
 * CTA "Iniciar sesión" / "Mi cuenta · Nombre". Los items del centro los
 * controlas en wp-admin → Apariencia → Menús, asignándolos al location
 * "EFS Top Bar".
 *
 * El visual debe coincidir 1:1 con el del tool (public/index.html).
 * Si tocas algo en el HTML aquí, replícalo allá.
 * ------------------------------------------------------------------------- */

// Registrar location del menú principal del top bar.
add_action( 'after_setup_theme', function () {
	register_nav_menus( array(
		'efs_primary' => __( 'EFS Top Bar (header común)', 'astra-eufunding' ),
	) );
} );

/**
 * Menú canónico del top bar (mismo que el tool en public/index.html).
 * Se usa como fallback cuando el location "EFS Top Bar" no tiene menú
 * asignado en wp-admin, garantizando que WP y el tool comparten el mismo
 * menú en TODAS las páginas (incluida la sección Recursos y sus subpestañas).
 * Si Oscar asigna un menú en Apariencia → Menús, ese tiene prioridad.
 */
function efs_topbar_fallback_menu( $args = array() ) {
	$is_recursos = function_exists( 'efs_is_recursos' ) && efs_is_recursos();
	$items = array(
		array( 'Recursos',            home_url( '/recursos/' ),                            $is_recursos ),
		array( 'Academia',            'https://campus.eufundingschool.com',                false ),
		array( 'Misión',              home_url( '/academia/' ),                            is_page( 'academia' ) ),
		array( 'Proyectos',           'https://intake.eufundingschool.com/',               false ),
		array( 'Convocatorias',       'https://intake.eufundingschool.com/#convocatorias', false ),
		array( 'Movilidades',         'https://intake.eufundingschool.com/#movilidades',   false ),
	);
	$html = '<ul class="efs-topbar__menu">';
	foreach ( $items as $it ) {
		$html .= sprintf(
			'<li%s><a href="%s">%s</a></li>',
			$it[2] ? ' class="is-current"' : '',
			esc_url( $it[1] ),
			esc_html( $it[0] )
		);
	}
	$html .= '</ul>';
	if ( ! isset( $args['echo'] ) || $args['echo'] ) echo $html;
	return $html;
}

// Inyectar el top bar al abrir <body>. Se queda fixed arriba en TODAS las
// páginas excepto las que usen la plantilla "Landing (sin menú)" — pero la
// home siempre lleva top bar aunque use ese template (Fase 1 = tráfico orgánico
// que necesita descubrir Blog y Sandbox).
add_action( 'wp_body_open', function () {
	if ( is_page_template( 'page-landing.php' ) && ! is_front_page() ) return;
	?>
	<header class="efs-topbar" role="banner">
		<div class="efs-topbar__inner">
			<a class="efs-topbar__brand" href="<?php echo esc_url( home_url( '/' ) ); ?>" aria-label="EU Funding School — Inicio">
				<img class="efs-topbar__logo"
					src="<?php echo esc_url( get_stylesheet_directory_uri() . '/assets/logo-efs-white.png' ); ?>"
					alt="EU Funding School" width="600" height="169">
			</a>
			<nav class="efs-topbar__nav" id="efs-topbar-nav" aria-label="Primary">
				<?php
				wp_nav_menu( array(
					'theme_location' => 'efs_primary',
					'container'      => false,
					'menu_class'     => 'efs-topbar__menu',
					'fallback_cb'    => 'efs_topbar_fallback_menu',
					'depth'          => 1,
				) );
				?>
			</nav>
			<div class="efs-topbar__cta">
				<a class="efs-topbar__login efs-app-login" href="https://intake.eufundingschool.com/">
					Iniciar sesión
				</a>
			</div>
			<button type="button" class="efs-topbar__toggle" id="efs-topbar-toggle"
					aria-label="Abrir menú" aria-controls="efs-topbar-nav" aria-expanded="false">
				<span class="efs-topbar__bars" aria-hidden="true"></span>
			</button>
		</div>
	</header>
	<?php
} );

/* -------------------------------------------------------------------------
 * Toggle del menú superior en móvil (≤720px). El nav se oculta y se despliega
 * con el botón hamburguesa. Replicado en public/index.html del tool.
 * ------------------------------------------------------------------------- */
add_action( 'wp_footer', function () {
	?>
	<script>
	(function(){
		var btn = document.getElementById('efs-topbar-toggle');
		var nav = document.getElementById('efs-topbar-nav');
		if (!btn || !nav) return;
		function close(){ nav.classList.remove('is-open'); btn.setAttribute('aria-expanded','false'); }
		btn.addEventListener('click', function(e){
			e.stopPropagation();
			var open = nav.classList.toggle('is-open');
			btn.setAttribute('aria-expanded', open ? 'true' : 'false');
		});
		nav.addEventListener('click', function(e){ if (e.target.closest('a')) close(); });
		document.addEventListener('click', function(e){
			if (nav.classList.contains('is-open') && !nav.contains(e.target) && e.target !== btn) close();
		});
	})();
	</script>
	<?php
} );

/* -------------------------------------------------------------------------
 * Cross-ecosystem session detection.
 *
 * Si el visitante ya tiene sesión iniciada en el tool (app.eufundingschool.com)
 * cualquier enlace del menú con la clase CSS `efs-app-login` se reescribe a
 * "Mi cuenta · Nombre" y apunta a la home del tool. Si no hay sesión, se queda
 * tal cual ("Iniciar sesión", "Empezar", lo que Oscar haya puesto en wp-admin).
 *
 * Cómo activarlo en wp-admin:
 *   Apariencia → Menús → editar el item "Iniciar sesión" → Clases CSS → añadir `efs-app-login`.
 *
 * Funciona en producción cuando WP y el tool comparten registrable domain
 * (eufundingschool.com / app.eufundingschool.com). En dev cross-domain
 * (eufundingschool.test ↔ localhost:3000) el navegador no envía la cookie
 * por SameSite=Lax — comportamiento esperado, no es bug.
 * ------------------------------------------------------------------------- */
add_action( 'wp_footer', function () {
	?>
	<script>
	(function () {
		var h = location.hostname;
		var isDev  = (h === 'eufundingschool.test' || h === 'localhost' || h === '127.0.0.1');
		var origin = isDev ? 'http://localhost:3000' : 'https://intake.eufundingschool.com';
		var targets = document.querySelectorAll('.efs-app-login, .efs-app-login a, .menu-item.efs-app-login a');
		if (!targets.length) return;

		fetch(origin + '/v1/auth/session-status', { credentials: 'include' })
			.then(function (r) { return r.json(); })
			.then(function (j) {
				if (!j || !j.ok || !j.data || !j.data.logged_in) return;
				var name = j.data.first_name || '';
				targets.forEach(function (el) {
					// If the item is a wrapper, find the inner <a>; otherwise use the el itself
					var a = el.tagName === 'A' ? el : el.querySelector('a');
					if (!a) return;
					a.textContent = name ? ('Mi cuenta · ' + name) : 'Mi cuenta';
					a.setAttribute('href', origin + '/');
				});
			})
			.catch(function () { /* sin sesión / red caída → dejar el botón tal cual */ });
	})();
	</script>
	<?php
} );
