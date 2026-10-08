#!/usr/bin/env python3
"""Transcripción local con faster-whisper (sin API de pago).

Uso: whisper-local.py <audio> [modelo]
Imprime JSON: {"text": "...", "language": "es", "probability": 0.98}

Lo invoca node/src/modules/voice/controller.js cuando WHISPER_PY está
definido (solo donde haya Python + faster-whisper, p. ej. el host del VPS;
el contenedor de producción no lo tiene). Modelo por defecto: WHISPER_PY_MODEL
o "small" (en caché en ~/.cache/huggingface).
"""
import json
import os
import sys

from faster_whisper import WhisperModel

src = sys.argv[1]
name = sys.argv[2] if len(sys.argv) > 2 else os.environ.get("WHISPER_PY_MODEL", "small")
threads = int(os.environ.get("WHISPER_PY_THREADS", "4"))

model = WhisperModel(name, device="cpu", compute_type="int8", cpu_threads=threads)
segments, info = model.transcribe(src, vad_filter=True)
text = " ".join(s.text.strip() for s in segments).strip()
print(json.dumps({"text": text, "language": info.language, "probability": info.language_probability}, ensure_ascii=False))
