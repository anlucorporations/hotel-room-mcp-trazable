# Proceso propuesto — Bloque 3: dudas abiertas y cierres técnicos

> **Documento de propuesta (NO ejecutada en código).** Registro de decisiones de la entrevista.
> **Fecha**: 2026-09-26 · **Autor**: @asistenteProyecto
> **Continúa a**: [`proceso_propuesto_habitacion.md`](proceso_propuesto_habitacion.md) (D-1…D-33) y
> [`proceso_propuesto_recepcion.md`](proceso_propuesto_recepcion.md) (D-34…D-55).
> **Numeración**: continúa desde **D-56**.
> **Objeto**: cerrar las deudas declaradas y las tensiones que quedaron abiertas en los bloques 1 y 2.

---

## 1. Roles del personal

**D-56 (decisión del cliente, aplicada).** El rol de **housekeeping y mantenimiento vive en la base de
datos**, ampliando el vocabulario de `admin_users.role` con **`HOUSEKEEPING`** y **`MAINTENANCE`**. Ese
personal entra con **contraseña + TOTP y sin wallet**, reutilizando la autenticación existente. Coherente
con D-49/D-50 (personal sin wallet) y con D-1 (la ficha de habitación sigue siendo del administrador con
wallet).

---

## 2. Inventario: reserva ↔ token

**D-57 (decisión del cliente, aplicada).** **Doble control** para que una reserva y un token no choquen
por la misma noche:

1. Al **crear la reserva** se comprueba que la noche no tenga un token **vendido**; la base de datos ya
   impide dos reservas activas (índice único parcial, D-41) y la aplicación cubre el token.
2. Al **acuñar la ventana** (D-4) se **omiten** las noches con reserva activa.
3. Al **pagar el 100 %** (D-39): si ya existe un token no vendido de esa noche se **asigna**; si no
   existe, se **acuña y se vende** en el mismo acto.

Un único inventario, sin sobreventa ni doble venta.

---

## 3. Reseñas

**D-58 (decisión del cliente, aplicada).** **Moderación previa del administrador con wallet**: toda
reseña nace en `PENDING` y el administrador la **aprueba o rechaza** (con motivo) desde la Suite
Administración. Solo las `APPROVED` se publican.

**D-59 (decisión del cliente, aplicada).** Solo puede reseñar el **titular on-chain de una noche ya
consumida** (`CHECKED_OUT`), acreditado con **firma EIP-712** de su wallet al enviar la reseña
(reutiliza el patrón de ADR-05).

---

## 4. Pagos y notificaciones

**D-60 (decisión del cliente, aplicada).** El **anticipo se cobra off-chain** (mostrador/transferencia)
y se registra en el folio; la **liquidación se paga con wallet on-chain** al comprar el token, y el
anticipo se descuenta. **El contrato no cambia.**

**D-61 (decisión del cliente, aplicada).** Confirmación por **web + email** únicamente. **Telegram queda
para la cuarta versión** (ajusta D-38, que lo incluía).

---

## 5. Arquitectura de información de las pantallas de personal

**D-62 (decisión del cliente, aplicada).** La pantalla móvil del personal de limpieza vive en una **ruta
independiente `/housekeeping`**, fuera de las tres suites, pensada para el móvil y con vista simplificada
por rol (`HOUSEKEEPING`).

**D-63 (decisión del cliente, aplicada).** El técnico trabaja en una **ruta independiente
`/mantenimiento`**, análoga a `/housekeeping`: ve sus tickets asignados y los marca en curso o resueltos.

**D-64 (decisión del cliente, aplicada).** La alerta de stock bajo aparece en **Administración →
Housekeeping → Lencería** (listado de insumos bajo umbral) y se envía **notificación web/email** al
administrador. **No se crea un panel de compras aparte** (compras es de la 3.ª versión, D-33).

---

## 6. Preguntas aplazadas

- **Escaneo axe y alcance de accesibilidad (RNF-15)** en las rutas nuevas: el cliente pidió **preguntarlo
  más adelante**. Queda pendiente y sin número de decisión.

---

## 7. Resumen del bloque 3

| Tema | Decisión | Idea clave |
|---|---|---|
| Rol del personal | D-56 | `HOUSEKEEPING` y `MAINTENANCE` en la BD, sin wallet |
| Reserva ↔ token | D-57 | Acuñar omite reservas; al pagar el 100 % se asigna o se acuña |
| Moderación de reseñas | D-58 | Previa, por el administrador |
| Verificación de reseñas | D-59 | Firma EIP-712 del titular de la noche consumida |
| Pagos | D-60 | Anticipo off-chain + liquidación con wallet; contrato sin cambios |
| Notificaciones | D-61 | Web + email; Telegram a la v4 |
| Pantalla de limpieza | D-62 | Ruta independiente `/housekeeping` |
| Pantalla del técnico | D-63 | Ruta independiente `/mantenimiento` |
| Alertas de suministros | D-64 | Panel de Lencería + notificación |

**Pendiente (aplazado por el cliente):** alcance del escaneo axe en las rutas nuevas.

---

*Documento v2 · @asistenteProyecto · bloque 3 con D-56…D-64 (una pregunta aplazada).*
