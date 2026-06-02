-- Extensiones que erasmus-pg del VPS necesita para que el dump restaure limpio.
-- Se ejecutan UNA vez al primer arranque del contenedor (initdb hook).
-- pgvector está comentado: solo si Fase 5 (RAG/embeddings) lo requiere.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
-- CREATE EXTENSION IF NOT EXISTS vector;
