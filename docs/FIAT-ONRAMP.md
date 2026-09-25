# Pago con tarjeta (fiat on-ramp)

> **Versión**: 2.0.0 (sustituye a la 1.0.0) · **Fecha**: 2026-09-23 · **Hito**: M9
> **Estado**: **camino abierto, sin pasarela contratada y sin conciliación automática**
> **Alcance**: fase posterior (D-11); no forma parte de lo que hoy se declara entregado

## 1. Qué existe hoy en el código

| Pieza | Estado real |
|---|---|
| `GET /api/fiat/session` | Construye la sesión de pago con los parámetros del servicio (`destinationWallet`, importe, `tokenId`) y firma los parámetros |
| `packages/shared/src/fiat-onramp/service.ts` | Servicio con la construcción de URL y la **firma HMAC-SHA256**; el secreto se lee del entorno (antes tenía un valor por defecto: retirado) |
| **Webhook de liquidación** | **No existe**. No hay conciliación automática entre el pago con tarjeta y la emisión/entrega de la noche |
| **Pasarela contratada** | **No**. No hay cuenta de Stripe Crypto Onramp ni de MoonPay, ni claves en el entorno |
| **Pruebas** | El servicio tiene prueba unitaria de la firma y de la forma de la sesión; **no hay prueba de extremo a extremo** porque no hay pasarela con la que hablar |

La versión anterior de este documento describía la entrega automática de POL a la wallet del huésped en
Polygon y la validación de *webhooks* con `timingSafeEqual`. **Nada de eso está implementado**: era una
descripción de intención. Se corrige aquí en vez de dejar que el documento mienta.

## 2. Cómo funcionaría (diseño pendiente de ejecutar)

```
Huésped sin cripto                     Plataforma                        Pasarela
     │                                     │                                │
     │ 1. Pulsa «pagar con tarjeta» ───────►│                                │
     │                                      │ 2. Construye y firma la sesión │
     │◄──── 3. Redirección a la pasarela ───┤                                │
     │                                                                       │
     │ 4. Paga con tarjeta y 3-D Secure ────────────────────────────────────►│
     │                                                                       │
     │                                     │◄── 5. WEBHOOK de liquidación ──┤  ← NO IMPLEMENTADO
     │                                     │ 6. Verifica firma y concilia   │
     │                                     │ 7. Marca la noche para el      │
     │                                     │    comprador y avisa           │
```

Los pasos 1–4 son alcanzables con la pieza actual; **los pasos 5–7 son el trabajo que falta** y son
justamente los que evitan que alguien pague y no reciba su noche.

## 3. Lo que hay que decidir antes de construirlo

1. **Pasarela** (Stripe Crypto Onramp, MoonPay u otra) y quién asume su comisión.
2. **Quién recibe los fondos**: la pasarela entrega cripto a una wallet; si esa wallet es del hotel, el
   hotel se convierte en custodio durante unos segundos y eso **cambia el análisis legal** (ADR-15 y
   `docs/COMPLIANCE.md`). La alternativa sin custodia es que la pasarela entregue **directamente a la
   wallet del comprador** y este firme su compra.
3. **Conciliación**: qué pasa si el pago se completa y la noche se agota antes de que el comprador firme.
   Sin una reserva temporal, ese caso no tiene respuesta buena.
4. **Devoluciones y contracargos**: en una compra on-chain no hay reversión; el procedimiento tiene que
   estar escrito antes de ofrecer tarjeta.

## 4. Postura actual

Mientras no existan las decisiones del punto 3 y la pasarela contratada, **el pago con tarjeta no se
ofrece como funcionalidad entregada**. El camino de compra vigente es con wallet propia, que es el que
tiene E2E real y calldata verificado (ADR-11).

---

*Fiat on-ramp v2.0.0 · reescrito en M9 · describe lo que hay, no lo que se pretendía.*
