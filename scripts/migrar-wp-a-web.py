#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Genera las páginas de public/web/ a partir del contenido rescatado de WordPress
(docs/legacy-wp/). Uso puntual, no hay build: lo que se publica son los .html
que este script deja escritos, y a partir de ahí se editan a mano.

    python3 scripts/migrar-wp-a-web.py

El markup del menú superior se repite en cada página a propósito: así está en el
HTML servido (bueno para indexación) y no depende de JS. Los estilos y el
comportamiento sí son comunes (/css/topbar.css, /js/topbar.js). Si algún día son
más de cinco páginas, toca meter un parcial de verdad.
"""
import os
import re

RAIZ    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEGACY  = os.path.join(RAIZ, 'docs', 'legacy-wp')
DESTINO = os.path.join(RAIZ, 'public', 'web')

ARTICULOS = [
    ('erasmus-ka1-movilidades', 'KA1', '18 de junio de 2026'),
    ('erasmus-ka2-cooperacion', 'KA2', '18 de junio de 2026'),
    ('erasmus-ka3-politicas',   'KA3', '18 de junio de 2026'),
]


def topbar(actual, prefijo=''):
    """`actual` marca la pestaña activa. `prefijo` sube de subcarpeta a la raíz."""
    def cls(nombre):
        return ' class="is-current"' if nombre == actual else ''
    return f'''<header class="efs-topbar" role="banner" data-efs-session>
  <div class="efs-topbar__inner">
    <a class="efs-topbar__brand" href="https://eufundingschool.com/" aria-label="EU Funding School — Inicio">
      <img class="efs-topbar__logo" src="/img/logo-efs-white.png" alt="EU Funding School" width="600" height="169">
    </a>
    <nav class="efs-topbar__nav" id="efs-topbar-nav" aria-label="Primary">
      <ul class="efs-topbar__menu">
        <li{cls('recursos')}><a href="https://eufundingschool.com/recursos/" target="_top">Recursos</a></li>
        <li><a href="https://campus.eufundingschool.com" target="_top">Academia</a></li>
        <li{cls('mision')}><a href="https://eufundingschool.com/academia/" target="_top">Misión</a></li>
        <li><a href="/#my-projects">Proyectos</a></li>
        <li><a href="/#my-org">Entidades</a></li>
        <li><a href="/#convocatorias">Convocatorias</a></li>
        <li><a href="/#movilidades">Movilidades</a></li>
        <li><a href="/#eu-vision">EU Vision</a></li>
      </ul>
    </nav>
    <div class="efs-topbar__cta">
      <a id="topbar-cta-back" class="efs-topbar__login" href="/#login">Iniciar sesión</a>
      <a id="topbar-cta-account" class="efs-topbar__login" href="/#account-profile" style="display:none;">
        Mi cuenta · <span id="topbar-user-name">…</span>
      </a>
    </div>
    <button type="button" class="efs-topbar__toggle" id="efs-topbar-toggle"
            aria-label="Abrir menú" aria-controls="efs-topbar-nav" aria-expanded="false">
      <span class="material-symbols-outlined">menu</span>
    </button>
  </div>
</header>'''


def envoltorio(titulo, descripcion, canonical, actual, cuerpo):
    return f'''<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{titulo}</title>
<meta name="description" content="{descripcion}">
<link rel="canonical" href="{canonical}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/topbar.css">
<link rel="stylesheet" href="/css/web.css">
</head>

<body class="efs-web efs-has-topbar">

{topbar(actual)}

{cuerpo}

<script src="/js/topbar.js"></script>
</body>
</html>
'''


def leer(nombre):
    with open(os.path.join(LEGACY, nombre), encoding='utf-8') as f:
        return f.read().strip()


def meta_articulos():
    """slug -> (título, extracto), desde el volcado de WordPress."""
    datos = {}
    with open(os.path.join(LEGACY, '_meta-posts.txt'), encoding='utf-8') as f:
        for linea in f:
            if '|||' not in linea:
                continue
            slug, titulo, extracto = linea.strip().split('|||')
            datos[slug] = (titulo, extracto)
    return datos


def main():
    os.makedirs(os.path.join(DESTINO, 'recursos'), exist_ok=True)
    metas = meta_articulos()

    # ── Índice de recursos ────────────────────────────────────────
    intro = re.sub(r'<[^>]+>', '', leer('page-recursos.html')).strip()
    tarjetas = []
    for slug, tag, fecha in ARTICULOS:
        titulo, extracto = metas[slug]
        tarjetas.append(f'''    <a class="card" href="/recursos/{slug}">
      <span class="tag">{tag}</span>
      <h3>{titulo}</h3>
      <p>{extracto}</p>
      <span class="meta">{fecha}</span>
    </a>''')

    cuerpo = f'''<main>
  <div class="wrap">
    <div class="page-head">
      <h1>Recursos</h1>
      <p class="lead">{intro}</p>
    </div>

    <div class="cards">
{chr(10).join(tarjetas)}
    </div>

    <section class="soon">
      <h2>En camino</h2>
      <ul>
        <li><b>Descargables</b> — plantillas y guías de trabajo para preparar una propuesta.</li>
        <li><b>Vídeos</b> — las piezas cortas de la Academia, explicando cada acción clave.</li>
      </ul>
    </section>

    <div class="foot">
      ¿Buscas convocatorias abiertas? Están en
      <a href="/#convocatorias">el buscador del Studio</a>.
    </div>
  </div>
</main>'''

    # Va como index.html dentro de la carpeta: si fuera recursos.html al lado de
    # recursos/, express.static serviría la carpeta y el índice quedaría inalcanzable.
    # Además deja la URL igual que en WordPress: /recursos/
    with open(os.path.join(DESTINO, 'recursos', 'index.html'), 'w', encoding='utf-8') as f:
        f.write(envoltorio(
            'Recursos — EU Funding Studio',
            intro,
            'https://eufundingschool.com/recursos/',
            'recursos',
            cuerpo,
        ))

    # ── Un fichero por artículo ───────────────────────────────────
    for slug, tag, fecha in ARTICULOS:
        titulo, extracto = metas[slug]
        contenido = leer(f'post-{slug}.html')
        cuerpo = f'''<main>
  <article class="article">
    <div class="wrap wrap--read">
      <a class="back" href="/recursos">← Recursos</a>
      <h1>{titulo}</h1>
      <p class="date">{fecha}</p>
{contenido}
    </div>
  </article>
</main>'''
        with open(os.path.join(DESTINO, 'recursos', f'{slug}.html'), 'w', encoding='utf-8') as f:
            f.write(envoltorio(
                f'{titulo} — EU Funding Studio',
                extracto,
                f'https://eufundingschool.com/{slug}/',
                'recursos',
                cuerpo,
            ))

    print(f'Generadas: recursos/index.html + {len(ARTICULOS)} artículos en public/web/')


if __name__ == '__main__':
    main()
