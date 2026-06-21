<?php
/**
 * Template Name: Recursos (carcasa + sidebar)
 *
 * Sección Recursos con la carcasa EFS (top bar global + barra lateral).
 * La pestaña activa se deriva del slug de la página:
 *   recursos        → Artículos (blog: posts de la categoría "recursos")
 *   descargables    → Descargables (placeholder)
 *   videos          → Vídeos (placeholder)
 *   redes-sociales  → Redes sociales (placeholder)
 */
if ( ! defined( 'ABSPATH' ) ) exit;

get_header();

$slug = get_post_field( 'post_name', get_the_ID() );
$map  = array(
	'recursos'       => 'articulos',
	'descargables'   => 'descargables',
	'videos'         => 'videos',
	'redes-sociales' => 'redes',
);
$active = isset( $map[ $slug ] ) ? $map[ $slug ] : 'articulos';

get_template_part( 'template-parts/recursos-sidebar', null, array( 'active' => $active ) );

// Subtítulo: el contenido/excerpt de la página (editable en wp-admin), con fallback.
$intro = trim( wp_strip_all_tags( get_the_content() ) );
if ( '' === $intro ) {
	$intro = 'Artículos, guías, descargables y vídeos sobre Erasmus+ y financiación europea, para ayudarte a diseñar y gestionar mejor tus proyectos.';
}
?>

<main id="primary" class="efs-recursos-main">

	<div class="page-head">
		<h1><?php the_title(); ?></h1>
		<p><?php echo esc_html( $intro ); ?></p>
	</div>

	<?php if ( 'articulos' === $active ) : ?>

		<h2 class="section-title">
			<span class="material-symbols-outlined" style="font-size:18px">article</span> Artículos del blog
		</h2>

		<?php
		$articles = new WP_Query( array(
			'category_name'       => 'recursos',
			'posts_per_page'      => 12,
			'ignore_sticky_posts' => true,
		) );
		if ( $articles->have_posts() ) : ?>
			<div class="cards">
				<?php while ( $articles->have_posts() ) : $articles->the_post();
					$ka      = efs_ka_meta( get_the_ID() );
					$minutes = max( 1, (int) round( str_word_count( wp_strip_all_tags( get_the_content() ) ) / 220 ) ); ?>
					<article class="card <?php echo esc_attr( $ka['class'] ); ?>">
						<div class="card__media">
							<?php if ( $ka['tag'] ) : ?><span class="tag"><?php echo esc_html( $ka['tag'] ); ?></span><?php endif; ?>
							<span class="material-symbols-outlined"><?php echo esc_html( $ka['icon'] ); ?></span>
						</div>
						<div class="card__body">
							<div class="card__cat"><?php echo esc_html( $ka['kicker'] ); ?></div>
							<h3 class="card__title">
								<a href="<?php the_permalink(); ?>"><?php the_title(); ?></a>
							</h3>
							<p class="card__excerpt"><?php echo esc_html( wp_trim_words( get_the_excerpt(), 26, '…' ) ); ?></p>
							<div class="card__meta">
								<span class="material-symbols-outlined" style="font-size:15px">schedule</span>
								<?php echo esc_html( $minutes ); ?> min · <?php echo esc_html( get_the_date( 'j M Y' ) ); ?>
							</div>
							<a class="card__more" href="<?php the_permalink(); ?>">
								Leer más <span class="material-symbols-outlined" style="font-size:16px">arrow_forward</span>
							</a>
						</div>
					</article>
				<?php endwhile; ?>
			</div>
			<?php wp_reset_postdata(); ?>
		<?php else : ?>
			<div class="placeholder">
				<span class="material-symbols-outlined">article</span>
				<h2>Aún no hay artículos</h2>
				<p>Pronto publicaremos guías sobre Erasmus+ y financiación europea.</p>
			</div>
		<?php endif; ?>

	<?php else : ?>

		<?php
		$ph = array(
			'descargables' => array( 'icon' => 'download',      'title' => 'Descargables',   'text' => 'Plantillas, guías en PDF y checklists para tus proyectos. Disponibles muy pronto.' ),
			'videos'       => array( 'icon' => 'smart_display', 'title' => 'Vídeos',         'text' => 'Tutoriales y explicaciones en vídeo sobre Erasmus+. Disponibles muy pronto.' ),
			'redes'        => array( 'icon' => 'share',         'title' => 'Redes sociales', 'text' => 'Síguenos para no perderte convocatorias y consejos. Enlaces muy pronto.' ),
		);
		$p = isset( $ph[ $active ] ) ? $ph[ $active ] : $ph['descargables'];
		?>
		<div class="placeholder">
			<span class="material-symbols-outlined"><?php echo esc_html( $p['icon'] ); ?></span>
			<h2><?php echo esc_html( $p['title'] ); ?></h2>
			<p><?php echo esc_html( $p['text'] ); ?></p>
		</div>

	<?php endif; ?>

</main>

<?php get_footer();
