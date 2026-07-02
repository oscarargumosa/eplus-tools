import type { LessonData } from "../types";

// ════════════════════════════════════════════════════════════════
// Lección: ¿Qué es la Acción Clave 3? — Juventud Europea Unida
// Guión de Oscar (guion_KA3_que_es.txt), segmentado en slides.
//
// Cada slide declara un `theme`. El asignador (assignImages.ts) reparte
// imágenes ÚNICAS del banco Pexels (public/images/bank) — ninguna se
// repite en toda la presentación. El motor (RotatingImage) las va pasando
// cada ≤5s con crossfade + Ken Burns.
// ════════════════════════════════════════════════════════════════

export const ka3QueEsLesson: LessonData = {
  id: "ka3-que-es-001",
  title: "Juventud Europea Unida — Acción Clave 3",
  category: "Erasmus+ · KA3",
  slides: [
    // ── 0 · HOOK ─────────────────────────────────────────────
    {
      type: "intro",
      variant: "dark",
      title: "Juventud\nEuropea Unida",
      subtitle: "Hasta 500.000€ para proyectos liderados por jóvenes",
      tag: "Erasmus+ · Acción Clave 3",
      theme: "youth",
      narration:
        "¿Sabías que existe un programa europeo que financia proyectos liderados por jóvenes con hasta medio millón de euros, y que casi nadie conoce? Se llama Juventud Europea Unida, y es parte de la Acción Clave 3 de Erasmus Plus.",
    },

    // ── 1 · EL DATO BOMBA ────────────────────────────────────
    {
      type: "highlight",
      variant: "dark",
      theme: "youth",
      text: "Medio millón de euros para que la gente joven se organice, proponga y mejore su sociedad.",
      source: "Está más cerca de ti de lo que crees",
      narration:
        "Medio millón de euros para que la gente joven se organice, proponga y mejore la sociedad en la que vive. Suena lejano, lo sé. Pero hoy quiero demostrarte que está mucho más cerca de ti de lo que crees.",
    },

    // ── 2 · LAS 3 ACCIONES CLAVE ─────────────────────────────
    {
      type: "diagram",
      variant: "dark",
      title: "Erasmus+ tiene tres grandes acciones",
      theme: "europe",
      steps: [
        { label: "KA1", description: "Movilidad — mueve personas" },
        { label: "KA2", description: "Cooperación — conecta organizaciones" },
        { label: "KA3", description: "Políticas — da voz a las personas" },
      ],
      narration:
        "Para entenderlo bien, empecemos por el principio. Erasmus Plus se organiza en tres grandes acciones, y cada una persigue algo distinto.",
    },

    // ── 3 · KA1 ──────────────────────────────────────────────
    {
      type: "split",
      variant: "dark",
      title: "Acción Clave 1\nMovilidad",
      text: "Financia que estudiantes, profesores o jóvenes se desplacen a aprender o formarse a otro país.",
      theme: "travel",
      imagePosition: "right",
      bullets: ["Su protagonista es la PERSONA"],
      narration:
        "La Acción Clave 1 es la de movilidad: financia que estudiantes, profesores o jóvenes se desplacen a aprender o formarse a otro país. Su protagonista es la persona.",
    },

    // ── 4 · KA2 ──────────────────────────────────────────────
    {
      type: "split",
      variant: "light",
      title: "Acción Clave 2\nCooperación",
      text: "Organizaciones de varios países que se asocian para crear algo juntas y desarrollar métodos nuevos.",
      theme: "collaboration",
      imagePosition: "left",
      bullets: ["Su protagonista es la ORGANIZACIÓN"],
      narration:
        "La Acción Clave 2 es la de cooperación: financia que organizaciones de varios países se asocien para crear algo juntas, intercambiar buenas prácticas o desarrollar métodos nuevos. Su protagonista es la organización.",
    },

    // ── 5 · KA3 ──────────────────────────────────────────────
    {
      type: "split",
      variant: "dark",
      title: "Acción Clave 3\nApoyo a las políticas",
      text: "Solemos imaginar despachos, leyes e instituciones. Pero lo que busca Europa está más cerca de ti.",
      theme: "politics",
      imagePosition: "right",
      bullets: ["Su protagonista eres TÚ"],
      narration:
        "La Acción Clave 3 es la de apoyo a las políticas. Y aquí solemos imaginar algo enorme y lejano: despachos, leyes, instituciones. Pero te voy a contar lo que de verdad busca Europa con esta acción, porque está mucho más cerca de ti de lo que parece.",
    },

    // ── 6 · FRASE PARA FIJAR ─────────────────────────────────
    {
      type: "bullets",
      variant: "dark",
      theme: "youth",
      title: "Una frase para no olvidarlo",
      bullets: [
        "KA1 mueve personas",
        "KA2 conecta organizaciones",
        "KA3 da voz a las personas",
        "...en las decisiones que les afectan",
      ],
      narration:
        "Si quieres una frase para fijarlo: la Acción Clave 1 mueve personas, la Acción Clave 2 conecta organizaciones, y la Acción Clave 3 da voz a las personas en las decisiones que les afectan.",
    },

    // ── 7 · ¿VOZ A QUIÉN? A TI ───────────────────────────────
    {
      type: "highlight",
      variant: "dark",
      theme: "support",
      text: "¿Voz a quién? A ti. A la gente joven.",
      source: "El corazón de la Acción Clave 3",
      narration:
        "¿Voz a quién? A ti. A la gente joven. El corazón de la Acción Clave 3 es que las personas, y muy especialmente las jóvenes, se acerquen a cómo se toman las decisiones que afectan a su vida.",
    },

    // ── 8 · QUÉ PUEDEN HACER ─────────────────────────────────
    {
      type: "bullets",
      variant: "dark",
      theme: "youth",
      title: "Que las personas jóvenes puedan...",
      bullets: [
        "Ser escuchadas",
        "Pensar juntas",
        "Hacer propuestas",
        "Mejorar su sociedad, de lo local a lo europeo",
      ],
      narration:
        "Que sean escuchadas. Que puedan pensar juntas, hacer propuestas y mejorar la sociedad en la que viven, empezando por su barrio o su pueblo y llegando, si hace falta, hasta Europa.",
    },

    // ── 9 · DECISIONES QUE IMPORTAN ──────────────────────────
    {
      type: "bullets",
      variant: "dark",
      theme: "education",
      title: "Decisiones que no deberían tomarse sin ti",
      bullets: [
        "Educación",
        "Empleo joven",
        "Medio ambiente",
        "Cómo participamos en democracia",
      ],
      narration:
        "Porque las decisiones sobre educación, sobre empleo joven, sobre medio ambiente o sobre cómo participamos en democracia no deberían tomarse sin las personas a las que afectan. La Acción Clave 3 existe, en buena parte, para cerrar esa distancia: para que tú y tus ideas lleguen a quien decide.",
    },

    // ── 10 · EUROPEAN YOUTH TOGETHER ─────────────────────────
    {
      type: "split",
      variant: "dark",
      title: "Juventud Europea Unida",
      text: "European Youth Together. Gestionada por la EACEA, la Agencia Ejecutiva Europea de Educación y Cultura.",
      theme: "youth",
      imagePosition: "left",
      bullets: [
        "Organizaciones juveniles de varios países",
        "Los jóvenes en el centro",
      ],
      narration:
        "¿Y cómo se traduce eso en algo que tú puedas presentar? La Acción Clave 3 abre una puerta con nombre propio: Juventud Europea Unida, European Youth Together en inglés, gestionada por la EACEA, la Agencia Ejecutiva Europea de Educación y Cultura.",
    },

    // ── 11 · LAS CIFRAS ──────────────────────────────────────
    {
      type: "stats",
      variant: "dark",
      theme: "europe",
      title: "De qué hablamos",
      stats: [
        { value: 500, suffix: " K€", label: "Hasta esta cifra por proyecto" },
        { value: 3, suffix: "+ países", label: "Organizaciones juveniles aliadas" },
        { value: 100, suffix: "%", label: "Protagonismo de los jóvenes" },
      ],
      narration:
        "Es una acción pensada para que organizaciones juveniles de varios países trabajen juntas y pongan a los jóvenes en el centro. Y sí: hablamos de proyectos que pueden alcanzar los quinientos mil euros de financiación europea.",
    },

    // ── 12 · EJEMPLO 1 · SALUD MENTAL ────────────────────────
    {
      type: "split",
      variant: "dark",
      title: "Ejemplo 1\nSalud mental",
      text: "Asociaciones juveniles de cinco países escuchan a cientos de jóvenes y llevan sus propuestas a los responsables políticos.",
      theme: "support",
      imagePosition: "right",
      bullets: [
        "5 países unidos",
        "Cientos de jóvenes escuchados",
        "Propuestas a foros locales y europeos",
      ],
      narration:
        "Te pongo un par de ejemplos para que lo veas claro. Imagina un grupo de asociaciones juveniles de cinco países que detectan un mismo problema: la salud mental de los adolescentes. Se unen, escuchan a cientos de jóvenes, recogen sus propuestas y las llevan a la mesa de los responsables políticos de sus ciudades, y también a foros europeos. No es un estudio que les hacen desde fuera: lo construyen los propios jóvenes.",
    },

    // ── 13 · EJEMPLO 2 · ZONAS RURALES ───────────────────────
    {
      type: "split",
      variant: "light",
      title: "Ejemplo 2\nZonas rurales",
      text: "Jóvenes de territorios rurales, que muchas veces se sienten olvidados, diseñan juntos propuestas para mejorar sus oportunidades.",
      theme: "rural",
      imagePosition: "left",
      bullets: [
        "Conectan distintos países",
        "Mejoran las oportunidades de su territorio",
        "Su voz cuenta en decisiones locales y regionales",
      ],
      narration:
        "O imagina otro: chicos y chicas de zonas rurales de distintos países, que muchas veces se sienten olvidados, que se conectan para diseñar juntos propuestas sobre cómo mejorar las oportunidades en sus territorios, y consiguen que su voz cuente en las decisiones locales y regionales.",
    },

    // ── 14 · KA3 EN LA PRÁCTICA ──────────────────────────────
    {
      type: "highlight",
      variant: "dark",
      theme: "youth",
      text: "Jóvenes que dejan de ser espectadores y pasan a proponer, a ser escuchados, a influir.",
      source: "Con recursos de verdad detrás",
      narration:
        "Eso es la Acción Clave 3 en la práctica: jóvenes que dejan de ser espectadores y pasan a proponer, a ser escuchados, a influir. Con recursos de verdad detrás.",
    },

    // ── 15 · QUÉDATE CON ESTA IDEA ───────────────────────────
    {
      type: "bullets",
      variant: "dark",
      theme: "youth",
      title: "Quédate con esta idea",
      bullets: [
        "No va de despachos lejanos",
        "Va de pensar juntas y proponer",
        "De lo local a lo europeo",
        "Mejor financiada de lo que imaginas",
      ],
      narration:
        "Quédate con esta idea. La Acción Clave 3 no va de despachos lejanos. Va de que las personas jóvenes piensen juntas, propongan y mejoren su sociedad, de lo local a lo europeo. Si alguna vez has pensado, ojalá pudiéramos cambiar esto, esta es, probablemente, tu acción. Y puede estar mejor financiada de lo que imaginas.",
    },

    // ── 16 · OUTRO · CTA ─────────────────────────────────────
    {
      type: "outro",
      variant: "dark",
      title: "Ven a conocernos",
      subtitle: "Todas las oportunidades que Europa pone sobre la mesa, para ti",
      cta: "eufundingschool.com",
      narration:
        "Y antes de cerrar, una invitación. Esto es solo una de las muchas oportunidades que Europa pone sobre la mesa. Si quieres conocer todas las que existen para ti, para tu empresa, para tu asociación o para ti como ciudadano, el mejor consejo que puedo darte es sencillo: ven a conocernos. Te esperamos en EU Funding School punto com.",
    },
  ],
};
