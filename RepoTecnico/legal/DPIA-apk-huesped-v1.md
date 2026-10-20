# DPIA — APK Android del huésped (H-03)

> **Tipo:** Evaluación de Impacto relativa a la Protección de Datos (art. 35 RGPD), **borrador pre-rellenado**
> (acompañado del [registro de actividades de tratamiento](./registro-actividades-tratamiento.md), art. 30)
> para cierre del hallazgo **H-03** de [`INFORME_AUDITORIA_CASOS_USO_V1.md`](./INFORME_AUDITORIA_CASOS_USO_V1.md).
> **Estado:** propuesta para revisión del DPO/asesoría. No es un dictamen.
> **Fecha:** 2026-10-20 · **Responsable de tratamiento:** Hotel Marina del Sol (a confirmar la entidad
> concreta) · **Encargados:** proveedor de desarrollo/hosting y subencargados (Google Cloud, FCM, WalletConnect).
> **Alcance:** APK del huésped v1 + backend de la web que la sirve; no incluye back-office ni suites de personal.

---

## 1. ¿Por qué se requiere una DPIA?

El art. 35 RGPD exige DPIA cuando el tratamiento implica **evaluación sistemática de aspectos personales**,
**observación sistemática a gran escala** o **datos de categorías especiales**. En este caso:

- La identidad funcional del huésped es su **dirección de wallet**, que el Considerando 26 del RGPD
  reconoce expresamente como **dato personal potencialmente vinculable** (puede asociarse a una persona
  identificada o identificable, especialmente con historial de compras y estancias).
- Se combinan **datos de estancia** (fechas, habitación/tipo), **titularidad de activos**, datos de
  contacto y **token de notificaciones push**.
- Se usan **servicios de terceros** (Google Play/FCM, WalletConnect) y hay **transferencias** que analizar.

Aunque **no se escriben PII on-chain** (RNF-05), el conjunto off-chain + la dirección pública permiten
perfilar. Por eso: DPIA **previa** al lanzamiento.

---

## 2. Descripción del tratamiento

| Elemento | Detalle |
|---|---|
| **Finalidad** | Prestar el servicio de reserva/compra y uso de noches (descubrimiento, compra, resguardo, check-in, reseñas, cargos), notificar eventos y atender obligaciones legales. |
| **Base legal** | Ejecución de contrato (art. 6.1.b) para la reserva/uso; **obligación legal** (6.1.c) para fiscalidad, consumidores y reclamaciones; **interés legítimo** (6.1.f) para seguridad/fraude; **consentimiento** (6.1.a) para push, telemetría y, si aplica, biometría. |
| **Interesados** | Huéspedes/compradores y portadores de noches; visitantes de la app. |
| **Datos** | (1) Dirección de wallet; (2) titularidad/historial de NFTs-noche; (3) fechas y habitación/tipo de la estancia; (4) token FCM y preferencias; (5) email si se facilita para avisos; (6) datos del resguardo (JWS con `jti`, sin PII on-chain); (7) reclamaciones de cargos (descripción, importe, notas); (8) datos técnicos del dispositivo y diagnósticos (opt-in); (9) consentimientos y su registro. |
| **Origen** | La propia wallet/persona (conexión), la cadena (titularidad/precio), el backend del hotel (reserva/estancia) y el dispositivo (token push, diagnósticos). |
| **Destinatarios** | Personal autorizado del hotel; proveedor de hosting (GCP `europe-west1`); **Google FCM** (push); **WalletConnect** (relay de firma); **Google Play** (distribución). |
| **Transferencias internacionales** | FCM/WalletConnect pueden procesar fuera del EEE: verificar mecanismos (SCC/DPF) y documentarlos en el registro de actividades. |
| **Retención** | Reserva/cargos: mientras dure la relación + plazos legales (fiscalidad/consumo). Resguardo/tokens locales: hasta cierre de sesión/desconexión. Push/telemetría: mientras el consentimiento esté activo. Evidencias de daños: **90 días** tras el check-out (RNF-M-10). Diagnósticos: 30 días. |
| **Derechos** | Acceso, rectificación, supresión, oposición, portabilidad y limitación; canal en la app + web; verificación por wallet + prueba de control. |

---

## 3. Necesidad y proporcionalidad

| Principio | Medida |
|---|---|
| **Minimización** | Sin PII on-chain; la app no pide nombre/DNI; email solo si el huésped lo facilita; diagnósticos sin PII. |
| **Limitación de finalidad** | Cada dato tiene una finalidad declarada; no se usa para marketing sin consentimiento. |
| **Exactitud** | Datos de estancia desde el backend del hotel; corrección por soporte. |
| **Limitación del plazo** | Tabla de retención §2; borrado local al desconectar. |
| **Integridad/confidencialidad** | Keystore/EncryptedFile, biometría, JWT/cookies HttpOnly, TLS, mínimo privilegio en backend, logs sin PII. |
| **Responsabilidad proactiva** | Registro de actividades, esta DPIA, revisión anual y contratos de encargado con proveedores. |

---

## 4. Riesgos y mitigaciones

| # | Riesgo | Prob. | Impacto | Mitigación | Riesgo residual |
|---|---|---|---|---|---|
| DP-1 | **Linkabilidad** de la wallet con la persona (historial, estancia, reseñas) | Alta | Alto | No publicar PII on-chain; pseudonimizar trazas; minimizar datos off-chain; no mostrar wallet completa en la app (abreviada); control de acceso | **Medio** |
| DP-2 | Re-identificación por combinación de datos (fechas + habitación + wallet) | Media | Alto | Acceso restringido a personal; evidencias cifradas; retención corta; sin exportaciones abiertas | **Medio** |
| DP-3 | Acceso no autorizado al resguardo/tokens del dispositivo | Media | Alto | Bloqueo biométrico obligatorio + Keystore; borrado al desconectar; sesión corta | **Bajo** |
| DP-4 | Interceptación en tránsito | Baja | Alto | TLS obligatorio; `networkSecurityConfig` sin tráfico claro; validación de host en deep links | **Bajo** |
| DP-5 | Push no consentida o excesiva | Media | Medio | Opt-in contextual, preferencias y baja; registro del consentimiento | **Bajo** |
| DP-6 | Telemetría con datos personales | Media | Medio | Opt-in, sin PII, retención 30 días y proveedor con DPA | **Bajo** |
| DP-7 | Transferencias internacionales sin garantías | Media | Medio | Verificar SCC/DPF de FCM/WalletConnect y documentar | **Medio** |
| DP-8 | Ejercicio de derechos difícil por identidad wallet | Media | Medio | Canal in-app + verificación por firma; plazo 1 mes | **Bajo** |
| DP-9 | Menores usando la app sin control | Baja | Alto | Edad mínima en términos; no dirigida a menores; sin perfilado publicitario | **Medio** |
| DP-10 | Conservación excesiva de reclamaciones/evidencias | Media | Medio | Retención 90 días de evidencias + plazos legales; borrado programado | **Bajo** |

**Riesgo global residual:** **MEDIO**, aceptable con las medidas previstas y sujeto a aprobación del DPO.
Sin tratamiento de categorías especiales (art. 9) en v1; la biometría la ejecuta el **sistema operativo**
(la app solo recibe el resultado "autenticado/no", no plantillas biométricas).

---

## 5. Consulta y aprobación

| Paso | Estado |
|---|---|
| Identificación de necesidades y flujos (§2) | **Hecho** (este borrador) |
| Revisión del DPO / asesoría | **Pendiente** |
| Consulta a la AEPD (solo si el riesgo residual fuese alto) | **No procede** con el residual actual |
| Registro de actividades de tratamiento (art. 30) | **Pendiente** de completar con esta DPIA |
| Contratos de encargado (GCP, FCM, WalletConnect) | **Pendiente** de verificar/actualizar |
| Aprobación y firma | **Pendiente** |

---

## 6. Plan de acción para cerrar H-03

1. Validar §2–§4 con el DPO y corregir lo que proceda.
2. Completar el **registro de actividades** y la tabla de **retención** en `docs/` + `PRD`.
3. Verificar **SCC/DPF** de FCM y WalletConnect y anexar evidencia.
4. Publicar la **política de privacidad** actualizada (ES/EN/RU) con: identidad del responsable, bases
   legales, destinatarios, transferencias, plazos, derechos y canal de reclamación.
5. Registrar el consentimiento de push/telemetría y su retirada; documentar el flujo de derechos.
6. Repetir la DPIA si cambia el alcance (p. ej., si se activa la compra dentro de la app con Play Billing,
   pasarela de pago o perfilado).

**Criterio de cierre:** DPIA aprobada por el DPO, registro de actividades completo, política publicada y
evidencia de las verificaciones de encargados/transferencias.
