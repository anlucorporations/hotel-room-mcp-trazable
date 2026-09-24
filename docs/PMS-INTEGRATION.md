# Recepción y PMS del hotel · registro de viajeros (RD 933/2021)

> **Versión**: 2.0.0 (sustituye a la 1.0.0) · **Fecha**: 2026-09-23 · **Hito**: M9
> **Decisión rectora**: la obligación del RD 933/2021 se cumple **fuera de la plataforma** (D-13, ADR-20)
> **Estado**: la plataforma **no** captura, **no** transmite y **no** almacena datos de viajeros

## 1. Qué hace la plataforma y qué no

| La plataforma **sí** hace | La plataforma **no** hace |
|---|---|
| Validar el resguardo del huésped y **anclar el check-in en la cadena** (`markCheckedIn`, `RECEPTION_ROLE`) | Registrar datos de filiación (nombre, documento, nacionalidad, teléfono) |
| Aceptar una prueba de posesión estricta en la contingencia (dirección de wallet, hash de transacción o **código de resguardo `MDS-…`**) | Enviar nada a SES.HOSPEDAJES ni generar ninguna «ficha policial» |
| Registrar el **motivo** de la contingencia con vocabulario cerrado (`SIN_DISPOSITIVO`, `RESGUARDO_IMPRESO`, `FALLO_TECNICO`, `OTRO`) | Guardar texto libre donde el mostrador pueda escribir un DNI |
| Notificar al PMS que la estancia se ha validado (sin datos personales) | Persistir el contenido de la conversación con el huésped |

La ruta de sincronización **rechaza con 400** cualquier cuerpo que traiga `guestName`,
`documentNumber`, `documentType` o `guestNationality`. Si alguna vez se necesita enviar algo así, no es
un cambio de parámetro: es un cambio de decisión y pasa por el ADR-20.

## 2. Flujo real de recepción

```
Huésped llega al mostrador con su resguardo (QR/JWS o código impreso MDS-…)
        │
        ▼  Escaneo en /recepcion  (personal con sesión válida + RECEPTION_ROLE)
   ¿El resguardo es válido y de un solo uso?  ── no ──► 409 TICKET_YA_USADO / 401 sin firma
        │ sí
        ▼  ¿Otro puesto lo está anclando ahora mismo? ── sí ──► 409 CHECKIN_EN_PROCESO
        │ no
        ▼  Simulación + anclaje on-chain:  HotelNights.markCheckedIn(tokenId)
        │      (firmado por la hot-wallet de recepción; ~41 ms medidos)
        ▼
   Check-in confirmado, con el HASH del ancla en pantalla.
        │
        ▼  El trabajador de fondo consolida el estado en el índice (evento CheckedIn)
        │
        ▼  (Aparte, en el mostrador y en el PMS del hotel)
   Registro de viajeros RD 933/2021: lo captura y lo comunica el hotel, como hoy.
```

**Invariantes comprobados por prueba (E2E M5, 33 comprobaciones):**

1. Sin la firma EIP-712 del titular **no se emite resguardo** (401).
2. El mismo resguardo usado dos veces → **409**; el segundo intento no consume la noche.
3. Dos puestos a la vez con pases distintos → uno ancla y el otro recibe **409** sin gastarle el pase.
4. Un resguardo del dueño anterior **no** consume una noche ya revendida (se comprueba `ownerOf` en la cadena).
5. Un nombre, un teléfono o un DNI **no** pueden satisfacer la prueba de contingencia ni el motivo.
6. La noche queda consumida **exactamente una vez** en la cadena.

## 3. Integración con el PMS del hotel

- **Hoy**: **no hay integración real**. El adaptador existe, no simula fichas policiales y **no conoce**
  datos personales; la sincronización está protegida con `RECEPTION_ROLE` y sin PII.
- **Para conectarlo de verdad** hace falta del cliente (bloqueante **B-5**): qué programa usa el hotel
  (Opera, Cloudbeds, Sihot, API propia…), si expone API o base de datos accesible, con qué credenciales
  y **qué campos** quiere sincronizar.
- **Qué se sincronizaría**: la **validación de la estancia** (habitación, fecha, estado, identificador de
  la noche), nunca la filiación. El «parte de entrada» lo sigue enviando el PMS como lo hace hoy.
- **Si el hotel no puede conectar su PMS**: el registro se sigue haciendo a mano en el mostrador y la
  plataforma no cambia nada de ese procedimiento.
- **Resiliencia**: la plataforma no promete «que ningún registro policial se pierda», porque **no
  participa en ese registro**. Lo que sí garantiza es el check-in: si el ancla falla, el sistema **no**
  da el check-in por bueno y libera el resguardo para reintentar.

## 4. Contingencia sin dispositivo (procedimiento de mostrador)

1. El huésped no puede mostrar el QR. Recepción abre el **check-in de contingencia**.
2. Se pide **una** prueba de posesión, en este orden de preferencia: código de resguardo impreso emitido
   por el hotel (`MDS-…`), hash de la transacción de compra, o la dirección de la wallet del titular.
3. Se elige el **motivo** de la lista cerrada. **No se escribe texto libre.**
4. El anclaje on-chain se hace **igual** que en el camino del QR, con el mismo cerrojo por noche.
5. Si el huésped presenta documento de identidad, **ese documento no entra en la plataforma**: se gestiona
   en el PMS del hotel como cualquier otro registro de viajeros.

---

*PMS y registro de viajeros v2.0.0 · reescrito en M9 · la obligación legal es del establecimiento, fuera del sistema.*
