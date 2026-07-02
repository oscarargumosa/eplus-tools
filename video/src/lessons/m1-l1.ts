import type { LessonData } from "../types";

// ════════════════════════════════════════════════════════════════
// Módulo 1 · Lección 1 — ¿Qué es Erasmus+? El programa en 10 minutos
// Generado desde data/academy/lessons/M1.1.json (contenido + guion de
// narración). Mismo personaje/voz que el resto del curso.
//
// Cada slide declara un `theme`; assignImages.ts reparte imágenes
// ÚNICAS del banco Pexels y RotatingImage las pasa cada ≤5s.
// ════════════════════════════════════════════════════════════════

export const m1L1Lesson: LessonData = {
  id: "m1-l1-001",
  title: "¿Qué es Erasmus+? El programa en 10 minutos",
  category: "Erasmus+ · Módulo 1 · Fundamentos",
  slides: [
    // ── 0 · HOOK ─────────────────────────────────────────────
    {
      type: "intro",
      variant: "dark",
      title: "¿Qué es\nErasmus+?",
      subtitle: "El programa europeo, explicado en 10 minutos",
      tag: "Módulo 1 · Lección 1",
      theme: "europe",
      narration:
        "Vamos a empezar por el principio, sin prisa. Acabas de oír la palabra Erasmus Plus y, seguramente, te ha sonado a algo enorme, lleno de siglas y de plazos. Quédate conmigo diez minutos, porque te voy a dar un mapa mental que cabe en una sola pantalla. Y cuando lo tengas, el miedo se va.",
    },

    // ── 1 · NO ES SOLO PARA ESTUDIANTES ──────────────────────
    {
      type: "highlight",
      variant: "dark",
      theme: "youth",
      text: "Erasmus+ no es solo para estudiantes de intercambio.",
      source: "Eso es solo una parte pequeña",
      narration:
        "Lo primero, y lo más importante: Erasmus Plus no es solo para estudiantes universitarios que se van de intercambio. Eso es una parte pequeñita. Erasmus Plus es el gran programa de la Unión Europea para financiar proyectos de educación, formación, juventud y deporte.",
    },

    // ── 2 · ES PARA TU ORGANIZACIÓN ──────────────────────────
    {
      type: "split",
      variant: "light",
      title: "Es para tu\norganización",
      text: "Asociaciones, colegios, ayuntamientos, empresas, entidades sociales… si tienes una idea para mejorar algo, hay una puerta para financiarla.",
      theme: "collaboration",
      imagePosition: "left",
      bullets: ["El protagonista no es solo la persona", "También tu entidad"],
      narration:
        "¿Y quién puede pedirlo? Tu organización. Una asociación, un colegio, un ayuntamiento, una empresa, una entidad social. Si tienes una idea para mejorar algo en tu comunidad, hay muchas probabilidades de que Europa tenga una puerta para financiarla.",
    },

    // ── 3 · LA ESCALA ────────────────────────────────────────
    {
      type: "stats",
      variant: "dark",
      theme: "europe",
      title: "De qué tamaño hablamos",
      stats: [
        { value: 26, suffix: " mil M€", label: "Presupuesto para 2021–2027" },
        { value: 4, suffix: " ámbitos", label: "Educación, formación, juventud y deporte" },
        { value: 3, suffix: " acciones", label: "El esqueleto del programa" },
      ],
      narration:
        "Y hablamos de mucho dinero. Para el periodo dos mil veintiuno a dos mil veintisiete, Erasmus Plus maneja más de veintiséis mil millones de euros. Es uno de los mayores programas de la Unión, y cubre cuatro ámbitos: educación, formación, juventud y deporte.",
    },

    // ── 4 · LAS TRES ACCIONES ────────────────────────────────
    {
      type: "diagram",
      variant: "dark",
      title: "Erasmus+ se divide en tres acciones",
      theme: "europe",
      steps: [
        { label: "KA1", description: "Movilidad — mueve personas" },
        { label: "KA2", description: "Cooperación — conecta organizaciones" },
        { label: "KA3", description: "Políticas — da voz a las personas" },
      ],
      narration:
        "¿Cómo se organiza todo eso? Aquí está el mapa. Erasmus Plus se divide en tres grandes acciones clave. Solo tres. Si te quedas con estas tres, ya tienes el esqueleto entero del programa.",
    },

    // ── 5 · KA1 ──────────────────────────────────────────────
    {
      type: "split",
      variant: "dark",
      title: "Acción Clave 1\nMovilidad",
      text: "Financia que las personas se muevan para aprender o formarse en otro país: estudiantes, profesores, jóvenes, personal de una entidad.",
      theme: "travel",
      imagePosition: "right",
      bullets: ["Su protagonista es la PERSONA"],
      narration:
        "La primera, ka uno, es movilidad. Financia que las personas se muevan para aprender o formarse en otro país: estudiantes, profesores, jóvenes, personal de una entidad. Su protagonista es la persona.",
    },

    // ── 6 · KA2 ──────────────────────────────────────────────
    {
      type: "split",
      variant: "light",
      title: "Acción Clave 2\nCooperación",
      text: "Financia que organizaciones de varios países se asocien para crear algo juntas: un método, unos materiales, una herramienta.",
      theme: "collaboration",
      imagePosition: "left",
      bullets: ["Su protagonista es la ORGANIZACIÓN"],
      narration:
        "La segunda, ka dos, es cooperación. Financia que varias organizaciones de distintos países se asocien para crear algo juntas: un método, unos materiales, una herramienta. Su protagonista es la organización.",
    },

    // ── 7 · KA3 ──────────────────────────────────────────────
    {
      type: "split",
      variant: "dark",
      title: "Acción Clave 3\nApoyo a las políticas",
      text: "Financia que la voz de las personas, sobre todo de la gente joven, llegue a quien toma las decisiones.",
      theme: "politics",
      imagePosition: "right",
      bullets: ["Su protagonista eres TÚ"],
      narration:
        "Y la tercera, ka tres, es apoyo a las políticas. Financia que la voz de la gente, sobre todo de la gente joven, llegue a quien toma las decisiones. Su protagonista eres tú, y tu voz.",
    },

    // ── 8 · EL MAPA EN UNA PANTALLA ──────────────────────────
    {
      type: "bullets",
      variant: "dark",
      theme: "education",
      title: "El mapa que cabe en una pantalla",
      bullets: [
        "Arriba: el programa Erasmus+",
        "KA1 mueve personas",
        "KA2 conecta organizaciones",
        "KA3 da voz a las personas",
      ],
      narration:
        "Ese es el mapa que cabe en una pantalla. Arriba, el programa Erasmus Plus. Debajo, sus tres acciones: ka uno mueve personas, ka dos conecta organizaciones, ka tres da voz. Y dentro de cada una, los tipos de proyecto que iremos viendo.",
    },

    // ── 9 · IDEA FUERZA ──────────────────────────────────────
    {
      type: "highlight",
      variant: "dark",
      theme: "support",
      text: "Erasmus+ no es un laberinto. Es un programa con tres puertas.",
      source: "El miedo se va cuando tienes el mapa",
      narration:
        "Quédate con esto: Erasmus Plus no es un laberinto. Es un programa con tres puertas. Y el miedo, casi siempre, se va en el momento en que tienes el mapa delante.",
    },

    // ── 10 · OUTRO · CTA ─────────────────────────────────────
    {
      type: "outro",
      variant: "dark",
      title: "Seguimos en la Lección 2",
      subtitle: "Abrimos el mapa: KA1, KA2 y KA3 para saber cuál es la tuya",
      cta: "eufundingschool.com",
      theme: "youth",
      narration:
        "En la siguiente lección abrimos ese mapa y vemos en detalle ka uno, ka dos y ka tres, para que sepas cuál es la tuya. Nos vemos ahí. Y si quieres conocer todas las oportunidades que Europa tiene para ti, te esperamos en E U Funding School punto com.",
    },
  ],
};
