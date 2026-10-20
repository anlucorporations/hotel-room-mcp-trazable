# Registro de actividades de tratamiento (art. 30 RGPD)

> **Tipo:** borrador pre-rellenado del registro de actividades de tratamiento (RAT) que acompaña a la
> **DPIA** ([`DPIA-apk-huesped-v1.md`](./DPIA-apk-huesped-v1.md)) y cierra el bloque documental de **H-03**
> de [`INFORME_AUDITORIA_CASOS_USO_V1.md`](../INFORME_AUDITORIA_CASOS_USO_V1.md).
> **Estado:** pendiente de validación por el DPO/asesoría y de completar los datos del responsable.
> **Fecha:** 2026-10-20 · **Revisión prevista:** anual o ante cambio de alcance.

---

## 1. Datos del responsable y del DPO

| Campo | Valor |
|---|---|
| Responsable del tratamiento | Hotel Marina del Sol (entidad concreta **pendiente de confirmar**) |
| Domicilio / contacto | **Pendiente del cliente** |
| DPO / contacto de privacidad | **Pendiente de designar** (obligatorio si el tratamiento lo requiere) |
| Encargados principales | Proveedor de desarrollo/hosting (GCP `europe-west1`), Google (FCM/Play), WalletConnect |
| Documentación relacionada | DPIA, política de privacidad, contratos de encargado, esta ficha |

---

## 2. Actividades de tratamiento

### RAT-01 · Reserva y compra de noches

| Campo | Detalle |
|---|---|
| Finalidad | Gestionar la reserva/compra y la relación contractual de la estancia |
| Base legal | Ejecución de contrato (art. 6.1.b) |
| Interesados | Huéspedes/compradores |
| Datos | Dirección de wallet, token/noche, fechas, importe, estado de la reserva, canal |
| Destinatarios | Personal autorizado, proveedor de hosting; cadena (sin PII) para la titularidad |
| Transferencias | Hosting en EEE (GCP `europe-west1`) |
| Plazo | Duración de la relación + plazos fiscales/contables |
| Medidas | TLS, control de acceso, minimización, sin PII on-chain |

### RAT-02 · Identidad de la wallet y acceso

| Campo | Detalle |
|---|---|
| Finalidad | Identificar al titular para operar y ejercer derechos; prevenir fraude |
| Base legal | Ejecución de contrato + interés legítimo en seguridad (6.1.f) |
| Datos | Dirección de wallet (dato personal vinculable, Cons. 26 RGPD), historial de operaciones |
| Destinatarios | Backend del hotel; proveedor de wallet (no recibe datos del hotel) |
| Plazo | Mientras exista la cuenta/relación y plazos legales |
| Medidas | Pseudonimización en trazas, acceso restringido, DPIA específica |

### RAT-03 · Resguardo QR/JWS y check-in

| Campo | Detalle |
|---|---|
| Finalidad | Emitir el resguardo de la estancia y validar la entrada en recepción |
| Base legal | Ejecución de contrato |
| Datos | Token de la noche, `jti` del pase (un solo uso), fechas; **sin PII** en el pase |
| Destinatarios | Recepción, backend |
| Plazo | Vigencia del pase + registro de consumo |
| Medidas | Firma JWS, consumo atómico en Redis, sin doble uso, almacenamiento cifrado en la app |

### RAT-04 · Avisos por email y push

| Campo | Detalle |
|---|---|
| Finalidad | Notificar eventos de la reserva, reventa, cargos y recordatorios |
| Base legal | Ejecución de contrato para avisos operativos; **consentimiento** para push/marketing (6.1.a) |
| Datos | Email (si se facilita), token FCM, preferencias y consentimientos |
| Destinatarios | Proveedor de email, Google FCM |
| Transferencias | FCM: verificar SCC/DPF |
| Plazo | Mientras el consentimiento esté activo + plazos legales |
| Medidas | Opt-in contextual, baja sencilla, registro de consentimiento |

### RAT-05 · Reseñas

| Campo | Detalle |
|---|---|
| Finalidad | Publicar reseñas verificadas del huésped |
| Base legal | Consentimiento al publicar (6.1.a) |
| Datos | Puntuación, comentario, tipo de habitación; **nunca el número exacto de habitación**; token de la noche para verificar |
| Destinatarios | Público (reseña publicada), personal de moderación |
| Plazo | Hasta retirada/borrado + plazos de conservación |
| Medidas | Moderación previa, pseudonimización, sin PII |

### RAT-06 · Cargos por daños y reclamaciones

| Campo | Detalle |
|---|---|
| Finalidad | Gestionar cargos por daños, avisos y reclamaciones |
| Base legal | Ejecución de contrato + interés legítimo en la defensa de reclamaciones (6.1.f) |
| Datos | Descripción del daño, importe, evidencia fotográfica, notas de reclamación, resolución |
| Destinatarios | Recepción/ama de llaves, asesoría si hay conflicto |
| Plazo | Evidencias **90 días** tras el check-out + plazo legal de reclamaciones |
| Medidas | Evidencia cifrada, URL firmada, acceso mínimo, auditoría |

### RAT-07 · Soporte y ejercicio de derechos

| Campo | Detalle |
|---|---|
| Finalidad | Atender consultas y derechos (acceso, supresión, portabilidad…) |
| Base legal | Obligación legal (6.1.c) + interés legítimo |
| Datos | Identificación por wallet + prueba de control, contenido de la solicitud |
| Destinatarios | Soporte, DPO |
| Plazo | Plazo legal de atención + registro de la solicitud |
| Medidas | Canal verificado, mínimo dato necesario |

### RAT-08 · Seguridad, logs y auditoría

| Campo | Detalle |
|---|---|
| Finalidad | Seguridad del sistema, prevención de fraude y trazabilidad de operaciones |
| Base legal | Interés legítimo (6.1.f) + obligación legal de auditoría |
| Datos | Logs de acceso, trazas pseudonimizadas (HMAC de IP/user-agent), `operator_audit_log`, firmas on-chain |
| Destinatarios | Operadores autorizados, auditoría |
| Plazo | Logs operativos según runbook; auditoría **5 años** (RNF-M-19) |
| Medidas | Append-only, HMAC de trazas, mínimo privilegio, sin PII on-chain |

### RAT-09 · Telemetría y diagnóstico de la app (APK v1)

| Campo | Detalle |
|---|---|
| Finalidad | Detectar fallos y mejorar la app |
| Base legal | **Consentimiento** (opt-in) |
| Datos | Versión, modelo/dispositivo, estado de red, trazas de crash **sin PII** |
| Destinatarios | Proveedor de crash reporting |
| Plazo | 30 días |
| Medidas | Opt-in/opt-out, sin PII, DPA del proveedor |

### RAT-10 · Facturación, fiscalidad y obligaciones legales

| Campo | Detalle |
|---|---|
| Finalidad | Emitir facturas, cumplir obligaciones fiscales y de consumo |
| Base legal | Obligación legal (6.1.c) |
| Datos | Datos de la operación e importe; datos fiscales si el cliente los aporta |
| Destinatarios | Asesoría/gestoría, administración tributaria |
| Plazo | Plazos fiscales/mercantiles aplicables |
| Medidas | Acceso restringido, conservación mínima |

---

## 3. Medidas de seguridad transversales

- **Minimización y no PII on-chain**: solo wallet, precio, fecha, habitación y tipo en la cadena.
- **Acceso**: roles separados (RBAC), MFA/TOTP para operadores, terminal con PIN, mínimo privilegio.
- **Cifrado**: TLS en tránsito, Keystore/EncryptedFile en la app, evidencias cifradas, secretos en GCP
  Secret Manager (fail-fast).
- **Trazabilidad**: `operator_audit_log` append-only con hash encadenado; firmas on-chain verificables.
- **Retención**: tabla de plazos por actividad (§2) y borrado local al desconectar la wallet.
- **Derechos**: canal en app/web, verificación por wallet, plazo de un mes.
- **Encargados**: contratos art. 28 y verificación de SCC/DPF para FCM/WalletConnect.

---

## 4. Acciones para cerrar H-03

1. Completar los datos del responsable/DPO (§1) y validar el RAT con la asesoría.
2. Verificar contratos de encargado y transferencias internacionales (FCM/WalletConnect).
3. Publicar la política de privacidad actualizada (ES/EN/RU) enlazada desde web y app.
4. Revisar este registro y la DPIA **anualmente** o ante cambios (pago in-app, analítica, perfilado).
5. Archivar la evidencia de aprobación en `RepoTecnico/evidencias/`.
