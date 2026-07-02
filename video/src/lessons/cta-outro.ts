import type { LessonData } from "../types";

// ════════════════════════════════════════════════════════════════
// CTA OUTRO (~15s) — reutilizable al final de todos los vídeos.
// Este fichero solo existe para alimentar el TTS (la narración).
// El render real lo hace la composición CtaOutro.tsx (dinámica).
// ════════════════════════════════════════════════════════════════

export const ctaOutroNarration =
  "Europa financia mucho más de lo que imaginas: movilidad, cooperación, juventud, formación profesional. Seas empresa, centro educativo o administración pública, conoce todas las posibilidades en EU Funding School punto com.";

export const ctaOutroLesson: LessonData = {
  id: "cta-outro-001",
  title: "EU Funding School — CTA",
  slides: [
    {
      type: "outro",
      variant: "dark",
      title: "Conócelas todas",
      cta: "eufundingschool.com",
      narration:
        "Europa financia mucho más de lo que imaginas: movilidad, cooperación, juventud, formación profesional. Seas empresa, centro educativo o administración pública, conoce todas las posibilidades en EU Funding School punto com.",
    },
  ],
};
