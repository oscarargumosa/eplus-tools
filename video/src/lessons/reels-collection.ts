import type { ReelData } from "../compositions/ReelFactory";

// ═══════════════════════════════════════════════════════════════
// REEL 1: "€4M esperándote" — Kinetic money counter
// Música: upbeat (energía, entusiasmo)
// ═══════════════════════════════════════════════════════════════
export const reel1_money: ReelData = {
  id: "reel-money",
  musicTrack: "music/reel-upbeat.wav",
  musicVolume: 0.4,
  scenes: [
    {
      type: "hook-text",
      duration: 4,
      title: "¿Sabías que Europa\npuede SUBVENCIONAR\ntus proyectos?",
      icon: "💰",
      bg: "#0d1a2e",
    },
    {
      type: "hook-number",
      duration: 4,
      number: 60000,
      numberSuffix: "€",
      title: "Proyecto pequeño KA1",
      subtitle: "Movilidad de personas",
      bg: "#1b1464",
    },
    {
      type: "hook-number",
      duration: 4,
      number: 400000,
      numberSuffix: "€",
      title: "Proyecto medio KA2",
      subtitle: "Cooperación entre países",
      bg: "#0d2137",
    },
    {
      type: "hook-number",
      duration: 4,
      number: 4000000,
      numberSuffix: "€",
      title: "Proyecto CoVE",
      subtitle: "Centros de Excelencia en FP",
      bg: "#1a0a3e",
    },
    {
      type: "big-stat",
      duration: 5,
      number: 28000,
      numberPrefix: "+",
      title: "Proyectos financiados\ncada año",
      subtitle: "¿El tuyo será el siguiente?",
      bg: "#0d1a2e",
    },
    {
      type: "cta",
      duration: 6,
      title: "Aprende a conseguir\ntu financiación",
      subtitle: "eufundingschool.com",
    },
  ],
};

// ═══════════════════════════════════════════════════════════════
// REEL 2: "3 errores fatales" — Warning/drama
// Música: dramatic (tensión, urgencia)
// ═══════════════════════════════════════════════════════════════
export const reel2_errors: ReelData = {
  id: "reel-errors",
  musicTrack: "music/reel-dramatic.wav",
  musicVolume: 0.35,
  scenes: [
    {
      type: "hook-text",
      duration: 4,
      title: "3 errores que\nTE CUESTAN\nla subvención",
      icon: "🚨",
      bg: "#2a0a0a",
    },
    {
      type: "point",
      duration: 5,
      title: "No leer los criterios\nde evaluación",
      subtitle: "El 40% de los rechazados falla aquí",
      icon: "❌",
      highlight: "#ff4444",
      bg: "#1a0a0a",
    },
    {
      type: "point",
      duration: 5,
      title: "Presupuesto que\nno cuadra con\nlas actividades",
      subtitle: "Los evaluadores lo detectan al instante",
      icon: "❌",
      highlight: "#ff4444",
      bg: "#0a0a1a",
    },
    {
      type: "point",
      duration: 5,
      title: "Consorcio débil\nsin experiencia\ncomplementaria",
      subtitle: "Necesitas diversidad real, no relleno",
      icon: "❌",
      highlight: "#ff4444",
      bg: "#1a0a1a",
    },
    {
      type: "reveal",
      duration: 4,
      title: "Todos tienen\nsolución",
      subtitle: "Y te enseñamos cómo evitarlos",
      bg: "#0d2137",
    },
    {
      type: "cta",
      duration: 5,
      title: "Presenta tu proyecto\nsin errores",
      subtitle: "eufundingschool.com",
    },
  ],
};

// ═══════════════════════════════════════════════════════════════
// REEL 3: "Tu proyecto en 5 pasos" — Checklist rápida
// Música: upbeat (empoderador, positivo)
// ═══════════════════════════════════════════════════════════════
export const reel3_steps: ReelData = {
  id: "reel-steps",
  musicTrack: "music/bg-upbeat.wav",
  musicVolume: 0.4,
  scenes: [
    {
      type: "hook-text",
      duration: 3,
      title: "Tu primer proyecto\nErasmus+ en\n5 PASOS",
      icon: "🚀",
      bg: "#0d1a2e",
    },
    {
      type: "checklist",
      duration: 8,
      title: "El camino completo",
      items: [
        "Elige tu línea: KA1, KA2 o KA3",
        "Encuentra socios en 3+ países",
        "Diseña actividades con impacto",
        "Cuadra el presupuesto",
        "Envía antes del deadline",
      ],
      bg: "#1b1464",
    },
    {
      type: "big-stat",
      duration: 5,
      number: 80,
      numberSuffix: "%",
      title: "de los aprobados\nsiguieron estos pasos",
      bg: "#0d2137",
    },
    {
      type: "image-text",
      duration: 5,
      imageUrl: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=1080&q=80",
      title: "Miles de organizaciones\nya lo consiguieron",
      subtitle: "La tuya puede ser la siguiente",
    },
    {
      type: "cta",
      duration: 5,
      title: "Empieza hoy\ncon nuestra guía",
      subtitle: "eufundingschool.com",
    },
  ],
};

// ═══════════════════════════════════════════════════════════════
// REEL 4: "El dato que nadie te cuenta" — Quiz/reveal
// Música: dramatic → upbeat (misterio → revelación)
// ═══════════════════════════════════════════════════════════════
export const reel4_quiz: ReelData = {
  id: "reel-quiz",
  musicTrack: "music/reel-dramatic.wav",
  musicVolume: 0.35,
  scenes: [
    {
      type: "quiz",
      duration: 5,
      title: "¿Cuánto dinero\nreparte Erasmus+\ncada año?",
      subtitle: "Piénsalo un momento...",
    },
    {
      type: "hook-number",
      duration: 5,
      number: 26200,
      numberPrefix: "",
      numberSuffix: "M€",
      title: "Presupuesto 2021-2027",
      subtitle: "Veintiséis MIL doscientos millones",
      bg: "#1b1464",
    },
    {
      type: "reveal",
      duration: 4,
      title: "Y la mayoría de\norganizaciones NO\nlo solicita",
      subtitle: "Menos competencia = más oportunidad",
      bg: "#0d2137",
    },
    {
      type: "image-text",
      duration: 5,
      imageUrl: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1080&q=80",
      title: "ONGs, universidades,\nempresas, colegios...",
      subtitle: "Todos pueden participar",
    },
    {
      type: "big-stat",
      duration: 4,
      number: 70,
      numberSuffix: "%",
      title: "tasa de éxito\ncon buena preparación",
      bg: "#1a0a3e",
    },
    {
      type: "cta",
      duration: 5,
      title: "No dejes pasar\nesta oportunidad",
      subtitle: "eufundingschool.com",
    },
  ],
};

// ═══════════════════════════════════════════════════════════════
// REEL 5: "Europa paga tu idea" — Emocional/inspiracional
// Música: upbeat alternativa (energía inspiracional)
// ═══════════════════════════════════════════════════════════════
export const reel5_inspire: ReelData = {
  id: "reel-inspire",
  musicTrack: "music/reel-upbeat.wav",
  musicVolume: 0.45,
  scenes: [
    {
      type: "image-text",
      duration: 4,
      imageUrl: "https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1080&q=80",
      title: "Tienes una idea\nque puede cambiar\ntu comunidad",
    },
    {
      type: "image-text",
      duration: 4,
      imageUrl: "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=1080&q=80",
      title: "Europa quiere\nfinanciarla",
      subtitle: "Solo necesitas saber cómo pedirlo",
    },
    {
      type: "image-text",
      duration: 4,
      imageUrl: "https://images.unsplash.com/photo-1509062522246-3755977927d7?w=1080&q=80",
      title: "De España a África\nde Francia a\nLatinoamérica",
      subtitle: "Proyectos que cruzan fronteras",
    },
    {
      type: "hook-number",
      duration: 5,
      number: 4000000,
      numberSuffix: "€",
      title: "Subvención máxima",
      subtitle: "Para un solo proyecto",
      bg: "#1b1464",
    },
    {
      type: "image-text",
      duration: 5,
      imageUrl: "https://images.unsplash.com/photo-1577962917302-cd874c4e31d2?w=1080&q=80",
      title: "El momento\nes AHORA",
      subtitle: "Las convocatorias se abren cada año",
    },
    {
      type: "cta",
      duration: 5,
      title: "Tu idea merece\nfinanciación",
      subtitle: "eufundingschool.com",
    },
  ],
};
