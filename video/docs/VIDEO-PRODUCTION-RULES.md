# Normas de Producción de Vídeo — EU Funding School

> Protocolo replicable para crear vídeos profesionales a partir de un guión.
> Establecido en la sesión del 2026-06-04 (vídeo KA3 "Juventud Europea Unida").
> Objetivo final: producción en masa, multi-idioma, con mínimo input humano (solo el guión).

---

## 1. Filosofía

- **El input humano es el guión.** Todo lo demás se deriva automáticamente: voz, tiempos, imágenes, subtítulos, transiciones.
- **Cero tiempos muertos.** Siempre tiene que estar pasando algo y pasar rápido.
- **Calidad profesional** con assets reales (no relleno).

---

## 2. Reglas de ritmo (validadas con Oscar)

| Regla | Valor | Dónde |
|---|---|---|
| Una imagen NUNCA fija más de | **5 s** | `RotatingImage.tsx` (`maxSecondsPerImage=5`) |
| Transición entre slides | **7 frames** (~0,23 s) | `Lesson.tsx` `TRANSITION_FRAMES` |
| Aire muerto al final de cada slide | **0,5 s** | `Lesson.tsx` `getSlideDuration` (`duration + 0.5`) |
| Velocidad de voz | **1.12** | `generate-audio.js --speed 1.12` (ElevenLabs `voice_settings.speed`) |
| Música de fondo | **NINGUNA** (decisión de producto) | `Root.tsx` sin `musicTrack` |

## 3. Subtítulos — discretos, son una asistencia

`TikTokCaptions.tsx`:
- Tamaño **32px** (no 52), peso normal.
- Posición **86% (abajo)**, no centro.
- Ancho máx **58%**, fondo `rgba(0,0,0,0.32)` con blur ligero.
- "Salto" de palabra mínimo (escala 1.05, no 1.15).

## 4. Imágenes — banco grande + CERO repeticiones

El requisito clave de Oscar: **ninguna imagen se repite en una misma presentación.**

1. **Fuente:** Pexels (calidad pro). API key en `video/.env` → `PEXELS_API_KEY` (gratis, 25.000 req/h).
2. **Banco local:** `scripts/fetch-bank.js` descarga por temas a `public/images/bank/<tema>/` y escribe `manifest.json`.
   - Ampliar: `node scripts/fetch-bank.js --theme youth --count 60`
   - Temas actuales: youth, europe, travel, collaboration, politics, education, support, rural.
3. **Asignación sin repetición:** `lessons/assignImages.ts` (`assignBankImages`).
   - Calcula imágenes por slide = `ceil((duración_audio + 0.5) / 5)`.
   - Reparte imágenes únicas por tema; cursor por tema → slides del mismo tema reciben distintas; fallback global; solo repite como último recurso si el banco es menor que la demanda.
   - Se ejecuta en `Root.tsx` al cargar; rellena `slide.images`.
4. **Render:** `RotatingImage.tsx` trocea la duración del slide y cambia de imagen cada ≤5 s con crossfade + Ken Burns. Resuelve rutas locales con `staticFile`, URLs remotas pasan tal cual.

> Para muchos vídeos, los temas más usados (youth) se agotan → engordar el banco con más `--count` y más queries. El sistema escala solo.

## 5. La lección se declara por TEMAS, no por imágenes

Cada slide en `lessons/*.ts` lleva un campo **`theme`** (string). El asignador pone las imágenes. Ejemplo:

```ts
{ type: "bullets", variant: "dark", theme: "youth", title: "...", bullets: [...], narration: "..." }
```

- `variant: "dark"` en slides con imagen de fondo (texto blanco legible sobre el scrim).
- El fondo (foto + scrim + viñeta) lo pone `SlideLayout.tsx` cuando hay `images`.

## 6. CTA reutilizable (cierre de todos los vídeos)

`compositions/CtaOutro.tsx` — ~15-17 s, pegable al final de cualquier vídeo.
- **Fondo:** fotos rotando + scrim de marca.
- **Chips flotantes** subiendo por los laterales (centro despejado):
  - Proyectos + importe (amarillo): `KA1 Movilidad · 120.000€`, `KA3 Juventud · 500.000€`, `CoVE · 4.000.000€`...
  - Perfiles destinatarios (blanco): Empresas, Centros educativos, Universidades, Ayuntamientos, ONGs, Administración pública, FP.
  - **Versión elegida (v3):** chips DELANTE del cartel (zIndex 5), traslúcidos, opacidad media (~0,55). No saturar (probado: 0,92 era demasiado).
- **Panel central** con respaldo para que el mensaje y la URL siempre se lean.
- **Voz directa:** "Europa financia mucho más de lo que imaginas... conoce todas las posibilidades en EU Funding School punto com." Dirigido a empresas, centros educativos, administración.

Integración lección + CTA: `compositions/LessonWithCta.tsx` (encadena con `<Series>`). La lección se pasa **sin su slide outro** (el CTA lo sustituye).

## 7. Voz (ElevenLabs)

- Modelo `eleven_multilingual_v2` (habla ~29 idiomas con la misma voz → base del multi-idioma).
- Voz Daniel: `onwK4e9ZLuTAKqWW03F9` (en `.env`).
- `voice_settings`: stability 0.5, similarity_boost 0.75, style 0.3, **speed 1.12**.
- Genera MP3 → auto-convierte a OGG (MP3 no va en el browser de este PC).

---

## 8. Cómo crear un vídeo nuevo (paso a paso)

1. **Guión** → trocear en slides; cada slide con `narration` + `theme` + contenido visual.
2. Crear `src/lessons/<id>.ts` (`LessonData`).
3. **Audio:** `node scripts/generate-audio.js --lesson <id> --provider elevenlabs --speed 1.12`
4. Copiar OGG: `cp src/audio/<id>/*.ogg public/audio/<id>/`
5. **Banco** (si faltan temas): `node scripts/fetch-bank.js --theme <X> --count 40`
6. **Registrar** en `Root.tsx`: importar lección + manifest, `assignBankImages`, `Composition` (id, `calculateTotalFrames`). Para vídeo con cierre, usar `LessonWithCta` con la lección sin outro.
7. **Smoke test:** `npx remotion render src/index.ts <ID> out/smoke.mp4 --frames=0-60`
8. **Render:** `npx remotion render src/index.ts <ID> out/<id>.mp4`
9. Revisar el MP4 (el preview del browser no es fiable para audio).

## 9. Regenerar assets (clone limpio o reset)

Lo pesado está gitignorado. Para reproducir:
```bash
npm --prefix video install
node video/scripts/fetch-bank.js                    # banco de imágenes (Pexels)
node video/scripts/generate-audio.js --lesson <id> --provider elevenlabs --speed 1.12
cp video/src/audio/<id>/*.ogg video/public/audio/<id>/
```
Requiere `PEXELS_API_KEY` y `ELEVENLABS_API_KEY` en `video/.env`.

## 10. Mapa de archivos clave

```
src/lessons/<id>.ts          → guión + themes por slide
src/lessons/assignImages.ts  → asignador sin repeticiones
src/compositions/Lesson.tsx  → motor de lección (auto-timing, captions, transiciones)
src/compositions/CtaOutro.tsx    → CTA dinámico reutilizable
src/compositions/LessonWithCta.tsx → encadena lección + CTA
src/components/RotatingImage.tsx → rotación de imágenes ≤5s + Ken Burns
src/components/SlideLayout.tsx   → fondo (foto+scrim) de slides de texto
src/components/TikTokCaptions.tsx → subtítulos discretos
scripts/fetch-bank.js        → descarga banco Pexels por temas
scripts/generate-audio.js    → TTS ElevenLabs (--speed)
public/images/bank/          → banco (gitignored, regenerable)
```

## 11. Multi-idioma (patrón PROBADO — inglés ya hecho)

Cada idioma es una **capa fina** sobre el mismo motor. El banco de imágenes y los
componentes se reutilizan tal cual; solo cambian textos + narración + audio.
Referencia viva: `ka3-que-es.ts` (ES) ↔ `ka3-que-es-en.ts` (EN).

**Pasos para añadir un idioma `<lang>` (ej. `fr`):**

1. **Lección traducida:** copiar `src/lessons/<id>.ts` → `src/lessons/<id>-<lang>.ts`.
   - Traducir TODO el texto visible (`title`, `subtitle`, `tag`, `text`, `bullets`,
     `steps[].description`, `stats[].label`/`suffix`) **y** `narration`.
   - **No tocar** `theme`, `type`, `variant`, `imagePosition` (son agnósticos al idioma → mismas imágenes).
2. **Audio del idioma:**
   `node scripts/generate-audio.js --lesson <id>-<lang> --provider elevenlabs --speed 1.12`
   `cp src/audio/<id>-<lang>/*.ogg public/audio/<id>-<lang>/`
   - Misma voz (`eleven_multilingual_v2` habla ~29 idiomas). Si se quiere voz nativa por idioma,
     pasar otra `--voice <id>` o cambiar `ELEVENLABS_VOICE_ID`.
3. **CTA del idioma:** crear `src/lessons/cta-outro-<lang>.ts` (solo `narration`), generar su audio,
   y definir un objeto `cta<Lang>Content` con `audioFile`, `headline`, `accentWord`, `profilesLine`,
   `projectChips`, `profileChips` traducidos (ver `ctaEnContent` en `Root.tsx`).
   - `CtaOutro.tsx` recibe esos textos por props; el español es el default.
4. **Registrar en `Root.tsx`:** importar lección + manifests (`<id>-<lang>` y `cta-outro-<lang>`),
   `assignBankImages` (asignación independiente → 0 repeticiones también en ese idioma),
   y una `<Composition id="<ID>-<LANG>">` con `LessonWithCta` (lección sin outro + `ctaContent`).
5. **Render:** `npx remotion render src/index.ts <ID>-<LANG> out/<id>-<lang>.mp4`

> El auto-timing re-ajusta solo: el audio de cada idioma tiene otra duración y los slides/captions
> se recalculan. No hay tiempos que tocar a mano.

## 12. Próximos saltos (pendientes)

- **Comando de producción en masa:** `npm run produce -- --script X --langs es,en,fr` que automatice §11 en bucle.
- **Vídeo de stock en movimiento:** Pexels Video API como fondo (la misma key sirve) — el siguiente nivel de "siempre pasando algo".
- **Voces nativas por idioma:** opcional, mapa `lang → ELEVENLABS_VOICE_ID`.
