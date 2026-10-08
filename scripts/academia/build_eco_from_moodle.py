#!/usr/bin/env python3
"""
Construye data/academia/ecosistema-erasmus.json a partir del curso 3 del Moodle
de EFS («El Ecosistema Erasmus+»).

De dónde sale cada cosa:
  - Texto de la lección y ficha  → /opt/moodle/ecosistema-erasmus/M*/M*_L*.html
  - Test (10 preguntas GIFT)     → /opt/moodle/ecosistema-erasmus/M*/M*_L*_quiz.gift.txt
  - Título largo, vídeo, póster  → tabla mdl_page del Moodle (contenedor moodle-db)
    y PDF del dossier
  - Duración del vídeo           → ffprobe sobre el MP4 del CDN

La lectura se parte en hojas como en las zonas de estudio de Emociona: un
apartado por <h3>, una hoja por párrafo, y los párrafos de menos de 120
caracteres se unen al anterior.

Uso:  python3 scripts/academia/build_eco_from_moodle.py
"""
import html
import json
import os
import re
import subprocess
import sys
from html.parser import HTMLParser

FUENTES = '/opt/moodle/ecosistema-erasmus'
SALIDA = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'academia', 'ecosistema-erasmus.json')
CORTO = 120


def moodle(sql):
    cmd = ['docker', 'exec', 'moodle-db', 'sh', '-c',
           'mariadb -umoodle -p"$MARIADB_PASSWORD" moodle --batch --raw -N -e "$0"', sql]
    out = subprocess.run(cmd, capture_output=True, text=True, check=True).stdout
    return [line.split('\t') for line in out.splitlines() if line]


# ── Moodle: módulos y páginas ───────────────────────────────────────────────
modulos = {int(n): t for n, t in moodle(
    "SELECT section, name FROM mdl_course_sections WHERE course=3 AND section>0")}

paginas = {}
for nombre, contenido in moodle(
        "SELECT name, REPLACE(REPLACE(content, CHAR(10), ' '), CHAR(9), ' ') "
        "FROM mdl_page WHERE course=3"):
    m = re.match(r'^(\d+)\.(\d+)\s*·\s*(.+)$', nombre)
    if not m:
        continue  # sesiones participativas online: no son lecciones
    clave = f'{m.group(1)}.{m.group(2)}'
    video = re.search(r'<video[^>]*\ssrc="([^"]+\.mp4)"', contenido)
    poster = re.search(r'poster="([^"]+)"', contenido)
    pdf = re.search(r'href="([^"]+dossier[^"]+\.pdf)"', contenido)
    paginas[clave] = {
        'title': html.unescape(m.group(3)).strip(),
        'video': video.group(1) if video else None,
        'poster': poster.group(1) if poster else None,
        'pdf': pdf.group(1) if pdf else None,
    }


# ── Texto de la lección → apartados y hojas ─────────────────────────────────
class Articulo(HTMLParser):
    INLINE = {'strong': 'strong', 'b': 'strong', 'em': 'em', 'i': 'em'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.secciones = [{'heading': None, 'paragraphs': []}]
        self.buf = None      # texto del bloque en curso
        self.tag = None      # p | li | h2 | h3
        self.lista = None    # ítems de la lista en curso

    def handle_starttag(self, tag, attrs):
        if tag in ('p', 'li', 'h2', 'h3'):
            self.buf, self.tag = '', tag
        elif tag in ('ul', 'ol'):
            self.lista = []
        elif tag in self.INLINE and self.buf is not None:
            self.buf += f'<{self.INLINE[tag]}>'

    def handle_endtag(self, tag):
        if tag in self.INLINE and self.buf is not None:
            self.buf += f'</{self.INLINE[tag]}>'
            return
        if tag in ('ul', 'ol') and self.lista is not None:
            if self.lista:
                self.secciones[-1]['paragraphs'].append(
                    '<ul>' + ''.join(f'<li>{li}</li>' for li in self.lista) + '</ul>')
            self.lista = None
            return
        if tag != self.tag or self.buf is None:
            return
        texto = re.sub(r'\s+', ' ', self.buf).strip()
        self.buf, self.tag = None, None
        if not texto:
            return
        if tag == 'h2':
            return  # el título de la lección ya va en la portada
        if tag == 'h3':
            self.secciones.append({'heading': re.sub(r'<[^>]+>', '', texto), 'paragraphs': []})
        elif tag == 'li' and self.lista is not None:
            self.lista.append(texto)
        else:
            self.secciones[-1]['paragraphs'].append(texto)

    def handle_data(self, data):
        if self.buf is not None:
            self.buf += html.escape(data, quote=False)


def texto_plano(s):
    return re.sub(r'<[^>]+>', '', s)


def leer_articulo(ruta):
    crudo = open(ruta, encoding='utf-8').read()
    ficha = {}
    m = re.search(r'<!--\s*FICHA(.*?)-->', crudo, re.S)
    if m:
        for linea in m.group(1).splitlines():
            if ':' in linea:
                k, v = linea.split(':', 1)
                ficha[k.strip()] = v.strip()
    p = Articulo()
    p.feed(re.sub(r'<!--.*?-->', '', crudo, flags=re.S))
    secciones = []
    for s in p.secciones:
        unidos = []
        for par in s['paragraphs']:
            if unidos and len(texto_plano(par)) < CORTO and not par.startswith('<ul>') \
                    and not unidos[-1].startswith('<ul>'):
                unidos[-1] += ' ' + par
            else:
                unidos.append(par)
        if unidos:
            secciones.append({'heading': s['heading'], 'paragraphs': unidos})
    return ficha, secciones


# ── GIFT → preguntas ────────────────────────────────────────────────────────
def leer_gift(ruta):
    crudo = open(ruta, encoding='utf-8').read()
    crudo = '\n'.join(l for l in crudo.splitlines() if not l.strip().startswith('//'))
    preguntas = []
    for m in re.finditer(r'::([^:]+)::(.*?)\{(.*?)\}', crudo, re.S):
        qid = m.group(1).split()[0]
        enunciado = m.group(2).strip()
        opciones = []
        for o in re.finditer(r'^\s*([=~])(.*)$', m.group(3), re.M):
            txt, _, fb = o.group(2).partition('#')
            opciones.append({'text': txt.strip(), 'feedback': fb.strip(), 'correct': o.group(1) == '='})
        if sum(o['correct'] for o in opciones) != 1 or len(opciones) < 2:
            sys.exit(f'{ruta}: la pregunta {qid} no tiene exactamente una respuesta correcta')
        preguntas.append({'id': qid, 'question': enunciado, 'options': opciones})
    return preguntas


def duracion(url):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                          '-of', 'csv=p=0', url], capture_output=True, text=True).stdout.strip()
    return round(float(out)) if out else None


# ── Montaje ─────────────────────────────────────────────────────────────────
curso = {
    'slug': 'ecosistema-erasmus',
    'title': 'El Ecosistema Erasmus+',
    'subtitle': 'El mapa completo del programa antes de escribir tu primer proyecto',
    'level': 'Iniciación',
    'lang': 'es',
    'description': (
        'Qué es Erasmus+, cómo se organiza, quién lo gestiona, quién puede participar, '
        'cómo se financia y cómo se evalúa. Ocho módulos para leer la Guía del Programa '
        'con criterio y saber qué acción encaja con tu idea.'),
    'passing_score': 80,
    'hours': 60,
    'modules': [],
}

total_lecciones = 0
for n in sorted(modulos):
    titulo = re.sub(r'^Módulo\s+\d+\s*·\s*', '', modulos[n]).strip()
    mod = {'number': n, 'title': titulo, 'lessons': []}
    carpeta = os.path.join(FUENTES, f'M{n}')
    lecciones = sorted(
        (f for f in os.listdir(carpeta) if f.endswith('.html')),
        key=lambda f: int(re.search(r'_L\d+-(\d+)_', f).group(1)))
    for f in lecciones:
        k = int(re.search(r'_L\d+-(\d+)_', f).group(1))
        code = f'{n}.{k}'
        ficha, secciones = leer_articulo(os.path.join(carpeta, f))
        gift = os.path.join(carpeta, f'M{n}_L{n}-{k}_quiz.gift.txt')
        pag = paginas.get(code)
        if not pag:
            sys.exit(f'Falta la página {code} en Moodle')
        mod['lessons'].append({
            'code': code,
            'slug': code.replace('.', '-'),
            'title': pag['title'],
            'idea': ficha.get('Idea central'),
            'goal': ficha.get('Al terminar, el alumno podrá'),
            'why': ficha.get('Por qué importa'),
            'guide_ref': ficha.get('Referencia Guía'),
            'verify_year': ficha.get('VERIFICAR-AÑO'),
            'video_url': pag['video'],
            'video_poster': pag['poster'],
            'video_seconds': duracion(pag['video']) if pag['video'] else None,
            'pdf_url': pag['pdf'],
            'reading': secciones,
            'questions': leer_gift(gift),
        })
        total_lecciones += 1
        print(f'  {code}  {len(secciones)} apartados · '
              f'{sum(len(s["paragraphs"]) for s in secciones)} hojas · '
              f'{len(mod["lessons"][-1]["questions"])} preguntas · '
              f'vídeo {mod["lessons"][-1]["video_seconds"]} s')
    curso['modules'].append(mod)

# Portada del curso: foto real de la Media Library de EFS (el póster del vídeo
# lleva el título y los subtítulos impresos y no aguanta el recorte).
curso['cover_url'] = 'https://eufundingschool.com/media/europa/europa-bruselas-plaza.jpg'

os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
with open(SALIDA, 'w', encoding='utf-8') as fh:
    json.dump(curso, fh, ensure_ascii=False, indent=1)
print(f'{total_lecciones} lecciones → {os.path.relpath(SALIDA)}')
