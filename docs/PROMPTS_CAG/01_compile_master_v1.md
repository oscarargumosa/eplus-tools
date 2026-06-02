---
name: compile-master-v1
purpose: DEPRECATED — one-shot 10-chapter compilation. Replaced by 01b_compile_single_chapter.md (one call per chapter, EACEA structure).
model: claude-sonnet-4-20250514
status: deprecated
---

# Compile Master v1 — DEPRECATED

This prompt was the original one-shot compilation: a single LLM call
producing all 10 chapters at once. It was replaced during the nightly
session 2026-05-16 by **`01b_compile_single_chapter.md`** because:

  1. The 30-60k-token output regularly returned truncated/invalid JSON.
  2. A single failure lost all chapters.
  3. The structure (10 generic chapters) did not mirror the official
     EACEA application form.

The current pipeline is one LLM call per chapter, with the structure
of the EACEA "ERASMUS BB and LS Type II" form (Project Summary, 1.1,
1.2, 1.3, 2.1.1–2.1.5, 2.2.1–2.2.2, 3.1–3.3, 4.1, 4.2 per WP, 5.1, 5.2).

See `01b_compile_single_chapter.md` for the active prompt.
