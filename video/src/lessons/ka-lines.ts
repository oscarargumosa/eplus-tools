import type { LessonData } from "../types";

export const kaLinesLesson: LessonData = {
  id: "ka-lines-001",
  title: "Las 3 líneas de Erasmus+: KA1, KA2 y KA3",
  category: "Erasmus+ Basics",
  slides: [
    // ── INTRO ────────────────────────────────────────────────
    {
      type: "intro",
      variant: "dark",
      title: "Las 3 líneas de\nErasmus+",
      subtitle: "De 60.000€ hasta 4 millones. Tres caminos muy distintos.",
      tag: "Erasmus+ Basics",
      narration:
        "Erasmus Plus financia proyectos desde sesenta mil euros hasta cuatro millones. Tiene tres líneas de acción, tres caminos muy distintos. Vamos a ver qué las diferencia.",
      durationInSeconds: 7,
    },

    // ── KA1: MOVILIDAD ───────────────────────────────────────
    {
      type: "split",
      variant: "dark",
      title: "KA1\nMovilidad",
      text: "Personas que viajan para aprender. Profesores, estudiantes de FP, jóvenes. El presupuesto se calcula por persona y por día.",
      imageUrl:
        "https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1920&q=80",
      imagePosition: "right",
      bullets: [
        "Cursos de formación en el extranjero",
        "Prácticas en empresas europeas",
        "Intercambios juveniles",
        "De 60.000€ a 120.000€ por proyecto",
      ],
      narration:
        "KA1 es movilidad. Personas que viajan para aprender. Un profesor que hace un curso en Finlandia, un estudiante de FP que hace prácticas en Alemania, un grupo de jóvenes que participa en un intercambio en Portugal. El presupuesto se calcula por persona y por día. Un proyecto típico de KA1 puede ir de sesenta mil a ciento veinte mil euros dependiendo del número de movilidades.",
      durationInSeconds: 14,
    },

    // ── EJEMPLOS KA1 ─────────────────────────────────────────
    {
      type: "image",
      title: "Ejemplos KA1",
      imageUrl:
        "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=1920&q=80",
      caption:
        "15 alumnos de FP a prácticas en Italia · 4 profesores en job shadowing en Dinamarca",
      narration:
        "Ejemplo uno: un instituto de FP envía a quince alumnos a hacer prácticas en empresas italianas durante tres meses. Ejemplo dos: un colegio organiza un job shadowing para que cuatro profesores observen métodos de enseñanza en Dinamarca durante una semana.",
      durationInSeconds: 12,
    },

    // ── KA2: COOPERACIÓN ─────────────────────────────────────
    {
      type: "split",
      variant: "light",
      title: "KA2\nCooperación",
      text: "Organizaciones de distintos países que trabajan juntas para crear algo nuevo. Manuales, herramientas digitales, metodologías, cursos.",
      imageUrl:
        "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=1920&q=80",
      imagePosition: "left",
      bullets: [
        "Mínimo 3 socios de 3 países",
        "Presupuesto a tanto alzado",
        "120.000€ — 400.000€",
        "Duración: 1 a 3 años",
      ],
      narration:
        "KA2 es cooperación. Organizaciones de distintos países que trabajan juntas para crear algo nuevo. Un manual, una herramienta digital, una metodología, un curso. El presupuesto va desde ciento veinte mil hasta cuatrocientos mil euros a tanto alzado. Los proyectos duran entre uno y tres años.",
      durationInSeconds: 14,
    },

    // ── EJEMPLOS KA2 ─────────────────────────────────────────
    {
      type: "split",
      variant: "dark",
      title: "Ejemplos KA2",
      text: "4 universidades (ES, FR, PL, GR) crean una plataforma online de competencias digitales para profesores.",
      imageUrl:
        "https://images.unsplash.com/photo-1509062522246-3755977927d7?w=1920&q=80",
      imagePosition: "right",
      bullets: [
        "Capacity Building: Europa + Latinoamérica + África",
        "Empresas, ONGs y colegios transfieren conocimiento",
        "Fortalecen capacidades en otras regiones del mundo",
      ],
      narration:
        "Ejemplo uno: cuatro universidades de España, Francia, Polonia y Grecia crean juntas una plataforma online para enseñar competencias digitales a profesores. Ejemplo dos: un Capacity Building entre entidades europeas y organizaciones de Latinoamérica y África. Empresas, ONGs y colegios que colaboran para transferir conocimiento y fortalecer capacidades en otras regiones del mundo.",
      durationInSeconds: 16,
    },

    // ── CoVE HIGHLIGHT ───────────────────────────────────────
    {
      type: "stats",
      variant: "accent",
      title: "CoVE: Centros de Excelencia en FP",
      stats: [
        { value: 4, suffix: "M€", label: "Presupuesto máximo" },
        { value: 8, suffix: "+", label: "Socios de varios países" },
        { value: 3, suffix: " años", label: "Duración del proyecto" },
      ],
      narration:
        "Y luego están los CoVE, los proyectos estrella de KA2. Centros de Excelencia en FP donde empresas, centros de formación profesional, ONGs y cámaras de comercio se unen para mejorar la formación profesional. Estos proyectos pueden alcanzar los cuatro millones de euros.",
      durationInSeconds: 12,
    },

    // ── KA3: JUVENTUD Y POLÍTICA ─────────────────────────────
    {
      type: "split",
      variant: "dark",
      title: "KA3\nJuventud y\nReforma Política",
      text: "Acercar a los jóvenes a la participación social y política. Generar propuestas de reforma de políticas públicas.",
      imageUrl:
        "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1920&q=80",
      imagePosition: "left",
      bullets: [
        "Participación juvenil activa",
        "Diálogo con decisores políticos",
        "Presupuesto: hasta 500.000€",
      ],
      narration:
        "KA3 es participación y reforma política. Proyectos que acercan a los jóvenes al interés por la participación social y política, y que generan propuestas para reformar políticas públicas. El presupuesto puede llegar hasta quinientos mil euros.",
      durationInSeconds: 12,
    },

    // ── EJEMPLO KA3 ──────────────────────────────────────────
    {
      type: "image",
      title: "Ejemplo KA3",
      imageUrl:
        "https://images.unsplash.com/photo-1577962917302-cd874c4e31d2?w=1920&q=80",
      caption:
        "5 países · ONGs + ayuntamientos · Debate sobre ODS · Ideas para el Parlamento Europeo",
      narration:
        "Ejemplo: cinco países con ONGs y ayuntamientos locales organizan formaciones en debate sobre políticas de Objetivos de Desarrollo Sostenible. Los jóvenes participantes preparan un borrador de ideas para presentar en el Parlamento Europeo.",
      durationInSeconds: 12,
    },

    // ── COMPARATIVA ──────────────────────────────────────────
    {
      type: "stats",
      variant: "dark",
      title: "Tres caminos, una puerta",
      stats: [
        { value: 120, suffix: "K€", label: "KA1 — Mueve personas" },
        { value: 4, suffix: "M€", label: "KA2 — Crea productos" },
        { value: 500, suffix: "K€", label: "KA3 — Cambia políticas" },
      ],
      narration:
        "En resumen: KA1 mueve personas, desde sesenta mil euros. KA2 crea productos y capacidades, hasta cuatro millones. KA3 impulsa la participación y cambia políticas, hasta quinientos mil. Tres caminos, una misma puerta: Erasmus Plus.",
      durationInSeconds: 12,
    },

    // ── OUTRO ────────────────────────────────────────────────
    {
      type: "outro",
      variant: "dark",
      title: "Elige tu línea de acción",
      subtitle: "Y empieza a diseñar tu proyecto Erasmus+",
      cta: "eufundingschool.com",
      narration:
        "Elige la línea que mejor encaje con tu organización. Y si necesitas ayuda, estamos en EU Funding School.",
      durationInSeconds: 6,
    },
  ],
};
