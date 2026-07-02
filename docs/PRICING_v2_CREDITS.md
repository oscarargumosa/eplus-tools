# Modelo de cobro v2 — Monedero de crédito

*Sesión de pensamiento estratégico Oscar + Claude · 2026-06-03*
*Borrador para revisar y matizar. Revisa la parte de monetización de `PRICING_FRAMEWORK.md` (§5-6 y §11): mantiene la curva del 1%, cambia la unidad de venta de "slot+academia" a "crédito prepagado".*

---

## 0. Cómo leer este documento

Esto NO sustituye a `PRICING_FRAMEWORK.md` entero. Aquel sigue valiendo para la academia, las cohortes y la curva de precios. Lo que cambia aquí es **cómo se cobra el software**: en vez de vender "slot por call con academia incluida", se vende **crédito prepagado en un monedero**. La academia queda aparcada (ver §8).

---

## 1. Decisiones firmes (no se relitigan)

1. **Foco exclusivo en Erasmus+** durante los próximos 2-3 años. Nada de Horizon, LIFE, COSME, etc. Erasmus+ tiene muchas líneas, más sencillas y accesibles, y es donde Oscar tiene experiencia.
2. **Foco en 4 líneas de negocio dentro de Erasmus+** (decidido 2026-06-03). Ver §1bis.
3. **Arranque sin academia.** En vez de formación en vivo: software + mini-formación de uso + **asistente de IA** que resuelve dudas sobre convocatorias, con **tope de tokens mensual**. La academia se piensa más adelante.
4. **El software ya construido es el producto.** La caja no depende de construir las cohortes.

---

## 1bis. NOTA DE FOCO — Las 4 líneas de negocio (2026-06-03)

Dentro de Erasmus+, el foco comercial se concentra en estas **4 líneas** (las más accesibles y donde Oscar tiene ventaja). El catálogo completo con códigos y presupuestos está en `docs/CATALOGO_CALLS_RESUMEN.md`.

| Línea | Qué incluye | Códigos (Topic ID) | Máx. UE |
|---|---|---|---|
| **KA2** | Cooperation (KA220 ×5 sectores) + Small-scale (KA210 ×4 sectores) | `KA220-{SCH,VET,HED,ADU,YOU}-2026` · `KA210-{SCH,VET,ADU,YOU}-2026` | 400k / 60k |
| **KA3** | European Youth Together (EYT) | `ERASMUS-YOUTH-2026-YOUTH-TOG` | 500k |
| **Capacity Building (CB)** | CBHE (11 regiones), CB-VET (6), CB-Youth (4), CB-Sport (1) | `ERASMUS-EDU-2026-CBHE-*` · `...-CB-VET-*` · `ERASMUS-YOUTH-2026-CB-*` · `ERASMUS-SPORT-2026-CB` | 1M / 500k / 300-450k / 200k |
| **Sport** | Small-scale (SSCP), Cooperation (SCP), Eventos (SNCESE), Large-Scale (LSSNCESE) | `ERASMUS-SPORT-2026-{SSCP,SCP,SNCESE,LSSNCESE}` | 60k → 1,5M |

**Fuera de foco por ahora** (grandes centralizadas de excelencia / complejas):
- Partnerships for Excellence: CoVE, Teacher Academies, European Universities, Erasmus Mundus (EMJM).
- Alliances for Innovation (3 lots).
- EPSD (KA240-SCH).
- KA1 (movilidad): se espera a la guía 2028.

*Nota: CoVE estaba contemplado en planes anteriores (`PRICING_FRAMEWORK.md`); esta decisión lo saca del foco inmediato. Dentro de CB, CBHE es la más pesada (90%, strands, 11 regiones); valorar si entra desde el día 1 o más adelante.*

---

## 2. El modelo de cobro: monedero de crédito prepagado

### 2.1 Qué es

El usuario **recarga saldo (dinero)** en un monedero. Cada vez que manda un proyecto a escribir, se descuenta su precio del saldo. No compra "fichas" ni "euros de presupuesto" — compra **crédito en euros**, como el saldo de Uber.

### 2.2 El evento de cobro: Diseñar (gratis) → Activar (de pago)

El muro de pago se pone sobre una costura que **ya existe** en el producto (Diseñar → Escribir → Evaluar):

| Fase | Qué incluye | Coste |
|---|---|---|
| **Diseñar (gratis)** | Abrir proyectos ilimitados, seleccionar socios, montar los Work Packages, ~3 toques de IA para el resumen, descargar resumen + overview presupuestario para armar consorcio | **0 €** |
| **Activar → Escribir** | Botón explícito con confirmación. Consume crédito = precio del proyecto. Si no tiene saldo, paga al momento (just-in-time) | precio del proyecto |
| **Proyecto vivo** | Writer con IA ilimitada + presupuesto detallado y exportable | ya pagado |

**Por qué este momento:** es deliberado e inequívoco (no se cobra por abrir ni por usar). El usuario ya invirtió horas en WPs y presupuesto → aversión a la pérdida → convierte mejor. Cobras en el pico de intención.

**Regla:** la potencia plena de IA está detrás del "Activar". El que no activa solo tiene la fase gratis → no puede quemarte tokens a lo bestia.

### 2.3 El precio de cada proyecto = 1% regresivo (la curva de abril)

El precio NO se mete en cajones S/M/L. Es la **curva continua del 1% regresivo** que ya está calculada en `PRICING_FRAMEWORK` §11. Cada presupuesto tiene su precio exacto. Esto resuelve la enorme variedad de presupuestos de Erasmus+:

| Presupuesto de la call | Precio del proyecto (1%) |
|---|---|
| 30.000 € | 300 € |
| 60.000 € | 600 € |
| 120.000 € | 1.200 € |
| 240.000 € | 2.400 € |
| 400.000 € | 4.000 € |
| 450.000 € | 4.500 € |
| 1.000.000 € | 9.400 € |
| 1.500.000 € | 12.900 € |
| 4.000.000 € | 23.400 € |
| **tope absoluto** | **25.000 €** (por encima → consultivo) |

> El presupuesto lo fija **la convocatoria**, no el usuario → no hay forma de hacer trampa declarando un importe bajo.

### 2.4 El saldo que sobra es un activo (no un problema)

Si recargas y no lo gastas todo, el saldo **rueda** (caducidad generosa, p. ej. 24 meses). Beneficios:

1. **Retención**: "tengo crédito" tira de la gente para volver.
2. **Promociones**: "recarga X y te regalamos Y de saldo".
3. **Margen silencioso (breakage)**: lo que caduca sin gastar es dinero ya cobrado.

Como el precio es continuo y el saldo es dinero (no fichas rígidas), nunca queda "cambio varado": si un proyecto cuesta más que el saldo, se recarga la diferencia.

### 2.5 Bono por recarga (borrador, a afinar)

| Recarga | Bono | Saldo final |
|---|---|---|
| 5.000 € | +5% | 5.250 € |
| 10.000 € | +10% | 11.000 € |
| 20.000 € | +15% | 23.000 € |

El bono es **seguro** porque solo se gasta en software (coste marginal ~0). ⏳ *Escala exacta por decidir.*

---

## 3. Estrategia de precios: anclar alto, subir por fases

Tarifa de referencia al **2%**, precio de arranque ("fundador") efectivo al **1%**, y la subida futura se hace **reduciendo el descuento**, no subiendo el precio base.

| Fase | Cuándo | % efectivo | Ejemplo (KA220 400k) |
|---|---|---|---|
| **Tarifa de referencia** | siempre visible (ancla) | 2,0% | ~~8.000 €~~ |
| **Fundador (lanzamiento)** | primeros clientes / 1er año | 1,0% | **4.000 €** |
| **Fase 2** | tras hito de demanda | 1,4% | 5.600 € |
| **Madurez** | producto consolidado | 1,7–2,0% | hasta 8.000 € |

Reglas para que funcione limpio:
1. **Anunciar la subida desde el día uno** ("precio fundador hasta X") → subir no es una traición, es lo pactado.
2. **Atar la subida a un hito real** (nº de clientes o facturación), no a un countdown falso. Encaja con "subo precio cuando hay demanda".
3. **Respetar a los fundadores** (grandfathering): quien entró al 1% se queda un tiempo.

⚠ **Control de realidad:** el número que tiene que hacer rentable el negocio es el **efectivo (1%)**, no el de tarifa. El 2% es ancla y destino futuro. El 2% es creíble porque la consultoría tradicional cobra más.

⏳ *Por decidir:* qué dispara la subida de fase · hasta dónde sube la madurez (1,5 / 1,7 / 2,0%).

---

## 4. Dos líneas de ingreso SEPARADAS

Decisión: **no fusionar** el crédito con otros servicios. Cada línea, su cobro y su factura.

| Línea | Qué es | Cómo se cobra | Margen |
|---|---|---|---|
| **SaaS** | Crédito para escribir proyectos | Monedero prepago, 1% por proyecto | ~99% (motor) |
| **Servicios profesionales** | Asesoría 1:1, revisión de propuesta, promo premium en buscador, "hecho para ti" | **Factura independiente** por encargo | según el servicio |

**Por qué separado:**
- Contabilidad limpia (una categoría de IVA, ingreso claro, sin trazar "en qué se gastó el crédito").
- Mata el riesgo de margen: el bono de recarga solo toca software (coste ~0), **nunca paga horas humanas a pérdida**.
- Protege el valor de lo premium: una asesoría a precio completo en efectivo señala que es seria.

**Matices:**
- El **monedero de proyectos sigue intacto** — solo se descarta extenderlo a otros servicios.
- Es una **decisión de secuencia, no para siempre**: empezar separado y fusionar en v2 es fácil; al revés es un infierno. La puerta del monedero universal queda abierta.
- **Crédito no reembolsable** (con caducidad generosa) → se puede facturar la recarga como venta SaaS en el momento del ingreso, sin ingreso diferido. *(Confirmar con gestoría.)*

---

## 5. La fase gratis y "la magia"

- La fase de **Diseñar** es gratis y produce un entregable real (resumen + overview presupuestario) que sirve para reclutar consorcio → gancho que les hace volver.
- Para enseñar la potencia del Writer **sin regalar IA**, se pone un **vídeo** dentro de la app que muestra "la magia". Doble uso: conversión dentro + material de difusión fuera (encaja con la estrategia de enseñar mucho cómo trabaja la herramienta).
- ⏳ *Por decidir:* cuánta fidelidad del presupuesto se regala en gratis. Riesgo: si se regala el presupuesto detallado y exportable (la joya), un consultor espabilado se lo lleva y escribe fuera. Propuesta: gratis = resumen + totales; el presupuesto detallado y presentable se desbloquea al activar.

---

## 6. Cómo controlar el consumo de IA

Dos focos de coste, tratados aparte:

1. **Chat-asistente de dudas** → tope de tokens/mes. Simple.
2. **IA de escritura** → blindada porque la potencia ilimitada vive detrás del "Activar" (de pago). En gratis, solo "cata" capada (los ~3 toques del resumen + el vídeo).

Así nadie puede quemar tokens a lo bestia gratis: o está en cata (capado), o ya pagó (y su consumo es coste tuyo trivial, ~0,08–20€/proyecto).

---

## 7. Resumen del modelo en una frase

> **Foco solo en Erasmus+. El software es el producto: diseñas gratis, y al pasar a escribir un proyecto pagas su precio (1% del presupuesto de la call) desde un monedero de crédito prepagado que rueda y premia la recarga. Arranca al 1% con tarifa de referencia del 2% para poder subir sin fricción. Las asesorías y servicios humanos van por una línea aparte, facturados independientes.**

---

## 8. Qué queda aparcado

- **Academia / cohortes / clases en vivo** (`PRICING_FRAMEWORK` §7, §8, §9): no es prioridad. Se sustituye al arranque por mini-formación de uso + asistente IA. Se retoma más adelante.
- **Máster** (`PRICING_FRAMEWORK` §17): aparcado.
- **Monedero universal** (crédito que paga todo el ecosistema): aparcado para v2; se arranca con líneas separadas.

---

## 9. Decisiones abiertas para la reunión

1. **Escala del bono de recarga** (§2.5).
2. **Qué dispara la subida de fase** (nº clientes / facturación / fecha) y **hasta dónde sube** la madurez (§3).
3. **Cuánta fidelidad del presupuesto se regala** en la fase gratis (§5).
4. **Caducidad exacta del crédito** (propuesta: 24 meses) y confirmar tratamiento fiscal con gestoría (§4).
5. **Precio del asistente de IA / tope de tokens mensual** (§1, §6).
6. **Lista de servicios profesionales** y su precio (asesoría 1:1, revisión, promo premium) (§4).

---

*Borrador 2026-06-03. Editar libremente. Cuando se cierre, decidir si se integra en `PRICING_FRAMEWORK.md` o se mantiene como documento separado del nuevo modelo de arranque.*
