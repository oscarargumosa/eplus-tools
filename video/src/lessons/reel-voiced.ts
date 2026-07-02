import type { ReelData } from "../compositions/ReelFactory";

// Reel con voz narrada + subtítulos TikTok
// Tema: "Por qué deberías solicitar Erasmus+"
export const reelVoiced = {
  narrations: [
    "¿Sabías que Europa financia proyectos desde sesenta mil hasta cuatro millones de euros?",
    "Y no importa si eres una ONG, una universidad, una empresa o un colegio.",
    "Solo necesitas una buena idea, un consorcio de tres países, y saber cómo presentarlo.",
    "Nosotros te enseñamos paso a paso. Desde la idea hasta la solicitud.",
  ],
  reel: {
    id: "reel-voiced",
    musicTrack: "music/reel-upbeat.wav",
    musicVolume: 0.08,
    scenes: [
      {
        type: "hook-text" as const,
        duration: 7,
        title: "Europa FINANCIA\ntus proyectos",
        subtitle: "De 60.000€ a 4 millones€",
        icon: "🇪🇺",
        bg: "#0d1a2e",
      },
      {
        type: "image-text" as const,
        duration: 7,
        imageUrl: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=1080&q=80",
        title: "ONGs, universidades,\nempresas, colegios",
        subtitle: "Todos pueden participar",
      },
      {
        type: "checklist" as const,
        duration: 8,
        title: "¿Qué necesitas?",
        items: [
          "Una buena idea",
          "Socios en 3+ países",
          "Saber cómo presentarlo",
        ],
        bg: "#1b1464",
      },
      {
        type: "cta" as const,
        duration: 7,
        title: "Te enseñamos\npaso a paso",
        subtitle: "eufundingschool.com",
      },
    ],
  } as ReelData,
};
