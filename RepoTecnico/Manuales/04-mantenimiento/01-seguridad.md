# 04 · Modelo de seguridad técnico

> **Decisiones normativas**: [ADR-04](../../../docs/adr/ADR-04-autenticacion-password-totp-jwt.md)
> (autenticación), [ADR-05](../../../docs/adr/ADR-05-check-in-on-chain.md) (check-in y resguardo),
> [ADR-06](../../../docs/adr/ADR-06-bootstrap-roles-y-revocacion.md) (roles y revocación),
> [ADR-11](../../../docs/adr/ADR-11-nunca-firmar-tx-no-verificada.md) (punto único de firma),
> [ADR-24](../../../docs/adr/ADR-24-privacidad-y-minimizacion-pii.md) (PII).
> **Regla de diseño transversal**: **fallo en cerrado**. Si falta un secreto, una autorización o un
> dato crítico, el sistema **no hace la operación**: no inventa un valor por defecto ni simula éxito.

## 1. Autenticación del back-office y de recepción

Sistema canónico **único**: contraseña + **TOTP obligatorio** + JWT de 15 min con rotación de *refresh*
y **blocklist** en Redis.

| Paso | Endpoint | Comportamiento |
|---|---|---|
| 1 | `POST /api/auth/login` `{ email, password }` | **200** con reto de MFA · **401** credenciales inválidas · **429** bloqueo temporal (`failed_attempts` / `locked_until`) |
| 2 | `POST /api/auth/mfa/verify` `{ challengeToken, totpCode }` | **200** con `accessToken` y rol · **401** código incorrecto |
| 3 | `POST /api/auth/mfa/setup` | Semilla TOTP (persistida **cifrada**) y códigos de rescate |
| 4 | `POST /api/auth/refresh` | **200** con token nuevo y **rotación** del refresh (hash en base de datos) |
| 5 | `POST /api/auth/logout` | **200**; el access token entra en la **blocklist** y deja de servir |
| 6 | `GET /api/auth/session` | **200** con el rol · **401** sin sesión válida |

Detalles que importan:

- **Contraseñas**: hash **bcrypt**; nunca en claro, nunca con valor por defecto en el código. Las
  credenciales embebidas y el secreto TOTP por defecto (`JBSWY3DPEHPK3PXP`) se **eliminaron**.
- **Semilla TOTP**: cifrada con **AES-256-GCM** (`AES_SECRET_KEY`). Si la clave se rota, las semillas
  existentes **no se pueden descifrar**: hay que reaprovisionar operadores (§6).
- **Códigos de rescate**: hash bcrypt, consumo de uno en uno.
- **Blocklist**: en Redis. Si Redis cae, el `logout` **propaga** el fallo en vez de simular éxito: no
  se finge una revocación que no ha ocurrido. El guard tampoco confunde una caída de Redis con
  credenciales inválidas (devuelve 500, no 401).
- **Autorización por rol**: `/api/admin/**` y `/api/reception/**` exigen sesión **válida** (firma +
  caducidad + blocklist) **y el rol** correspondiente. Sin sesión → **401**; con rol ajeno → **403**.
- **Prueba de extremo a extremo documentada**: token forjado → 401; TOTP incorrecto → 401; token de
  admin en ruta de recepción → 403; **el mismo token después del logout → 401**.

## 2. Roles del contrato y roles de operador

### 2.1 Roles on-chain

| Rol | Quién lo tiene | Para qué |
|---|---|---|
| `DEFAULT_ADMIN_ROLE` | Cuenta de administración del hotel | Conceder y revocar roles, gobernanza |
| `MINTER_ROLE` | Relayer de minteo | `mint` (alta de inventario) |
| `PAUSER_ROLE` | Administración | `pause` / `unpause` |
| `BURNER_ROLE` | **Hot-wallet dedicada de quema** | `burnExpired` |
| `TREASURER_ROLE` | Tesorería | `withdrawFunds` |
| `RECEPTION_ROLE` | **Hot-wallet de recepción** | `markCheckedIn` |

`ROYALTY_ADMIN_ROLE` **desapareció**: el royalty es inmutable y se deriva del tipo de habitación
(ADR-18). No hay parámetro global de royalty que alguien pueda cambiar.

**Separación de funciones**: cada hot-wallet tiene **un solo rol**, y el despliegue hace *handover*:
si el admin definitivo no es el desplegador, se concede `DEFAULT_ADMIN_ROLE` al admin y el
**desplegador renuncia** al suyo. El E2E de M4 lo comprueba on-chain.

**Mapa de nonces**: el servicio de recepción es **singleton por proceso** con cola de nonces, para que
dos check-ins simultáneos en la misma hot-wallet no colisionen.

### 2.2 Roles de operador (base de datos)

`admin_users.role` distingue **`DEFAULT_ADMIN_ROLE`** y **`RECEPTION_ROLE`**. La separación es real y
probada: un token de administración no sirve en una ruta de recepción (403).

Los operadores se aprovisionan con **comando**, no con una ruta HTTP (CU-PR-01):

```powershell
pnpm --filter @hotel/shared provision:admin     -- --username admin@hotel.es
pnpm --filter @hotel/shared provision:reception -- --username recepcion@hotel.es
```

## 3. Firma EIP-712 del titular y resguardo de un solo uso

1. Los **tres** endpoints que emiten el pase —`GET /api/qr/[tokenId]`, su envío por correo y
   `GET /api/wallet/pass/[tokenId]`— exigen la **firma EIP-712 del titular** mediante el helper único
   `requireTicketOwnership`. Sin firma → **401**.
2. El `nonce` es de **un solo uso** (en Redis): un *replay* → **401**. La autorización vale **5 min**.
3. La titularidad se comprueba contra **`ownerOf` on-chain**, no contra el índice: al **emitir** y al
   **canjear**. Si el índice va retrasado, se registra el desajuste. RPC caído →
   **503 `TITULARIDAD_NO_VERIFICABLE`**; token inexistente o quemado → **`TOKEN_QUEMADO`**.
4. El resguardo es un **JWS con `jti` propio**; `verifyTicketJWS` **falla en cerrado** si falta el
   `jti`.
5. El consumo es atómico (`SET NX EX`): el mismo QR dos veces → **409 `TICKET_YA_USADO`**.
6. Un **cerrojo distribuido por noche** (`SET NX EX`, TTL 15 s) impide que dos puestos difundan dos
   anclajes: el segundo recibe **409 `CHECKIN_EN_PROCESO`** sin gastar el resguardo.
7. Si el ancla **no** llega a consumir la noche (RPC caído, wallet sin fondos, noche revendida), el
   resguardo **se libera** para poder reintentar. Si la noche ya estaba consumida, el pase queda gastado.

**Deuda declarada**: ventana residual del cerrojo (15 s) si un anclaje se cuelga; sin traza off-chain
del hash del ancla (`nfts.check_in_tx_hash` no existe).

## 4. Punto único de firma (ADR-11)

Un solo camino de firma, compartido por el catálogo, la reventa y el asistente:

- `verifiedTxRequest` valida **destino**, **importe** y **forma del calldata**.
- Si el destino no es `contractAddress`, **falla en cerrado**. Esto no es un detalle: `buy(uint256)`
  del `HotelMarketplace` **legacy** (retirado del árbol en M9) **compartía selector** con el canónico,
  así que el calldata era byte a
  byte idéntico y **lo único que distingue ambas generaciones es la dirección**.
- La interfaz muestra la revisión (destino, importe, calldata) y se firma **ese mismo objeto**, no uno
  reconstruido.
- `unlist` es la única escritura de reventa sin objeto verificado (no tiene importe): deuda declarada.

El guardián `legacy-target-guardian.test.ts` recorre **todo** `apps/web/src` y falla si aparece un
segundo camino de firma, un ABI legacy o una dirección literal fuera de `config/chain.ts`.

## 5. Manejo de secretos

| Regla | Cómo se cumple |
|---|---|
| **Sin valores por defecto en el código** | `requireSecret()` lanza `MissingSecretError` (CWE-798) y el proceso **no arranca** |
| Secretos obligatorios | `JWT_SECRET`, `AES_SECRET_KEY`, `CHECKIN_SECRET_KEY`, `TICKET_SIGNING_SECRET`, `SESSION_SECRET`, `DATABASE_URL`, `REDIS_URL` |
| Cifrado de credenciales | Semilla TOTP y secreto de check-in con **AES-256-GCM**; contraseñas y códigos de rescate con **bcrypt** |
| Fuera del repositorio | `.env` está ignorado por Git; en producción los secretos se leen de un **gestor de secretos** |
| Generación | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| Vigilancia | `architecture-guardian` (shared) y `secrets-guardian` (web) prohíben literales secretos y respaldos literales de variables secretas |
| Claves de cadena | Las claves de `.env.example` (cuentas 0-3 de Anvil) son **públicas de prueba**: prohibidas en producción |

**Deudas de seguridad declaradas**: el **token de GitLab** que estuvo embebido en la URL del remoto
`gitlab-public` se retiró del repositorio, pero **su revocación en GitLab sigue pendiente del
responsable (B-0)**; `pnpm audit` (SCA) está **sin triar**; el **digest de la imagen de Slither** no
está fijado; y el **HTTP del worker no autentica y su CORS es abierto** (ciérralo o ponlo detrás de la
WAF antes de exponerlo).

## 6. Minimización de PII

| Hecho | Dónde se comprueba |
|---|---|
| La compra es **anónima**: no se piden nombre, documento, correo ni teléfono | `apps/web/src/components/buy/`, `packages/shared/src/domain/purchase-tx.ts` |
| La ruta de PMS **rechaza con 400** `guestName`, `documentNumber`, `documentType` o `guestNationality` | `apps/web/src/app/api/reception/pms-sync/route.ts` |
| La contingencia admite solo prueba de posesión **estricta** (dirección, hash de transacción o código `MDS-…`) y **motivo de vocabulario cerrado** (`SIN_DISPOSITIVO`, `RESGUARDO_IMPRESO`, `FALLO_TECNICO`, `OTRO`) | `packages/shared/src/reception/service.ts` |
| El histórico público no contiene PII: solo wallets, habitación, fecha e importe | `GET /api/sales/history` |
| El push exige **consentimiento** y admite **baja**; se purgan las suscripciones que el servicio ya no reconoce (404/410) | `packages/shared/src/push/` |
| El **registro de viajeros** (RD 933/2021) queda **fuera** de la plataforma: se hace en el mostrador | ADR-20, [`docs/PMS-INTEGRATION.md`](../../../docs/PMS-INTEGRATION.md) |

**Hueco abierto comprobado**: `admin_sessions.ip_address` y `admin_sessions.user_agent` **siguen
guardándose en claro** en cada login, verificación y rotación. Afecta solo a operadores, no a
compradores. Las dos salidas posibles —eliminar las columnas o conservarlas hasheadas con plazo
declarado— están analizadas en ADR-24 y en [`docs/COMPLIANCE.md`](../../../docs/COMPLIANCE.md) §4.

## 7. Qué hacer ante una filtración

Orden de actuación, de lo más urgente a lo más lento:

1. **Contén**: si el vector está vivo (proceso comprometido, fichero `.env` accesible), detén los
   servicios afectados antes de rotar nada. Anota la hora y qué estaba expuesto.
2. **Comprueba el alcance en la cadena**, que es donde está el dinero:

   ```powershell
   cast balance <BURNER_ADDRESS> --rpc-url http://127.0.0.1:8545
   cast balance <RECEPTION_ADDRESS> --rpc-url http://127.0.0.1:8545
   cast call <CONTRACT_ADDRESS> "treasury()(address)" --rpc-url http://127.0.0.1:8545
   cast call <CONTRACT_ADDRESS> "pendingWithdrawals(address)(uint256)" <cuenta> --rpc-url http://127.0.0.1:8545
   ```

3. **Rota los secretos según lo que se haya filtrado**:

   | Secreto filtrado | Qué rota | Consecuencia |
   |---|---|---|
   | `JWT_SECRET` | Genera uno nuevo y reinicia los servicios | Todos los *access tokens* dejan de verificar |
   | `AES_SECRET_KEY` | Genera uno nuevo **y reaprovisiona todos los operadores** | Las semillas TOTP existentes no se pueden descifrar: hay que reemitir `otpauth://` |
   | `TICKET_SIGNING_SECRET` | Genera uno nuevo | Los resguardos ya emitidos dejan de validar |
   | `CHECKIN_SECRET_KEY` | Genera uno nuevo | Falla el descifrado del secreto de check-in heredado |
   | Contraseña de base de datos | Cámbiala en PostgreSQL y en `DATABASE_URL` | Reinicio de todos los servicios |
   | Par VAPID | Genera un par nuevo | Las suscripciones push existentes quedan inservibles: hay que volver a suscribirse |
   | Clave de hot-wallet | **Mueve fondos**, concede el rol a la dirección nueva y **revoca** el rol de la vieja | Requiere firmar con el admin de gobernanza |

4. **Revoca las sesiones vivas** (todas, sin excepción) y obliga a volver a entrar:

   ```powershell
   psql "$env:DATABASE_URL" -c "UPDATE admin_sessions SET revoked = TRUE;"
   ```

   Si sospechas de Redis, reinícialo además de rotar `JWT_SECRET`: los *access tokens* vivos caducan
   como máximo en 15 min, pero no esperes a que caduquen.

5. **Revisa los guardianes y lo que protegen**: `secrets-guardian`, `architecture-guardian` (secretos
   embebidos), `legacy-target-guardian` (segundo camino de firma) y `admin-auth-guardian` (lectura sin
   sesión). Si la filtración pasó **por donde un guardián debería haber visto**, el guardián tiene un
   hueco: añade la sonda de regresión correspondiente.
6. **Revisa la cadena por operaciones no reconocidas**: eventos `Mint`, `Sale`, `Listed`, `CheckedIn`,
   `Burn`, `Withdrawn`, y en particular `Paused`/`Unpaused` y cambios de `treasury` o de
   `minListingPrice`.
7. **Documenta**: si la respuesta cambia una decisión (por ejemplo, mover las claves a un gestor de
   secretos o cerrar el HTTP del worker), entra **primero** el ADR y después el cambio.
8. **Notifica** según corresponda a operadores afectados y, si hubo datos personales de operadores
   (IP, *user agent*), evalúa la obligación de notificación del RGPD con asesoría legal.

---

*Volver a [Mantenimiento](README.md) · [Rendimiento y cobertura](02-rendimiento-y-cobertura.md)*
