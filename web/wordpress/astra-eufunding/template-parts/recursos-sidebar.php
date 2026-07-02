<?php
/**
 * Barra lateral de la sección Recursos.
 * Reutilizada por page-recursos.php (pestañas) y por single.php (artículo).
 *
 * @param string $args['active']  pestaña activa: articulos|descargables|videos|redes
 */
if ( ! defined( 'ABSPATH' ) ) exit;

$active = isset( $args['active'] ) ? $args['active'] : 'articulos';

$tabs = array(
	'articulos'    => array( 'label' => 'Artículos',      'icon' => 'article',       'url' => home_url( '/recursos/' ) ),
	'descargables' => array( 'label' => 'Descargables',   'icon' => 'download',      'url' => home_url( '/recursos/descargables/' ) ),
	'videos'       => array( 'label' => 'Vídeos',         'icon' => 'smart_display', 'url' => home_url( '/recursos/videos/' ) ),
	'redes'        => array( 'label' => 'Redes sociales', 'icon' => 'share',         'url' => home_url( '/recursos/redes-sociales/' ) ),
);
?>
<aside class="efs-sidebar">
	<nav class="efs-sidebar__nav" aria-label="Recursos">
		<div class="efs-sidebar__section">Recursos</div>
		<?php foreach ( $tabs as $key => $tab ) :
			$is = ( $key === $active ) ? ' is-active' : ''; ?>
			<a class="efs-sidebar__link<?php echo $is; ?>" href="<?php echo esc_url( $tab['url'] ); ?>"
				<?php if ( $is ) echo 'aria-current="page"'; ?>>
				<span class="material-symbols-outlined"><?php echo esc_html( $tab['icon'] ); ?></span>
				<?php echo esc_html( $tab['label'] ); ?>
			</a>
		<?php endforeach; ?>
	</nav>
	<div class="efs-sidebar__bottom">
		<a class="efs-sidebar__link" href="<?php echo esc_url( home_url( '/' ) ); ?>">
			<span class="material-symbols-outlined">arrow_back</span>Volver a la web
		</a>
	</div>
</aside>
