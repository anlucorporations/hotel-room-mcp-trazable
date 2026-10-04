# Inyección de datos de la plataforma (`@inyectaDatos`)

> **Para qué sirve**: dejar el entorno local con una **topología de cuentas clara** y datos reales
> (noches, ventas, reventas y operadores) para poder probar la web, el panel y la recepción sin
> inventarse nada a mano.
> **Comando**: `pnpm --filter @hotel/contracts inject:data`
> **Requisitos**: Anvil en marcha (`anvil --chain-id 81234`) y el contrato desplegado (`pnpm deploy:anvil`).

---

## 1. Las cuatro cuentas

Son las cuentas de desarrollo que Anvil imprime al arrancar: **vectores públicos de prueba**, no
secretos. Viven en `packages/contracts/scripts/dev-accounts.ts` para que todos los guiones usen la
misma topología.

| # | Dirección | Papel | Roles on-chain que le corresponden |
|---|---|---|---|
| **0** | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | **Desplegador y tesorería** (`treasury`) | ninguno tras el *handover* del despliegue |
| **1** | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | **Administrador con wallet** (back-office) | `DEFAULT_ADMIN_ROLE`, `MINTER_ROLE`, `PAUSER_ROLE` y `TREASURER_ROLE` |
| **2** | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | **Hot-wallet de quema** | `BURNER_ROLE` |
| **3** | `0x90F79bf6EB2c4f870365e785982E1f101e93b906` | **Hot-wallet de recepción** | `RECEPTION_ROLE` |
| **4–9** | *(pool determinista de Anvil)* | **Huéspedes simulados** | ninguno |

**Separación de funciones** (manual de seguridad §2.1): cada hot-wallet interna tiene **su papel** —
el desplegador custodia la tesorería pero **no firma** operaciones; el administrador con wallet (cuenta
1) gobierna, mintea, pausa y retira; la quema y el check-in firman desde sus wallets dedicadas (2 y 3).
Las cuentas 4–9 **no administran nada**: compran, revenden y cobran con su propia wallet (la web nunca
firma por ellas, ADR-11).

> **Nota sobre roles heredados**: si el contrato se desplegó con una topología anterior, alguna cuenta
> puede conservar roles de más (por ejemplo, la cuenta 1 como administrador antiguo). El script **no
> revoca nada por su cuenta**: lo informa al final, y revocarlo es una decisión del responsable. Lo que
> sí garantiza es que **cada cuenta tenga al menos lo que su papel necesita**.

---

## 2. Qué hace, paso a paso

```
pnpm --filter @hotel/contracts inject:data
```

1. **Comprueba el entorno**: RPC, `chainId`, que haya contrato desplegado, la tesorería y el saldo de
   las diez cuentas (avisa si alguna no tiene gas).
2. **Concede los roles on-chain** que falten. Es **idempotente**: solo firma lo que no está.
   Los concede quien tiene `DEFAULT_ADMIN_ROLE` en ese momento (se puede forzar con
   `ROLE_GRANTOR_PRIVATE_KEY`).
3. **Aprovisiona los operadores** de la base de datos y **los imprime una sola vez**:
   - `admin@hotel.es` → administración (asociada a la cuenta 1)
   - `recepcion@hotel.es` → recepción (asociada a la cuenta 3)

   Si un operador **ya existe, no se rota**: rotar la semilla invalidaría el autenticador de quien ya
   entra. Para rotarla de forma explícita, `--rotate-operators`.
4. **Inyecta inventario y reservas**: mintea seis noches (dos de cada tipo del maestro: simple, doble y
   suite) en fechas futuras evitando las que ya existen, las compra en **venta primaria** con las
   cuentas 4–9 (un huésped por noche), y publica una **reventa** de la cuenta 7 que recompra la
   cuenta 4. Resultado: el
   histórico, el panel y el catálogo tienen ventas primarias y secundarias reales. Tras la
   compra, el script ancla **dos check-ins** con la hot-wallet de recepción (`markCheckedIn`) y deja
   el royalty de la reventa pendiente de retirar en el contrato.

## 3. Opciones

| Opción | Efecto |
|---|---|
| `--dry-run` | **No firma nada**: informa de lo que haría (entorno, roles que faltan, noches que mintearía). Es la forma segura de revisarlo antes. |
| `--skip-chain` | Solo operadores de la base de datos (no toca la cadena). |
| `--skip-db` | Solo cadena (no aprovisiona operadores). |
| `--no-reservations` | Mintea y compra en primaria, pero **no** publica la reventa. |
| `--rotate-operators` | Rota la contraseña y la semilla TOTP de los operadores (invalida su autenticador actual). |

## 4. Verificar la topología (solo lectura)

```powershell
cd packages/contracts
npx tsx scripts/verify-accounts.ts
```

Comprueba, contra el contrato, los roles de cada cuenta y que la tesorería es la cuenta 0. Distingue
**FALTA** (es un fallo: una función se queda sin quien pueda ejercerla) de **EXCESO** (se informa y se
conserva, porque revocar es una decisión del responsable).

## 5. Después de inyectar

1. **Indexar**: el worker escucha la cadena, así que en unos segundos el catálogo, el histórico y el
   panel reflejan lo inyectado. Comprobación:
   `http://127.0.0.1:8787/aggregates` (contadores y desglose por tipo).
2. **Panel de administración**: http://127.0.0.1:3000/admin con `admin@hotel.es`.
3. **Recepción**: http://127.0.0.1:3000/recepcion con `recepcion@hotel.es`.
4. **Comprobar un acceso sin abrir el navegador**:
   `node --env-file=.env --import tsx packages/shared/scripts/check-admin-login.ts <usuario> <contraseña> <semillaTOTP> http://127.0.0.1:3000`

## 6. Detalles que conviene saber

- **El script es re-ejecutable**: los roles ya concedidos se saltan y las noches se buscan en fechas
  que aún no existen, así que cada pasada añade inventario nuevo sin chocar con lo anterior.
- **Las fechas salen del reloj de la CADENA**, no del de la máquina: es el que decide la caducidad en
  el contrato (si la cadena va adelantada por un E2E anterior, el script lo respeta).
- **`mint` usa MINTER_ROLE y `buy` no exige rol**: los usuarios compran pagando su gas y su noche; el
  importe de la venta primaria va íntegro a la tesorería (el royalty solo se paga en la reventa).
- **El royalty de la reventa depende del tipo**: 5 % en simple y doble, 10 % en suite, fijado en el
  alta e inmutable (ADR-18).
- **El suelo de listado** es de 0,01 ETH, así que la reventa del guion (0,15 ETH) lo respeta.

---

*Inyección de datos · documentada en M9 · si se añade un tipo de habitación o se cambia la topología
de cuentas, este documento y `dev-accounts.ts` van juntos.*
