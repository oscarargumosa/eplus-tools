import type { LessonData } from "../types";

// EN — CTA outro narration (drives TTS only; render = CtaOutro.tsx).
export const ctaOutroEnLesson: LessonData = {
  id: "cta-outro-en-001",
  title: "EU Funding School — CTA (EN)",
  slides: [
    {
      type: "outro",
      variant: "dark",
      title: "Discover them all",
      cta: "eufundingschool.com",
      narration:
        "Europe funds far more than you imagine: mobility, cooperation, youth, vocational training. Whether you are a company, a school or a public administration, discover all the possibilities at EU Funding School dot com.",
    },
  ],
};
