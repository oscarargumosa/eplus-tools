# BRIEFING PARA CLAUDE CODE
## Plataforma SaaS Multi-Módulo — Documento de referencia permanente

> Cuando leas este documento, no empieces a construir nada todavía.
> Primero confirma con el humano en qué paso estamos y qué tarea concreta toca hoy.

---

## 1. QUÉ ESTAMOS CONSTRUYENDO

Una plataforma SaaS donde un usuario se loguea una vez y accede solo a lo que tiene contratado. Puede contratar herramientas, formación, comunidad, o todo. El usuario nunca nota que son sistemas distintos.

**Ecosistema:**
```
PLATAFORMA
├── Auth central          → construir (base de todo lo demás)
├── Herramientas 1-7      → construir (valor diferencial, nadie más las tiene)
├── WordPress + LearnDash → usar (educación no formal)
├── Moodle                → usar y conectar via API (si educación formal reglada)
└── Comunidad             → plataforma externa (Skool, Circle o similar)
```

**Regla de oro del ecosistema:**
> Construir solo lo que nadie más puede construir. Usar soluciones maduras para todo lo demás y conectarlas al auth central.

---

## 2. ARQUITECTURA TÉCNICA

**Stack:**
- PHP → presentación (vistas, formularios, paneles de usuario)
- Node.js → lógica (API REST, auth, procesamiento, automatizaciones)
- MySQL → datos
- phpMyAdmin → gestión visual de BD

**Regla que nunca se rompe:**
> PHP pregunta. Node decide. MySQL recuerda.

PHP nunca contiene lógica de negocio. Node nunca genera HTML. La comunicación es siempre en una dirección: PHP llama a la API de Node, Node responde, PHP muestra el resultado.

**Infraestructura del servidor:**
```
INTERNET
   ↓
COOLIFY         → gestión de dominios, SSL automático, deploys
   ↓
NGINX           → enrutamiento interno entre servicios
   ↓
PHP / NODE.JS   → las apps
   ↓
MYSQL           → datos
   ↓
PM2             → gestión de procesos Node
```

**Servidor:** VPS Ubuntu (IP: ver nota interna del VPS)

**Procesos actuales en PM2 (usuario `claudebot`):**
- `firmas` (id 1)
- `project-app` (id 2)
- `telegram-bot` (id 3)

---

## 3. LOS DOS ENTORNOS DE TRABAJO

**Local-Claude** — Claude Code en el PC del humano. El humano está presente, toma decisiones, revisa, itera. Para construcción activa y decisiones de diseño.

**VPS-Claude** — Claude Code en el servidor. Trabaja solo, sin supervisión. Solo ejecuta tareas donde todas las decisiones ya están tomadas. Nunca toma decisiones ambiguas — si algo no está claro, para y lo registra para el humano.

La diferencia no es el horario. Es quién está al volante.

**Handoff entre entornos:** Existe un archivo de estado que Local-Claude actualiza al terminar cada sesión. Contiene: qué se hizo, qué falta, qué decisiones quedan pendientes para el humano. VPS-Claude lee ese archivo antes de empezar cualquier tarea.

---

## 4. ESTRUCTURA DE REPOS EN GITHUB

| Repo | Tipo | Función |
|---|---|---|
| `core-plataforma` | Estable | Documentación arquitectónica compartida. Solo cambia con decisiones de diseño. |
| `asistente` | Dinámico | Canal de comunicación entre agentes. Estado, handoff, tareas pendientes. |
| `auth-central` | App | Servidor de autenticación JWT. Base de toda la plataforma. |
| `app-1` ... `app-7` | Apps | Una repo por herramienta. |
| `wordpress-site` | App | WordPress + LearnDash, biblioteca, SEO. |

---

## 5. EL CORE — fuente de verdad compartida

Todos los proyectos leen estos archivos antes de tocar nada. Viven en el repo `core-plataforma`. Cuando hay contradicción entre el CORE y cualquier otro archivo, el CORE tiene razón.

| Archivo | Contiene |
|---|---|
| `SCHEMA.md` | Todas las tablas, campos, tipos y relaciones de MySQL de todas las apps. Fuente de verdad de la BD. |
| `DESIGN.md` | Sistema visual compartido: colores, tipografía, espaciados, componentes base. |
| `UX.md` | Patrones de navegación, comportamiento de formularios, estructura de menús, flujos de usuario. |
| `API.md` | Convenciones de endpoints, formato de respuestas JSON, manejo de errores, contratos entre apps. |
| `MOODLE.md` | Estructura de plugins Moodle, patrones de desarrollo, cómo usar su API REST. |
| `CLAUDE.md` | Instrucciones específicas para Claude Code: qué leer, en qué orden, qué no tocar nunca. |

**Regla crítica — flujo del SCHEMA:**
El CORE nunca se edita directamente. Cada app tiene su `SCHEMA.md` local. Al terminar una sesión de trabajo, el agente `schema-sync` detecta los cambios y los propaga al CORE. El flujo es siempre app → CORE, nunca al revés.

---

## 6. AUTH CENTRAL — construir primero

Todo lo demás se apoya en esto. Si se construye una herramienta sin auth y luego se añade, hay que reescribir la capa de usuarios. Con 7 herramientas, ese error se multiplica por 7.

**Qué hace:**
- Registro y login de usuarios
- Emisión y validación de tokens JWT
- Roles y permisos (qué puede ver y hacer cada usuario)
- Gestión de suscripciones (a qué módulos tiene acceso cada usuario)

**Cómo se integra:**
Cada app PHP, antes de mostrar cualquier vista, envía el token del usuario al auth central. Node valida y responde. Si el token no es válido o el usuario no tiene acceso, PHP redirige al login. Moodle y LearnDash se conectan al mismo auth via API.

**Tecnología:** Servicio Node.js dedicado exclusivamente a auth. No hace nada más.

---

## 7. SEGURIDAD

- HTTPS con SSL automático via Coolify (Let's Encrypt)
- Un solo sistema de login para toda la plataforma (JWT desde auth central)
- Roles y permisos gestionados en Node, nunca en PHP
- Rate limiting en todos los endpoints públicos
- Helmet.js para cabeceras de seguridad HTTP
- MySQL solo accesible internamente, nunca expuesto a internet
- phpMyAdmin protegido, nunca en URL pública sin autenticación adicional
- Credenciales y tokens siempre en `.env`, nunca en código
- Variables de entorno por app gestionadas desde Coolify

---

## 8. AGENTES DE CLAUDE CODE

Agentes globales disponibles en todos los proyectos (`~/.claude/agents/`):

| Agente | Herramientas permitidas | Función |
|---|---|---|
| `db-architect` | Read, Grep | Diseña esquemas MySQL, relaciones, índices. Nunca modifica código. |
| `api-builder` | Read, Write, Edit | Crea endpoints Express con validación y conexión MySQL siguiendo API.md. |
| `php-views` | Read, Write, Edit | Vistas y formularios PHP. Nunca añade lógica de negocio. |
| `migrator` | Read, Write | Genera archivos de migración SQL numerados. Nunca los ejecuta. |
| `schema-sync` | Read, Write | Compara schema local de la app con CORE y propaga diferencias. |
| `tester` | Read, Bash | Ejecuta tests y logs de PM2. Reporta solo errores con contexto. |
| `deployer` | Bash | Deploy al VPS, gestión PM2, verificación post-deploy. |
| `moodle-dev` | Read, Write, Edit | Plugins y temas Moodle siguiendo convenciones de MOODLE.md. |
| `handoff` | Read, Write | Actualiza el archivo de estado entre Local-Claude y VPS-Claude. |

---

## 9. BOILERPLATE — qué se reutiliza en cada app nueva

El boilerplate no se diseña — emerge de la primera app construida. Se extrae al terminarla.

**Lo que el boilerplate incluye (universal, ~40% de cada app):**
- Estructura de carpetas
- Conexión al auth central (JWT)
- Conexión MySQL con patrones de query estándar
- Formato de respuestas API siguiendo API.md
- Manejo de errores y logs
- Configuración PM2 y Nginx
- Variables de entorno base (.env.example)
- Scripts de deploy
- Agentes Claude Code heredados del CORE
- CLAUDE.md local con contexto del proyecto

**Lo que nunca se reutiliza (específico de cada app):**
- Tablas y campos propios (SCHEMA local)
- Lógica de negocio en Node
- Vistas y formularios PHP propios
- Roles y permisos específicos de la app
- Endpoints propios

---

## 10. ORDEN DE CONSTRUCCIÓN

```
FASE 0 — Infraestructura base
├── Instalar Coolify en el VPS
├── Migrar las 3 apps actuales (firmas, project-app, telegram-bot)
└── Verificar que todo funciona antes de continuar

FASE 1 — CORE
├── Crear repo core-plataforma en GitHub
├── Redactar SCHEMA.md, DESIGN.md, UX.md, API.md, MOODLE.md, CLAUDE.md
└── Crear repo asistente con estructura de handoff y estado

FASE 2 — Agentes
└── Crear los 9 agentes de Claude Code con sus permisos y prompts

FASE 3 — Auth central
├── Crear repo auth-central
├── Construir servicio Node JWT
└── Probar registro, login, validación de tokens y roles

FASE 4 — Primera herramienta
├── Elegir la más representativa de las 7
├── Construirla sobre el auth central siguiendo el CORE
└── Al terminar, extraer el boilerplate de su estructura

FASE 5 — Boilerplate formal
├── Crear repo boilerplate-base a partir de la primera app
└── Crear new-project.sh que genera estructura completa en minutos

FASE 6 — Herramientas 2-7
└── Cada una arranca desde el boilerplate, sigue el CORE

FASE 7 — Integraciones externas
├── Conectar WordPress + LearnDash al auth central
├── Conectar Moodle al auth central via API
└── Conectar plataforma de comunidad (según solución elegida)
```

---

## 11. LO QUE NUNCA SE HACE

- Empezar una herramienta antes de tener el auth central funcionando
- Construir lo que ya existe (Skool, Moodle, LearnDash, sistema de pagos)
- Editar el SCHEMA del CORE directamente — siempre desde la app via schema-sync
- Poner lógica de negocio en PHP o HTML en Node
- Dejar decisiones ambiguas para VPS-Claude — si hay dudas, para y registra
- Crear sistemas de login separados por app
- Diseñar el boilerplate sin tener antes una app real construida
- Tocar infraestructura del servidor sin verificar que las 3 apps actuales siguen funcionando
