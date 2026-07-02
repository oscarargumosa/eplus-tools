<?php
/**
 * Single post template — full article page.
 *
 * Dos variantes:
 *  - Posts de la categoría "recursos" → carcasa Recursos (top bar + sidebar
 *    + tarjeta de artículo), coherente con page-recursos.php.
 *  - Resto de posts → vista de blog clásica (/blog/).
 */
if ( ! defined( 'ABSPATH' ) ) exit;

get_header();

while ( have_posts() ) : the_post();

	$minutes = max( 1, (int) round( str_word_count( wp_strip_all_tags( get_the_content() ) ) / 220 ) );

	if ( has_category( 'recursos' ) ) :
		/* ---------- Variante Recursos (carcasa con sidebar) ---------- */
		get_template_part( 'template-parts/recursos-sidebar', null, array( 'active' => 'articulos' ) );

		$ka = efs_ka_meta( get_the_ID() );
		// Etiqueta del hero: "KA1 · Movilidad" (KA + último segmento del kicker).
		$hero = $ka['tag'];
		if ( false !== strpos( $ka['kicker'], '·' ) ) {
			$parts = array_map( 'trim', explode( '·', $ka['kicker'] ) );
			$sub   = end( $parts );
			$hero  = trim( ( $ka['tag'] ? $ka['tag'] . ' · ' : '' ) . $sub );
		} elseif ( ! $hero ) {
			$hero = $ka['kicker'];
		}
		?>
		<main id="primary" class="efs-recursos-main">
			<a class="back" href="<?php echo esc_url( home_url( '/recursos/' ) ); ?>">
				<span class="material-symbols-outlined" style="font-size:18px">arrow_back</span> Volver a Artículos
			</a>
			<article <?php post_class( 'article ' . $ka['class'] ); ?>>
				<div class="article__hero">
					<?php if ( $hero ) : ?><span class="tag"><?php echo esc_html( $hero ); ?></span><?php endif; ?>
				</div>
				<div class="article__body">
					<h1 class="entry-title"><?php the_title(); ?></h1>
					<div class="article__meta">
						Por <?php the_author(); ?> ·
						<time datetime="<?php echo esc_attr( get_the_date( 'c' ) ); ?>"><?php echo esc_html( get_the_date() ); ?></time>
						· <?php echo esc_html( $minutes ); ?> min de lectura
					</div>
					<div class="entry-content">
						<?php the_content(); ?>
					</div>
				</div>
			</article>
		</main>
		<?php
	else :
		/* ---------- Variante blog clásica ---------- */
		?>
		<main id="primary" class="efs-single">
			<article <?php post_class( 'efs-single-wrap' ); ?>>

				<?php $cats = get_the_category_list( ' · ' ); if ( $cats ) : ?>
					<div class="efs-single__cats"><?php echo $cats; ?></div>
				<?php endif; ?>

				<h1 class="entry-title"><?php the_title(); ?></h1>

				<?php if ( has_excerpt() ) : ?>
					<p class="efs-single__excerpt"><?php echo esc_html( get_the_excerpt() ); ?></p>
				<?php endif; ?>

				<div class="efs-single__meta">
					<span><strong><?php the_author(); ?></strong></span>
					<span>·</span>
					<time datetime="<?php echo esc_attr( get_the_date( 'c' ) ); ?>"><?php echo esc_html( get_the_date() ); ?></time>
					<?php
					$mod = get_the_modified_date( 'c' );
					if ( $mod !== get_the_date( 'c' ) ) : ?>
						<span>·</span>
						<span>Actualizado <?php echo esc_html( get_the_modified_date() ); ?></span>
					<?php endif; ?>
					<span>·</span>
					<span><?php echo esc_html( $minutes ); ?> min de lectura</span>
				</div>

				<?php if ( has_post_thumbnail() ) : ?>
					<div class="efs-single__hero"
						style="background-image:url('<?php echo esc_url( get_the_post_thumbnail_url( null, 'large' ) ); ?>')"></div>
				<?php endif; ?>

				<div class="efs-single__content entry-content">
					<?php the_content(); ?>
				</div>

				<?php efs_cta( 'newsletter' ); ?>
				<?php efs_cta( 'sandbox' ); ?>

			</article>
		</main>
		<?php
	endif;

endwhile;
get_footer();
