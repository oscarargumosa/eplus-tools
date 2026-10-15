# MERCADO · EU Funding Studio

> Ficha de mercado (skill `ir-al-mercado`). Manda sobre cualquier criterio general de copy.
> **v0.1 · 15-oct-2026 · autoborrador** de Claude a partir del código, `docs/playbook/`, la página
> /mision y las notas de mercado de EFS. **Óscar tiene que corregirla**: sobre todo lo marcado `[FALTA]`.

## Changelog
- **v0.1 (15-oct-2026)** — Primera ficha, mínima, para escribir la landing de captación que sustituye
  al modo invitado (Studio deja de explorarse sin cuenta).

## Ficha mínima (6 líneas)

| | |
|---|---|
| **Quién** | Técnicos de proyectos, consultores y entidades (ONG, centros, asociaciones juveniles y deportivas, universidades) que presentan o quieren presentar propuestas europeas, sobre todo Erasmus+. España primero (landing en español). |
| **Qué dolor** | Escribir la propuesta sin haberla diseñado: convocatoria mal elegida, actividades que no encajan con el presupuesto, consorcio por relleno, valor añadido europeo sin evidencia. «Muchos proyectos europeos no fracasan por malas ideas, sino porque su lógica de implementación es incompleta o incoherente» (playbook, Parte III). |
| **Qué usa hoy en vez de esto** | Word + Excel + el portal Funding & Tenders + la Guía del Programa en PDF; a veces un consultor que la escribe por él. No hay software específico de Erasmus+ (ver `project_efs_estrategia_formacion_saas`). |
| **Qué se compra** | Hoy, nada: **crear la cuenta es gratis y no pide tarjeta**; todas las herramientas se usan con ella (la IA tiene límite por hora). Las membresías de /mision (1.200 € / 4.000 € / 15.000 al año) existen como página, pero no hay pasarela. `[FALTA: confirmar cuándo y qué pasa a ser de pago]` |
| **Qué prueba tenemos** | Datos propios verificables en la app: más de 300.000 organizaciones en el directorio (321.703 en dev, 15-oct-2026), 317.559 proyectos Erasmus+ financiados como referencia, Academia con 1 curso de 60 lecciones y certificado verificable. **No hay** testimonios, logos de clientes ni nº de usuarios publicables. `[FALTA: testimonios reales, nº de entidades usando Studio, proyectos presentados con Studio]` |
| **Qué acción queremos** | **Crear cuenta** (una sola acción). «Entrar» solo para quien ya la tiene. |

## Escalón de consciencia (landing «/»)
Escalón 3 — **consciente de la solución**: sabe qué es Erasmus+ y que hay que escribir una propuesta;
duda de la vía. La landing abre con *por qué diseñar antes de escribir* y enseña el método y las
herramientas reales. Quien llega de un enlace interno (`?volver=`) está en el 4-5: solo le falta entrar.

## Voz
Tú, frases cortas, colega experto. `[SIN VOZ DE CLIENTE]`: no hay frases literales de usuarios todavía;
el copy sale del método de Óscar (playbook) y del producto. Recoger 10 frases reales en las próximas
altas (formulario o llamada) y reescribir hero y problema con ellas.

## Lo que NO se promete
- Ganar la convocatoria ni ingresos para la entidad.
- Herramientas que no existen: nota conceptual e invitaciones (D), recomendación automática de roles
  en el consorcio (E), tablón público de visiones con «Me interesa» (U). Se dicen como «próximamente».
- Recorrido completo en todas las convocatorias: hoy el diseño guiado y la redacción con formulario
  van sobre las marcadas «Disponible en Studio» (empezando por las centralizadas; KA2 y Capacity
  Building aparecen como «Próximamente en Studio»).

## Medición
Número: altas confirmadas / visitantes únicos de la landing (eventos `section_view` route=landing y
`cta_click` en `/v1/events`). Umbral: `[FALTA: Óscar fija el objetivo]`; revisar a las 4 semanas del
despliegue con 5 sesiones vistas y las respuestas de las primeras altas, no con A/B.
