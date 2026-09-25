# Marco regulatorio, fiscal y de cumplimiento

## Hotel Marina del Sol — plataforma de noches tokenizadas

> **Versión**: 2.0.0 (sustituye a la 1.0.0) · **Fecha**: 2026-09-23 · **Hito**: M9
> **Estado**: **descripción del sistema real y de sus obligaciones**, validada contra el código
> **Advertencia de alcance**: este documento **no es un dictamen jurídico**. El análisis de calificación
> de criptoactivos (MiCA) y el tratamiento fiscal **deben ser revisados y firmados por un abogado y un
> asesor fiscal** antes de cualquier venta al público (fase posterior, decisión D-11). Lo que sigue es
> la descripción técnica verificable sobre la que ese dictamen debe pronunciarse.

---

## 1. Qué hace el sistema con los datos y con el dinero (base del análisis)

| Hecho verificable | Dónde se comprueba |
|---|---|
| La compra es **anónima**: no se piden nombre, documento, correo ni teléfono al comprador | `apps/web/src/components/buy/`, `packages/shared/src/domain/purchase-tx.ts` |
| La plataforma **no acepta ni devuelve datos de filiación**: la ruta de PMS responde **400** si el cuerpo trae `guestName`, `documentNumber`, `documentType` o `guestNationality` | `apps/web/src/app/api/reception/pms-sync/route.ts` |
| El camino de contingencia del check-in solo admite un **patrón estricto** de prueba de posesión (dirección, hash de transacción o código `MDS-…`) y un **motivo de vocabulario cerrado** | `packages/shared/src/reception/service.ts` |
| Los cobros son **por retirada** (`claim()` sobre `pendingWithdrawals`), no por envío automático: el contrato acredita y el titular retira | `packages/contracts/src/HotelNights.sol`, ADR-15 |
| El hotel **no custodia claves ni fondos** de los compradores: cada usuario firma desde su propia wallet | ADR-11 |
| El royalty es **por tipo de habitación y fijado en el mint**, sin parámetro global modificable | ADR-18 |
| No se almacenan IP ni *user agent* en claro; el push exige consentimiento y admite baja | ADR-24 |

---

## 2. Calificación del activo bajo el Reglamento (UE) 2023/1114 (MiCA)

**Criterio técnico** (a validar por asesoría jurídica):

1. **No es un instrumento financiero (MiFID II).** El token confiere un derecho de hospedaje físico y
   temporal en una habitación y fecha determinadas; no da derechos de crédito, dividendos, participación
   en beneficios ni liquidación patrimonial.
2. **No es un *token* referenciado a activos (ART)** ni un *token* de dinero electrónico (EMT): no
   referencia cestas de activos ni está denominado en una divisa con obligación de reembolso a la par.
3. **Calificación propuesta**: criptoactivo distinto de ART y EMT (Título II de MiCA), **no fungible** y
   representativo de una reserva hotelera concreta.

> **Gate de fase pública**: la comercialización al público en una red pública exige el dictamen firmado,
> la información precontractual correspondiente y la política de custodia. **Hoy no se declara
> cumplido**: el sistema funciona en una red local de desarrollo y no se vende al público (D-01, D-11).

---

## 3. Custodia y gobernanza

- **Auto-custodia por el usuario.** Nadie en la plataforma puede mover ni bloquear los fondos de un
  comprador: las transacciones las firma su wallet, y la aplicación solo **construye y verifica** el
  objeto que el usuario aprueba (ADR-11). El servidor **no firma compras**.
- **Cobros por retirada.** El precio de una reventa se acredita en el contrato a favor del vendedor y del
  hotel, y cada uno lo retira con `claim()`. Un receptor problemático **no puede bloquear** una reventa
  (ADR-15); es exactamente el escenario que se probó en el E2E de M4.
- **Gobernanza del contrato.** `DEFAULT_ADMIN_ROLE` **no** queda en el desplegador: el despliegue lo
  revoca y lo asigna a la dirección de administración designada (ADR-06). El destino final es un
  **Gnosis Safe 2-de-3** (`docs/GUIA-GNOSIS-SAFE.md`), **pendiente** de que el cliente designe los dos
  firmantes y la política de custodia de claves (B-7).
- **Roles operativos segregados.** `MINTER_ROLE`, `BURNER_ROLE`, `PAUSER_ROLE`, `TREASURER_ROLE` y
  `RECEPTION_ROLE` usan cuentas separadas con privilegio mínimo; no se reutilizan entre sí.

---

## 4. Protección de datos (RGPD — Reglamento UE 2016/679)

| Principio | Cómo se cumple |
|---|---|
| **Minimización (art. 5.1.c)** | No se recogen identificadores personales de viajeros; la wallet es un pseudónimo y el correo solo se usa para el aviso de la compra. La traza de acceso de los operadores (IP y *user agent*) se guarda **pseudonimizada con HMAC-SHA256 bajo clave** (`hmac-sha256:…`), no en claro: sirve para reconocer repeticiones, no para leer el dato |
| **Licitud y consentimiento** | Las notificaciones push exigen consentimiento explícito y el navegador puede revocarlo; la plataforma purga las suscripciones que el servicio ya no reconoce (404/410) |
| **Limitación de conservación (art. 5.1.e)** | **Los plazos se ejecutan**, no solo se declaran: un planificador del worker borra cada 6 h las **sesiones caducadas** (la traza desaparece con la fila, retención efectiva = 7 días, el plazo del refresh), los **códigos de rescate de operadores que ya no existen** y las **notificaciones enviadas con más de 90 días** (`packages/shared/src/maintenance/retention.ts`, `apps/worker/src/retention-scheduler.ts`). El histórico público no contiene datos personales |
| **Seguridad (art. 32)** | Secretos fuera del código con fallo en cerrado; semilla TOTP y secretos de sesión **cifrados con AES-256-GCM**; contraseñas con **bcrypt**; traza de sesión con **HMAC** (clave `SESSION_TRACE_SECRET`); acceso con doble factor obligatorio; JWT de 15 min con revocación efectiva |
| **Cifrado de credenciales** | Las claves viven en el entorno (`AES_SECRET_KEY`, `SESSION_TRACE_SECRET`), no en el repositorio; en despliegue público deben leerse de un gestor de secretos |
| **Registro de accesos** | Logging estructurado JSON con identificadores de operación; **sin** Sentry (decisión D-12) |

> **Corrección respecto a la versión anterior de este documento**: afirmaba que se almacenaba un
> `checkInSecret` cifrado como mecanismo de validación. El camino vigente del resguardo es un **JWS con
> `jti` de un solo uso** más la **firma EIP-712 del titular** contra `ownerOf` on-chain (ADR-05); la
> columna `check_in_secret_enc` sigue poblándose por el indexador pero el pase ya no la usa, y su
> retirada es deuda declarada (SRS §11).

> **Hueco CERRADO en M9 (decisión del responsable)**: la tabla `admin_sessions` guardaba la IP y el
> *user agent* **en claro** en los accesos de operadores. Ahora se almacenan **pseudonimizados con
> HMAC-SHA256 bajo clave** (`hmac-sha256:<64 hex>`), la traza desaparece al caducar el refresh (7 días,
> por el planificador de retención) y las filas anteriores se migraron con
> `pnpm --filter @hotel/shared backfill:session-traces`. Los compradores nunca se vieron afectados:
> la compra sigue siendo anónima. Detalle y consecuencias en ADR-24 §«Traza de sesiones».


---

## 5. Registro de viajeros (RD 933/2021)

- **La obligación es del establecimiento** y se cumple **en el mostrador**, con el PMS del hotel,
  comunicando a SES.HOSPEDAJES lo que la norma exige (ADR-20).
- **La plataforma no participa** en esa captura: no la solicita, no la recibe y no la almacena. La ruta
  de sincronización con el PMS rechaza explícitamente cualquier dato de filiación y está protegida con
  `RECEPTION_ROLE`.
- Si el hotel no dispone de un PMS conectable, el registro se sigue haciendo **a mano** como hoy; la
  plataforma no cambia ese procedimiento.

---

## 6. Fiscalidad (España) — puntos a confirmar por asesoría

Los siguientes puntos son **criterios de trabajo, no conclusiones**:

1. **IVA de la venta primaria**: prestación de servicios de alojamiento (tipo reducido del 10 % según el
   art. 91.uno.2.2ª LIVA). El devengo se produce con el cobro anticipado del precio. La factura
   simplificada puede emitirse con el identificador del token y el hash de la transacción; la factura
   ordinaria completa se expide a solicitud del cliente con su NIF.
2. **Royalty del hotel**: se integra en la base del Impuesto sobre Sociedades como ingreso de
   explotación. Su tratamiento a efectos de IVA (¿cesión de uso de plataforma? ¿servicio de gestión?)
   **debe confirmarlo el asesor**: no se declara una solución.
3. **Reventas entre particulares**: el sobreprecio puede generar ganancia patrimonial en el IRPF del
   vendedor. La plataforma **no practica retenciones** ni actúa como intermediario financiero.
4. **Gas**: en la fase pública, el coste de gas de la compra y de la reventa lo paga quien firma la
   transacción (el usuario); el hotel paga el alta de inventario y la quema. Este reparto es también una
   decisión de producto (D-17).

---

## 7. Obligaciones de la fase pública (checklist para el dictamen)

- [ ] Dictamen jurídico firmado sobre la calificación MiCA del activo y del modelo.
- [ ] Información precontractual al comprador (naturaleza del token, no reembolsable, condiciones de
      reventa, riesgo de pérdida de la clave).
- [ ] Política de custodia de claves de las wallets operativas y del multisig, con responsables nombrados.
- [ ] Tratamiento fiscal confirmado (IVA de primaria y royalty, IRPF de reventas) y circuito de facturación.
- [ ] Revisión de Privacidad y Términos publicados contra el sistema realmente desplegado.
- [ ] Contrato con el proveedor de RPC, dominio y correo, con sus condiciones de tratamiento de datos.
- [ ] Presupuesto de gas medido (no estimado) para el alta de inventario y la quema.

---

*COMPLIANCE v2.0.0 · reescrito en M9 · describe el sistema real; el dictamen jurídico es de la fase pública.*
