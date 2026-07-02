# EU Funding School — Video Production Protocol

> **📋 NORMAS REPLICABLES (leer primero): [`docs/VIDEO-PRODUCTION-RULES.md`](docs/VIDEO-PRODUCTION-RULES.md)**
> Protocolo completo guión→vídeo: banco Pexels + asignación sin repeticiones, ritmo, CTA reutilizable.
>
> **Reglas que actualizan/anulan lo de abajo (sesión 2026-06-04):**
> - **Sin música de fondo** por defecto (decisión de producto).
> - **Imágenes:** banco Pexels + `assignImages.ts` (cero repeticiones) + `RotatingImage` (cambio cada ≤5 s). Las lecciones declaran `theme` por slide, no imágenes fijas.
> - **Ritmo:** transiciones 7 frames, padding 0,5 s/slide, voz `--speed 1.12`.
> - **Subtítulos discretos:** 32px, abajo (86%), traslúcidos.
> - **CTA reutilizable:** `CtaOutro.tsx` + `LessonWithCta.tsx`.

## Remotion Docs
- Docs oficiales: https://www.remotion.dev/docs
- API Reference: https://www.remotion.dev/docs/api
- Transitions: https://www.remotion.dev/docs/transitions
- Audio: https://www.remotion.dev/docs/using-audio
- Noise: https://www.remotion.dev/docs/noise
- Shapes: https://www.remotion.dev/docs/shapes

## Audio — REGLAS CRÍTICAS
- **NUNCA usar MP3** — no funciona en el browser de este PC
- **WAV** para preview en browser (pesado pero funciona)
- **OGG** para render a MP4 (ligero, funciona en render)
- Siempre convertir TTS (ElevenLabs) a WAV/OGG vía ffmpeg:
  ```bash
  ffmpeg -i input.mp3 -acodec pcm_s16le -ar 44100 -ac 2 output.wav
  ffmpeg -i input.mp3 -acodec libvorbis -ar 44100 -ac 2 -q:a 6 output.ogg
  ```
- **El preview del browser NO es fiable para audio** — siempre verificar renderizando MP4
- Renderizar clip de prueba rápido: `npx remotion render src/index.ts <ID> out/test.mp4 --frames=0-150`

## Volúmenes de audio
- Música de fondo: **5% cuando habla la voz, 15% en transiciones**
- Voz narración: **150%** (volume={1.5})
- SFX transición: **10%**
- Reels sin voz: música al **50%**

## Visual — Sistema de diseño
- **Paleta:** primary=#06003e, accent=#e7eb00, surface=#f7f9fb
- **Font:** Manrope (pesos 300-800)
- **TopBanner:** 72px azul con logo + título en amarillo (SIEMPRE presente)
- **ProgressBar:** 4px debajo del banner
- **Fondos:** GradientShift + NoiseBackground (Perlin) + ParticleField + DecorativeShapes
- **AudioVisualizer:** barras reactivas simuladas en la parte inferior de cada slide
- **TikTokCaptions:** subtítulos palabra por palabra sincronizados con narración
- **DrawPath:** líneas SVG que se dibujan solas (para diagramas, checkmarks, flechas)
- **CERO tiempos muertos** — todo flota, pulsa, se mueve. Bullets con useProgressiveReveal repartidos en 75% de la duración

## Paquetes Remotion instalados
- `@remotion/transitions` — fade, slide, wipe, flip, clockWipe + springTiming
- `@remotion/noise` — Perlin noise 2D/3D/4D para fondos orgánicos
- `@remotion/shapes` — Rect, Circle, Triangle, Star, Pie, Polygon
- `@remotion/paths` — evolvePath (draw-on), interpolatePath (morphing)
- `@remotion/motion-blur` — Trail component para efecto cinematográfico
- `@remotion/captions` — subtítulos TikTok palabra por palabra
- `@remotion/layout-utils` — fitText() para ajustar texto dinámicamente
- `@remotion/lottie` — animaciones Lottie de LottieFiles.com
- `@remotion/google-fonts` — carga de fuentes sin CDN
- `@remotion/media-utils` — visualizeAudio() para barras reactivas reales
- `@remotion/install-whisper-cpp` — transcripción local para generar captions

## Formatos
| Tipo | Resolución | Uso |
|------|-----------|-----|
| Lección | 1920x1080 | YouTube, academia, web |
| Reel | 1080x1920 | Instagram, TikTok, YouTube Shorts |

## Tipos de slide (horizontal)
- `intro` — título grande + tag + anillo
- `bullets` — 2 columnas, números con glow
- `diagram` — pasos con conectores
- `highlight` — dato con KineticNumber
- `split` — imagen Ken Burns + texto
- `image` — full-bleed + overlay
- `stats` — números cinéticos grandes
- `outro` — CTA glow + social proof

## Pipeline de producción
```
1. Definir guión con Oscar (contenido + narración por slide)
2. Crear lesson .ts en src/lessons/
3. npm run tts:nombre → genera audio (auto-convierte a OGG)
4. Copiar audio a public/audio/
5. Previsualizar visual en localhost:3100 (sin esperar audio)
6. Renderizar MP4: npx remotion render src/index.ts ID out/nombre.mp4
7. Copiar a Desktop y abrir: start C:/Users/Usuario/Desktop/nombre.mp4
8. Iterar con Oscar hasta que esté perfecto
```

## Reels para social media
**SIEMPRE consultar `docs/REELS-RULES.md`** para las reglas completas.

### Reglas críticas:
- **Hook en 3 segundos** — texto visible en frame 5, audio en frame 0, NUNCA silencio
- **Safe zones** — Top: 150px, Bottom: 480px, Left: 60px, Right: 192px
- **Área útil:** 828 x 1290 px (centrada)
- **Texto mínimo 28px**, máximo 3 líneas, máximo 30 chars/línea
- **Estructura:** Hook (0-3s) → Value (3-22s) → CTA (últimos 5-8s)
- **UN solo CTA** por video, centrado en el 60% superior
- **Música SIEMPRE** presente, 5-8% bajo voz, 25% cuando solo música
- **60% ve sin sonido** → el texto debe llevar el mensaje completo
- Fuentes de música: freemusicarchive.org, mixkit.co, pixabay.com/music

## Transiciones
- Paquete: @remotion/transitions (TransitionSeries)
- Horizontal: ciclo fade → slide → wipe
- Vertical/Reels: wipe-bottom, slide-bottom alternando
- 12-15 frames de overlap (0.4-0.5s)

## Imágenes
- Unsplash URLs directas (no requiere API key)
- Efecto Ken Burns automático en split/image slides
- Overlay gradiente para legibilidad del texto

## Estructura de archivos
```
video/
├── src/
│   ├── compositions/   → Lesson.tsx, SocialReel.tsx, AudioTest.tsx
│   ├── components/     → Slides, backgrounds, animaciones
│   ├── lessons/        → Datos de cada lección/reel
│   ├── audio/          → Manifests de TTS
│   └── theme.ts        → Constantes de diseño
├── public/
│   ├── audio/music/    → Música de fondo (.wav)
│   ├── audio/sfx/      → Efectos de sonido (.wav)
│   ├── audio/ka-lines/ → Narración por slide (.wav/.ogg)
│   └── images/         → Imágenes descargadas
├── scripts/            → generate-audio.js, fetch-images.js, fetch-music.js
└── out/                → Videos renderizados (.mp4)
```
