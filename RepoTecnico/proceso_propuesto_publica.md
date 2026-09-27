# Proceso propuesto — Bloque 4: Suite Pública

> **Documento de propuesta (NO ejecutada en código).** Registro de decisiones de la entrevista.
> **Fecha**: 2026-09-26 · **Autor**: @asistenteProyecto
> **Continúa a**: bloques 1 (D-1…D-33), 2 (D-34…D-55) y 3 (D-56…D-64).
> **Numeración**: continúa desde **D-65**.
> **Sección del fuente**: 3. Suite Pública (home de marca, catálogo, reventa, reserva con wallet).

---

## 1. Reserva desde la web pública

**D-65 (decisión del cliente, aplicada).** La web **retiene la noche** con los datos de contacto mínimos
(D-55); el huésped recibe **instrucciones para pagar el anticipo off-chain** (transferencia) dentro del
plazo (D-37); la **liquidación se paga con wallet** al comprar el token (D-60). Coherente con D-35, D-36
y D-39.

---

## 2. Contenido de la home

**D-66 (decisión del cliente, aplicada).** **Galería propia del hotel** (fachada, piscina, desayuno…),
independiente de las fotos de habitación, gestionada por el **administrador con wallet** y guardada en el
mismo sistema local (`./docs/imagenes`, nomenclatura `hotel-<seccion>-<fecha>-<n>`).

---

## 3. Contacto

**D-67 (decisión del cliente, aplicada).** Sección de contacto con **dirección, teléfono y email** del
hotel y un **mapa embebido de OpenStreetMap** (sin clave de API ni coste). Cubre el hueco del 3.5
truncado sin añadir dependencias de pago.

---

## 4. Reseñas en la web

**D-68 (decisión del cliente, aplicada).** Las reseñas aprobadas (D-58) se muestran en la **home**
(testimonios destacados) y en cada **ficha de habitación/tipo**, con **nota media y número de reseñas**.

---

## 5. Planes especiales

**D-69 (decisión del cliente, aplicada).** Los «planes especiales» son **escaparates informativos**
(título, texto e imágenes) que el administrador describe en la home; la reserva usa el flujo normal. **Sin
lógica de precios nueva** en esta entrega.

---

## 6. Clasificación y experiencia

**D-70 (decisión del cliente, aplicada).** Se muestra la **categoría del hotel (estrellas)** y una sección
de **experiencia** construida con la galería (D-66), los servicios y las reseñas (D-68). Sin sistema de
valoración por categorías ni sellos externos.

---

## 7. Estructura

**D-71 (decisión del cliente, aplicada).** La **home es una sola página** con secciones ancla (marca,
servicios, estilos, planes, actividades, experiencia, reseñas y contacto); el catálogo, la ficha de
habitación, las actividades y la reventa tienen **páginas propias** (`/catalogo`, `/reventa`, …).

---

## 8. Reserva con wallet

**D-72 (decisión del cliente, aplicada).** La **wallet se conecta al inicio de la reserva**, para
identificar al huésped desde el primer momento. El anticipo se sigue pagando por **transferencia**
(D-65) y la liquidación del 100 % con la wallet ya conectada (D-60/D-39).

---

## 9. Resumen del bloque 4

| Tema | Decisión | Idea clave |
|---|---|---|
| Reserva desde la web | D-65 | Retiene + anticipo por transferencia + liquidación con wallet |
| Galería de la home | D-66 | Galería propia del hotel, gestionada por el admin en `docs/imagenes` |
| Contacto | D-67 | Dirección/teléfono/email + mapa **OpenStreetMap** sin clave |
| Reseñas | D-68 | En home y ficha, con nota media |
| Planes especiales | D-69 | Escaparates informativos, sin precios |
| Categoría y experiencia | D-70 | Estrellas + sección de experiencia (galería/servicios/reseñas) |
| Estructura | D-71 | Home **one-page** + páginas propias (`/catalogo`, `/reventa`, …) |
| Wallet | D-72 | Se conecta **al inicio** de la reserva |

---

*Documento v2 · @asistenteProyecto · bloque 4 con D-65…D-72.*
