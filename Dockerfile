# Node 24 LTS sobre Debian (glibc). En alpine (musl) no carga onnxruntime-node,
# que usa @xenova/transformers para los embeddings de la búsqueda semántica.
# Versión y digest fijados: para actualizar, `docker pull node:24-bookworm-slim`
# y copiar la versión (`node -v`) y el digest (`docker inspect`).
FROM node:24.22.1-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205

# wget: lo usa el healthcheck de Coolify (curl || wget); la imagen slim no trae ninguno
RUN apt-get update \
 && apt-get install -y --no-install-recommends wget \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    EMBEDDINGS_CACHE_DIR=/app/.cache/transformers

WORKDIR /app
COPY package.json package-lock.json ./
# Fuera los binarios de onnxruntime para macOS/Windows (~64 MB que nunca se usan)
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force \
 && rm -rf node_modules/onnxruntime-node/bin/napi-v3/darwin node_modules/onnxruntime-node/bin/napi-v3/win32

COPY . .

# La app corre como `node` (uid 1000). Solo puede escribir en:
#   tmp/                     capítulos del máster (master/controller.js)
#   data/                    call_curation.json (convocatorias/curation.js)
#   data/academy/notes.json  notas de revisión (academy/model.js)
#   .cache/transformers      modelo de embeddings (services/embeddings.js)
#   public/uploads, node/private  volúmenes en producción (chown en el host)
RUN mkdir -p tmp .cache/transformers public/uploads/avatars public/uploads/logos \
      node/private/uploads node/private/org-claims \
 && chown node:node tmp data data/academy data/academy/notes.json \
 && chown -R node:node .cache public/uploads node/private

USER node
EXPOSE 3000
CMD ["sh", "-c", "node scripts/migrate.js && node server.js"]
