# Estructura Web + Facturación — EU Funding School

> Decisión de arquitectura para materializar el proyecto en la web/herramienta.
> Guardado 2026-06-04 para usar **cuando implementemos**. Pendiente de validar el
> bloque fiscal con asesor (PT) + gestor (ES); aquí solo va la parte operativa/web.

## Principio rector

**UN ecosistema web (una marca), DOS carriles de cobro por detrás.**
La entidad que factura NO la decide el dominio, la decide el **producto/flujo** que compra el cliente. El reparto societario vive en el backend de cobro y en la contabilidad, no en webs separadas.

## Entidades y qué factura cada una

| Entidad | Qué factura | Fiscalidad / cobro |
|---|---|---|
| **Bitectura SLU** (España) | **FUNDAE** / formación bonificada a empresas españolas. *Obligatorio entidad española.* | IVA español · serie factura ES · cuenta bancaria ES · Stripe ES · contabilidad ES |
| **Aventure LLC** (EE.UU.) | Todo lo demás: suscripción a la herramienta (SaaS), consultoría/asesoría online, cursos, internacional | Sin IVA US · serie factura US · IVA UE vía **OSS** para B2C digital · cuenta US · Stripe US · contabilidad US |
| **Eudicas** (asociación) | Imagen pública, consorcios, subvenciones. **No** caja comercial. | — |
| **eufundingschool.com** | Marca / nombre comercial (la web). | Registrar marca; licenciar a Bitectura para la línea FUNDAE |

## Arquitectura

```
                 eufundingschool.com  (UNA marca, UNA web, UN login, UN funnel)
                            │
        ┌───────────────────┴───────────────────┐
   Sección FUNDAE                        Resto de productos
   /formacion-bonificada                 (SaaS, consultoría, cursos)
        │                                        │
   Factura: BITECTURA SLU                 Factura: AVENTURE LLC
```

## Las 3 piezas técnicas a implementar

1. **`billing_entity` por producto.** Cada producto/precio del catálogo se etiqueta con su entidad facturadora (`bitectura` | `aventure`).
2. **Checkout enrutado al cobrador correcto.** Dos cuentas de Stripe (una por entidad); el backend elige la cuenta según el `billing_entity` del producto. Invisible para el usuario.
3. **Facturación por entidad.** Plantilla de factura distinta por entidad: nombre legal, CIF/EIN, dirección, IVA y **serie de numeración independiente**.

## Lo que ve el usuario (mínimo)

- **Aviso legal / footer** que nombra ambas entidades y aclara qué presta cada una: "La formación bonificada la presta y factura Bitectura SLU (CIF …); la plataforma y servicios online, Aventure LLC (EIN …)."
- En el **checkout**, el nombre de la entidad que cobra.

## Matices operativos

- **FUNDAE = sección/landing propia** dentro de la misma web (flujo B2B muy distinto: empresa que se bonifica, entidad organizadora, contratos, TC Seguridad Social). Misma marca, embudo propio, facturado por Bitectura.
- **Operador de la plataforma:** lo natural es que la marca + herramienta las explote Aventure (grueso del SaaS) y **Bitectura use la marca bajo licencia** para FUNDAE → contrato de licencia simple entre las propias empresas.
- **Separación limpia obligatoria** aunque la web sea una: cada entidad con su Stripe + banco + contabilidad propios.

## Checklist "para implementar"

- [ ] Modelar `billing_entity` en el catálogo de productos de la herramienta
- [ ] Dar de alta 2 cuentas Stripe (Bitectura ES / Aventure US) y enrutar checkout
- [ ] Plantillas de factura + series de numeración por entidad
- [ ] Registro **OSS** (IVA UE B2C servicios digitales) para Aventure
- [ ] Sección/landing FUNDAE con su embudo
- [ ] Aviso legal/footer con ambas entidades
- [ ] Registrar marca eufundingschool.com (OEPM/EUIPO) + contrato de licencia a Bitectura
- [ ] (Fiscal, con asesor) confirmar fuente-de-renta LLC, dirección efectiva, CFC, OSS — ver nota abajo

## Nota fiscal (pendiente de asesor — NO implementar sin parecer)

Estructura actual: LLC US **disregarded**, ganancias a Óscar, **NHR 0%** como renta extranjera. El punto a blindar por escrito con fiscalista PT: que la renta del trabajo ejecutado **desde Portugal** se acepte como **fuente extranjera** (+ descartar residencia por dirección efectiva y CFC). FUNDAE→Bitectura no se discute. El IVA/OSS es obligación aparte del impuesto sobre la renta.
