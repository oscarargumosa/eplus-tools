import type { LessonData } from "../types";

export const exampleLesson: LessonData = {
  id: "ka2-intro-001",
  title: "Qué es una KA2 Cooperation Partnership",
  category: "Erasmus+ Basics",
  slides: [
    {
      type: "intro",
      variant: "dark",
      title: "¿Qué es una KA2\nCooperation Partnership?",
      subtitle: "Entiende el formato de proyecto más popular de Erasmus+",
      tag: "Erasmus+ Basics",
      durationInSeconds: 6,
    },
    {
      type: "bullets",
      variant: "light",
      title: "Una KA2 en 4 puntos",
      bullets: [
        "Proyectos de cooperación entre organizaciones de distintos países europeos",
        "Duración de 12 a 36 meses con financiación a tanto alzado (lump sum)",
        "Mínimo 3 socios de 3 países diferentes del programa",
        "Enfocados en innovación, intercambio de buenas prácticas y desarrollo de capacidades",
      ],
      durationInSeconds: 10,
    },
    {
      type: "diagram",
      variant: "light",
      title: "El ciclo de un proyecto KA2",
      steps: [
        {
          label: "Diseño",
          description: "Definir idea, socios y presupuesto",
        },
        {
          label: "Solicitud",
          description: "Enviar formulario a la Agencia Nacional",
        },
        {
          label: "Ejecución",
          description: "Implementar actividades y resultados",
        },
        {
          label: "Informe",
          description: "Reportar resultados y justificar gasto",
        },
      ],
      durationInSeconds: 10,
    },
    {
      type: "highlight",
      variant: "accent",
      text: "El 70% de los proyectos Erasmus+ aprobados son KA2 Cooperation Partnerships",
      source: "Comisión Europea, Informe Anual Erasmus+ 2024",
      durationInSeconds: 6,
    },
    {
      type: "bullets",
      variant: "dark",
      title: "¿Quién puede participar?",
      bullets: [
        "Universidades, centros de FP, colegios y escuelas",
        "ONGs, fundaciones y asociaciones sin ánimo de lucro",
        "Empresas, PYMEs y cámaras de comercio",
        "Administraciones públicas locales y regionales",
      ],
      durationInSeconds: 8,
    },
    {
      type: "highlight",
      variant: "dark",
      text: "Una idea, un consorcio fuerte y un buen formulario. Eso es todo lo que necesitas para empezar.",
      icon: "lightbulb",
      durationInSeconds: 6,
    },
    {
      type: "outro",
      variant: "dark",
      title: "Aprende más sobre Erasmus+",
      subtitle: "Más lecciones disponibles en EU Funding School",
      cta: "eufundingschool.com",
      durationInSeconds: 5,
    },
  ],
};
