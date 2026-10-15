/**
 * Inyeccion de datos de la plataforma (`@inyectaDatos`) sobre Anvil, con una topologia de cuentas
 * EXPLICITA y verificable.
 *
 * ── Cuentas (claves del pool determinista de Anvil; vectores publicos de prueba) ───────────────
 *
 *   #  Direccion                                     Papel en el sistema
 *   0  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266    **Desplegador y tesoreria**: recibe los fondos
 *                                                    (`treasury`); sin rol on-chain tras el handover.
 *   1  0x70997970C51812dc3A010C7d01b50e0d17dc79C8    **Administrador con wallet**: DEFAULT_ADMIN,
 *                                                    MINTER, PAUSER y TREASURER.
 *   2  0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC    **Hot-wallet de quema** (BURNER_ROLE).
 *   3  0x90F79bf6EB2c4f870365e785982E1f101E93b906    **Hot-wallet de recepcion** (RECEPTION_ROLE).
 *   4-9 *(pool determinista)*                        **Huespedes simulados**: compran, revenden y
 *                                                    cobran con su propia wallet (ADR-11).
 *
 * La matriz interna (0-3) sigue la separacion de funciones: una hot-wallet = un solo proposito.
 * Ver RepoTecnico/BaseOperaciones/cuentas_anvil.md.
 *
 * ── Que hace el script, en orden ────────────────────────────────────────────────────────────────
 *
 *   1. Comprueba el entorno: RPC, `chainId`, contrato desplegado y saldo de cada cuenta.
 *   2. **Roles on-chain**: comprueba la topologia desplegada (admin/minter/pauser/treasurer en la
 *      cuenta 1; burner en la 2; reception en la 3) y concede SOLO lo que falte. Es idempotente.
 *      Concede quien TIENE `DEFAULT_ADMIN_ROLE` (autodetectado, o `ROLE_GRANTOR_PRIVATE_KEY`).
 *   3. **Operadores en la base de datos**: aprovisiona el operador de administracion (asociado a la
 *      cuenta 1) y el de recepcion (cuenta 3) con contrasena + TOTP, y los IMPRIME UNA VEZ. Si el
 *      operador ya existe, NO rota sus credenciales: usa `--rotate-operators`.
 *   3.5 **Registro de habitaciones (F8 · D-3/D-10/D-14)**: vuelca el maestro de las 50 habitaciones
 *      en `rooms` (idempotente) y registra on-chain las que falten (`registerRoom`, DEFAULT_ADMIN).
 *      El contrato arranca vacio (D-13) y `mint` exige la habitacion registrada, asi que este paso
 *      va ANTES del inventario. Contra un contrato anterior al corte F8 se omite con un aviso.
 *   4. **Inventario y reservas**: mintea noches (`mint`, MINTER_ROLE) de los tres tipos del maestro
 *      en fechas futuras, las compra en primaria los huespedes 4-9, y publica una reventa entre
 *      huespedes. Deja el historico con ventas primarias y secundarias reales.
 *
 * ── Uso ─────────────────────────────────────────────────────────────────────────────────────────
 *
 *   # Con pnpm, un `--` extra se cuela como argumento posicional y rompe `parseArgs`; usa `exec`:
 *   pnpm --filter @hotel/contracts exec tsx scripts/inject-data.ts               # inyeccion completa
 *   pnpm --filter @hotel/contracts exec tsx scripts/inject-data.ts --dry-run     # solo informa
 *   pnpm --filter @hotel/contracts exec tsx scripts/inject-data.ts --skip-chain  # solo BD
 *   pnpm --filter @hotel/contracts exec tsx scripts/inject-data.ts --skip-db     # solo cadena
 *   pnpm --filter @hotel/contracts exec tsx scripts/inject-data.ts --skip-rooms  # sin registro F8
 *   pnpm --filter @hotel/contracts exec tsx scripts/inject-data.ts --rotate-operators
 *   pnpm --filter @hotel/contracts exec tsx scripts/inject-data.ts --fund-accounts
 *
 * ── Red del proyecto (Besu de Codecrypto) ───────────────────────────────────────────────────────
 *
 *   RPC_URL=https://besu.alumnos.codecrypto.academy CHAIN_ID=81234 \
 *   CONTRACT_ADDRESS=0x676f…d9C DATABASE_URL=postgres://… DEPLOYER_PRIVATE_KEY=0x… \
 *   pnpm --filter @hotel/contracts exec tsx scripts/inject-data.ts --dry-run
 *
 * En una red no local la topología sale del ENTORNO (las claves de Anvil son públicas y su saldo
 * está comprometido): `DEPLOYER_PRIVATE_KEY` (obligatoria) y, opcionalmente, `ADMIN_PRIVATE_KEY`,
 * `BURNER_PRIVATE_KEY`, `RECEPTION_PRIVATE_KEY` y `GUEST_PRIVATE_KEYS` (hasta 6, separadas por
 * comas). Los puestos no declarados caen a la clave del propietario, así que con una sola cuenta
 * con fondos se pueden registrar habitaciones y mintear noches; sin cuentas de huésped distintas se
 * omiten la compra primaria y la reventa (no se puede simular mercado con la misma cuenta).
 * `--fund-accounts` reparte gas desde el propietario a las cuentas sin saldo (`FUND_WEI`, 0,5 por
 * defecto). El gas se envía **legacy con precio y límite explícitos** (`BESU_GAS_PRICE_WEI` ≥ 1000,
 * `BESU_GAS_LIMIT`), porque Besu tiene `baseFee = 0` y su `eth_estimateGas` revierte `PastDate` en
 * `mint()` aunque la transacción se mine (incidencia BESU-ESTIMATE-PASTDATE).
 *
 * Requiere: Anvil en marcha (127.0.0.1:8545) y el contrato desplegado (`pnpm deploy:anvil`), o el
 * RPC/contrato de la red del proyecto en el entorno.
 */
import { parseArgs } from "node:util";
import crypto from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  formatEther,
  getAddress,
  http,
  parseEther,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  anvilChain,
  besuChain,
  buildNightMetadata,
  buildRoomRegistrationPlan,
  buildRoomSeed,
  INJECTION_ACCOUNT_LABELS,
  injectionGasOverrides,
  MIN_GAS_PRICE_WEI,
  resolveRemoteInjectionAccounts,
  roomTypeOf,
  toRoomTypeDb,
  type NightType,
} from "@hotel/shared/domain";
import { hotelNightsAbi } from "@hotel/shared/abi";
import { ANVIL_KEYS_BY_INDEX } from "./dev-accounts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");

// El entorno local vive en el `.env` de la raiz del monorepo (igual que worker/mcp/monitor).
try {
  process.loadEnvFile(resolve(repoRoot, ".env"));
} catch {
  // Sin `.env`: se usan las variables del entorno.
}

// ── Topologia de cuentas (claves de desarrollo de Anvil) ────────────────────────────────────────

const { values } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    "skip-chain": { type: "boolean", default: false },
    "skip-db": { type: "boolean", default: false },
    "rotate-operators": { type: "boolean", default: false },
    "no-reservations": { type: "boolean", default: false },
    // F8 (D-3/D-10): sembrado del maestro en `rooms` y registro on-chain. `--skip-rooms` lo omite
    // para despliegues anteriores al corte de contrato.
    "skip-rooms": { type: "boolean", default: false },
    // Redes no locales: reparte gas desde el propietario a las cuentas sin saldo antes de operar.
    "fund-accounts": { type: "boolean", default: false },
  },
});

const DRY_RUN = values["dry-run"] === true;
const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const CHAIN_ID = Number(process.env.CHAIN_ID ?? anvilChain.id);

/**
 * ¿El RPC es una red local de desarrollo (Anvil)? Misma regla que worker, MCP, monitor y web: la
 * red del proyecto es Besu y Anvil solo el espejo local, ambos con el mismo `chainId`.
 */
const IS_LOCAL_RPC = RPC_URL.includes("127.0.0.1") || RPC_URL.includes("localhost");

/** Gas de las transacciones: automático en Anvil; legacy y explícito en Besu (ver cabecera). */
const GAS_OVERRIDES = injectionGasOverrides(IS_LOCAL_RPC, process.env, MIN_GAS_PRICE_WEI);

/** Saldo que reparte `--fund-accounts` a cada cuenta sin fondos (en wei). */
const FUND_WEI = BigInt(process.env.FUND_WEI ?? "500000000000000000");

const CONTRACT_RAW = process.env.CONTRACT_ADDRESS;
if (!CONTRACT_RAW) {
  console.error("ERROR: falta CONTRACT_ADDRESS en el .env. Despliega antes: pnpm deploy:anvil");
  process.exit(1);
}
const CONTRACT = getAddress(CONTRACT_RAW);

/** Rol del sistema y con que cuenta se ejerce. */
interface AccountPlan {
  readonly slot: number;
  readonly label: string;
  readonly account: ReturnType<typeof privateKeyToAccount>;
}

/**
 * Topología de cuentas.
 *
 * - **Anvil local**: pool determinista de 10 cuentas (claves públicas de prueba del repositorio).
 * - **Red del proyecto (Besu)**: se resuelve desde el entorno (gestor de secretos); los puestos no
 *   declarados caen a la clave del propietario, así que con una sola cuenta con fondos se pueden
 *   registrar habitaciones y mintear noches.
 */
const ACCOUNT_PLANS: readonly AccountPlan[] = IS_LOCAL_RPC
  ? ANVIL_KEYS_BY_INDEX.slice(0, 10).map((key, slot) => ({
      slot,
      label: INJECTION_ACCOUNT_LABELS[slot] ?? `puesto ${slot}`,
      account: privateKeyToAccount(key),
    }))
  : resolveRemoteInjectionAccounts(process.env).map((entry) => ({
      slot: entry.slot,
      label: entry.label,
      account: privateKeyToAccount(entry.privateKey),
    }));

const owner = ACCOUNT_PLANS[0]!;
const adminMinter = ACCOUNT_PLANS[1]!;
const burner = ACCOUNT_PLANS[2]!;
const receptionOperator = ACCOUNT_PLANS[3]!;
const GUESTS: readonly AccountPlan[] = ACCOUNT_PLANS.slice(4);

const ACCOUNTS = ACCOUNT_PLANS;

/**
 * Cuentas de huésped **distintas del minteador**: las únicas que pueden comprar y revender. Con la
 * misma cuenta no se puede simular mercado (comprar la noche que uno mismo posee revierte).
 */
const TRADE_ACCOUNTS: readonly AccountPlan[] = GUESTS.filter((candidate, index) => {
  const address = candidate.account.address.toLowerCase();
  if (address === adminMinter.account.address.toLowerCase()) return false;
  return GUESTS.findIndex((other) => other.account.address.toLowerCase() === address) === index;
});

/** Rol on-chain → cuenta que debe tenerlo (topologia pedida). */
const ROLES: readonly { name: string; slot: number; why: string }[] = [
  { name: "DEFAULT_ADMIN_ROLE", slot: 1, why: "gobierno del contrato (conceder/revocar roles)" },
  { name: "MINTER_ROLE", slot: 1, why: "publicar noches desde el back-office" },
  { name: "PAUSER_ROLE", slot: 1, why: "pausar y reanudar el sistema" },
  { name: "TREASURER_ROLE", slot: 1, why: "retirar los fondos de la tesoreria" },
  { name: "BURNER_ROLE", slot: 2, why: "quema programada de noches caducadas" },
  { name: "RECEPTION_ROLE", slot: 3, why: "ancla on-chain del check-in" },
];

/**
 * Cadena de los clientes viem: la del proyecto (**Besu**) o el espejo local (**Anvil**), según el RPC.
 *
 * El `id` sale de `CHAIN_ID` (entorno) y el RPC de `RPC_URL`: si no coinciden con la red real, viem
 * firma con otro `chainId` y la transacción se rechaza con "Transaction creation failed.".
 */
const baseChain = IS_LOCAL_RPC ? anvilChain : besuChain;
const activeChain = {
  ...baseChain,
  id: CHAIN_ID,
  rpcUrls: { default: { http: [RPC_URL] } },
};

/** Símbolo de la moneda nativa de la red (ETH en el proyecto; se pinta en los avisos). */
const NATIVE_SYMBOL = activeChain.nativeCurrency.symbol;

const publicClient = createPublicClient({ chain: activeChain, transport: http(RPC_URL) });

const walletFor = (plan: AccountPlan) =>
  createWalletClient({ account: plan.account, chain: activeChain, transport: http(RPC_URL) });

function log(message: string): void {
  console.log(message);
}

function heading(message: string): void {
  console.log(`\n=== ${message} ===`);
}

/** Lee el `bytes32` del rol desde el contrato (no se duplica el keccak en el guion). */
async function roleHash(name: string): Promise<Hex> {
  return (await publicClient.readContract({
    address: CONTRACT,
    abi: hotelNightsAbi,
    functionName: name as "MINTER_ROLE",
  })) as Hex;
}

async function hasRole(role: string, address: Address): Promise<boolean> {
  return (await publicClient.readContract({
    address: CONTRACT,
    abi: hotelNightsAbi,
    functionName: "hasRole",
    args: [await roleHash(role), address],
  })) as boolean;
}

/** Fecha `AAAAMMDD` a `offset` dias vista, en el reloj de la CADENA (el que decide la caducidad). */
function dateFromChain(chainNowSeconds: bigint, offsetDays: number): number {
  const date = new Date((Number(chainNowSeconds) + offsetDays * 86_400) * 1000);
  return date.getUTCFullYear() * 10_000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
}

async function chainNow(): Promise<bigint> {
  const block = await publicClient.getBlock({ blockTag: "latest" });
  return block.timestamp;
}

async function ownerOf(tokenId: bigint): Promise<Address | null> {
  try {
    return (await publicClient.readContract({
      address: CONTRACT,
      abi: hotelNightsAbi,
      functionName: "ownerOf",
      args: [tokenId],
    })) as Address;
  } catch {
    return null; // el token no existe (o esta quemado)
  }
}

async function soldOnce(tokenId: bigint): Promise<boolean> {
  return (await publicClient.readContract({
    address: CONTRACT,
    abi: hotelNightsAbi,
    functionName: "soldOnce",
    args: [tokenId],
  })) as boolean;
}

/** ¿La habitación ya está en el registro on-chain (F8 · D-10)? */
async function isRoomRegistered(room: number): Promise<boolean> {
  return (await publicClient.readContract({
    address: CONTRACT,
    abi: hotelNightsAbi,
    functionName: "isRoomRegistered",
    args: [BigInt(room)],
  })) as boolean;
}

/**
 * ¿El contrato desplegado incorpora el registro dinámico de habitaciones (corte F8)?
 *
 * Contra un contrato anterior al corte la función no existe y la lectura revierte; se detecta aquí
 * para poder seguir inyectando datos en despliegues antiguos sin romper.
 */
async function supportsRoomRegistry(): Promise<boolean> {
  try {
    await isRoomRegistered(101);
    return true;
  } catch {
    return false;
  }
}

/**
 * Envia una transaccion y espera el recibo; devuelve el hash.
 *
 * En redes no locales `GAS_OVERRIDES` fuerza **legacy con gas y precio explícitos**: Besu tiene
 * `baseFee = 0` (mínimo 1000 wei) y su `eth_estimateGas` revierte `PastDate` en `mint()` aunque la
 * transacción sí se mine (incidencia BESU-ESTIMATE-PASTDATE, reportada a Codecrypto).
 */
async function send(
  plan: AccountPlan,
  functionName: string,
  args: readonly unknown[],
  value?: bigint,
): Promise<Hex> {
  const wallet = walletFor(plan);
  const hash = await wallet.writeContract({
    address: CONTRACT,
    abi: hotelNightsAbi,
    functionName: functionName as "mint",
    args: args as never,
    // `functionName` es dinámico (`mint` no es pagadera; `buy` y `buyResale` sí), así que viem no
    // puede inferir el `value` a partir del ABI: se marca como `never` igual que los `args`.
    value: value as never,
    ...GAS_OVERRIDES,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`la transaccion ${functionName} revirtio (hash ${hash})`);
  }
  return hash;
}

/** Transferencia de gas entre cuentas del guion (usa los mismos overrides de red). */
async function sendValue(plan: AccountPlan, to: Address, value: bigint): Promise<Hex> {
  const wallet = walletFor(plan);
  const hash = await wallet.sendTransaction({
    account: plan.account,
    chain: activeChain,
    to,
    value,
    ...GAS_OVERRIDES,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`la transferencia de gas a ${to} revirtio (hash ${hash})`);
  }
  return hash;
}

/**
 * Reparte gas desde el propietario (cuenta 0) a cualquier cuenta del guion sin saldo.
 *
 * En una red real solo el desplegador suele tener fondos: sin este paso, los roles de las cuentas
 * 1–3 y las compras de los huéspedes no podrían firmar.
 */
async function fundAccounts(): Promise<void> {
  heading("1.bis Gas de las cuentas");
  if (IS_LOCAL_RPC) {
    log("  omitido: en Anvil local todas las cuentas salen con 10.000 ETH");
    return;
  }
  const funder = owner;
  const funderBalance = await publicClient.getBalance({ address: funder.account.address });
  log(`  Fondeador      cuenta 0 (${funder.account.address}) · ${formatEther(funderBalance)} ${NATIVE_SYMBOL}`);

  for (const plan of ACCOUNTS) {
    if (plan.account.address.toLowerCase() === funder.account.address.toLowerCase()) continue;
    const balance = await publicClient.getBalance({ address: plan.account.address });
    if (balance > 0n) {
      log(`  ya tiene       cuenta ${plan.slot} · ${formatEther(balance)} ${NATIVE_SYMBOL}`);
      continue;
    }
    if (DRY_RUN) {
      log(`  [dry-run]      enviaria ${formatEther(FUND_WEI)} ${NATIVE_SYMBOL} a la cuenta ${plan.slot}`);
      continue;
    }
    const hash = await sendValue(funder, plan.account.address, FUND_WEI);
    log(`  financiada     cuenta ${plan.slot} con ${formatEther(FUND_WEI)} ${NATIVE_SYMBOL} · tx ${hash}`);
  }
}

// ── 1. Entorno ──────────────────────────────────────────────────────────────────────────────────

async function checkEnvironment(): Promise<void> {
  heading("1. Entorno");
  const chainId = await publicClient.getChainId();
  if (chainId !== CHAIN_ID) {
    throw new Error(`el RPC responde chainId ${chainId} y se esperaba ${CHAIN_ID}`);
  }
  const code = await publicClient.getCode({ address: CONTRACT });
  if (!code || code === "0x") {
    throw new Error(`no hay contrato desplegado en ${CONTRACT}`);
  }
  const treasury = (await publicClient.readContract({
    address: CONTRACT,
    abi: hotelNightsAbi,
    functionName: "treasury",
  })) as Address;

  log(`  Red            ${activeChain.name} (${IS_LOCAL_RPC ? "espejo local" : "red del proyecto"})`);
  log(`  RPC            ${RPC_URL} (chainId ${chainId})`);
  log(`  Contrato       ${CONTRACT}`);
  log(`  Tesoreria      ${treasury}`);
  log(
    `  Gas            ${
      IS_LOCAL_RPC
        ? "estimado automáticamente (Anvil)"
        : `legacy · gasPrice ${GAS_OVERRIDES.gasPrice} wei · gas ${GAS_OVERRIDES.gas}`
    }`,
  );
  for (const plan of ACCOUNTS) {
    const balance = await publicClient.getBalance({ address: plan.account.address });
    log(
      `  Cuenta ${plan.slot}       ${plan.account.address} · ${plan.label} · ${formatEther(balance)} ${NATIVE_SYMBOL}`,
    );
    if (balance === 0n) {
      log(
        `    AVISO: la cuenta ${plan.slot} no tiene saldo para pagar gas${
          IS_LOCAL_RPC ? "" : " (usa --fund-accounts)"
        }.`,
      );
    }
  }
}

// ── 2. Roles on-chain ───────────────────────────────────────────────────────────────────────────

async function grantRoles(): Promise<void> {
  heading("2. Roles on-chain");

  const adminRole = await roleHash("DEFAULT_ADMIN_ROLE");
  const isAdmin = async (address: Address): Promise<boolean> =>
    (await publicClient.readContract({
      address: CONTRACT,
      abi: hotelNightsAbi,
      functionName: "hasRole",
      args: [adminRole, address],
    })) as boolean;

  // Quien concede debe tener DEFAULT_ADMIN_ROLE. Se respeta `ROLE_GRANTOR_PRIVATE_KEY` si se define;
  // si no, se busca entre las cuatro cuentas del guion la que YA administra el contrato (tras un
  // despliegue con la topologia antigua puede ser otra distinta del propietario objetivo).
  const explicitGrantor = process.env.ROLE_GRANTOR_PRIVATE_KEY;
  let grantorPlan: AccountPlan;
  if (explicitGrantor) {
    grantorPlan = {
      slot: -1,
      label: "concedente indicado por ROLE_GRANTOR_PRIVATE_KEY",
      account: privateKeyToAccount(explicitGrantor as Hex),
    };
  } else {
    let found: AccountPlan | null = null;
    for (const candidate of ACCOUNTS) {
      if (await isAdmin(candidate.account.address)) {
        found = candidate;
        break;
      }
    }
    if (!found) {
      throw new Error(
        "ninguna de las cuatro cuentas del guion tiene DEFAULT_ADMIN_ROLE: define ROLE_GRANTOR_PRIVATE_KEY con la cuenta administradora actual (o vuelve a desplegar con `pnpm deploy:anvil`)",
      );
    }
    grantorPlan = found;
  }

  if (!(await isAdmin(grantorPlan.account.address))) {
    throw new Error(
      `el concedente ${grantorPlan.account.address} no tiene DEFAULT_ADMIN_ROLE: revisa ROLE_GRANTOR_PRIVATE_KEY`,
    );
  }
  log(`  Concedente     cuenta ${grantorPlan.slot} (${grantorPlan.account.address})`);

  for (const role of ROLES) {
    const account = ACCOUNTS[role.slot]!;
    const already = await hasRole(role.name, account.account.address);
    const detail = `cuenta ${role.slot} (${account.label}) · ${role.name} · ${role.why}`;
    if (already) {
      log(`  ya tenia       ${detail}`);
      continue;
    }
    if (DRY_RUN) {
      log(`  [dry-run]      concederia ${detail}`);
      continue;
    }
    const hash = await send(grantorPlan, "grantRole", [await roleHash(role.name), account.account.address]);
    log(`  concedido      ${detail} (tx ${hash})`);
  }
}

// ── 3. Operadores de la base de datos ───────────────────────────────────────────────────────────

/**
 * Filas de `rooms` leídas tras sembrar el maestro. Las usa el registro on-chain (D-3: la BD es la
 * fuente única; el maestro solo carga la tabla).
 */
let roomsFromDb: { roomNumber: number; roomType: string }[] | null = null;

/**
 * Vuelca el maestro en `rooms` (D-14). Idempotente: `ON CONFLICT (room_number) DO NOTHING` respeta
 * cualquier ficha ya editada por el hotel y solo rellena lo que falta. Devuelve las filas vigentes.
 */
async function seedRoomsIntoDb(): Promise<{ roomNumber: number; roomType: string }[]> {
  // Import dinámico: el barril raíz arrastra `pg` y solo hace falta cuando se toca la BD.
  const { getDbPool } = await import("@hotel/shared");
  const pool = getDbPool();
  const seed = buildRoomSeed();
  for (const room of seed) {
    await pool.query(
      `INSERT INTO rooms (
          room_number, floor, room_type, capacity, beds, base_rate_wei,
          description_es, description_en, description_ru
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (room_number) DO NOTHING`,
      [
        room.roomNumber,
        room.floor,
        room.roomType,
        room.capacity,
        room.beds,
        room.baseRateWei,
        room.descriptionEs,
        room.descriptionEn,
        room.descriptionRu,
      ],
    );
  }
  const res = await pool.query(
    "SELECT room_number, room_type FROM rooms WHERE archived_at IS NULL ORDER BY room_number",
  );
  log(`  sembradas      ${res.rowCount ?? res.rows.length} habitaciones en la BD (maestro F8 · D-3/D-14)`);
  return res.rows.map((row: { room_number: number; room_type: string }) => ({
    roomNumber: row.room_number,
    roomType: row.room_type,
  }));
}

async function provisionOperators(): Promise<void> {
  heading("3. Operadores de la base de datos");

  if (DRY_RUN) {
    log("  [dry-run]      aprovisionaria el operador de administracion y el de recepcion");
    return;
  }

  // Import dinamico: `@hotel/shared` (barril raiz) arrastra `pg`, y solo hace falta si se toca la BD.
  const { AuthService, SessionsRepository, UsersRepository, runMigrations, closeDbPool, getDbPool } =
    await import("@hotel/shared");

  await runMigrations(getDbPool());
  const authService = new AuthService(new SessionsRepository(), new UsersRepository());

  // F8 (D-3/D-14): la BD es la fuente única; el maestro de habitaciones la carga antes del
  // registro on-chain. Se hace dentro de la sesión de BD porque el pool se cierra al terminar.
  roomsFromDb = await seedRoomsIntoDb();

  const operators = [
    { plan: adminMinter, role: "DEFAULT_ADMIN_ROLE" as const, username: "admin@hotel.es" },
    { plan: receptionOperator, role: "RECEPTION_ROLE" as const, username: "recepcion@hotel.es" },
  ];

  for (const operator of operators) {
    // La comprobacion es la consulta directa a `admin_users`: es la unica fuente de verdad de si el
    // operador existe, y evita rotar (y por tanto invalidar) las credenciales de quien ya entra.
    const alreadyExists = await operatorExists(operator.username);
    if (alreadyExists && !values["rotate-operators"]) {
      log(`  ya existe      ${operator.username} (${operator.role}) — no se rotan sus credenciales`);
      log("                 para rotarlas: --rotate-operators");
      continue;
    }

    const password = crypto.randomBytes(18).toString("base64url");
    const provisioned = await authService.provisionUser({
      username: operator.username,
      password,
      role: operator.role,
      recoveryCodeCount: 8,
    });

    log("");
    log("  " + "=".repeat(70));
    log(`  OPERADOR ${operator.role} — ENTREGAR Y NO GUARDAR AQUI`);
    log("  " + "=".repeat(70));
    log(`  Cuenta Anvil : #${operator.plan.slot} ${operator.plan.account.address}`);
    log(`  Usuario      : ${provisioned.username}`);
    log(`  Contrasena   : ${password}`);
    log(`  TOTP (uri)   : ${provisioned.uri}`);
    log(`  Semilla TOTP : ${provisioned.secret}`);
    log(`  Rescate      : ${provisioned.recoveryCodes.join(" ")}`);
    log("  " + "=".repeat(70));
  }

  await closeDbPool();
}

/** ¿Existe ya el operador? Consulta directa: no todas las versiones del servicio la exponen. */
async function operatorExists(username: string): Promise<boolean> {
  const { getDbPool } = await import("@hotel/shared");
  const res = await getDbPool().query("SELECT 1 FROM admin_users WHERE username = $1", [username]);
  return res.rowCount !== null && res.rowCount > 0;
}

// ── 3.5 Registro on-chain de habitaciones (F8 · D-3, D-10, D-13, D-14) ──────────────────────────

/**
 * Registra en el contrato las habitaciones que aún no lo estén (idempotente). El contrato arranca
 * vacío (D-13) y `mint` exige `_roomRegistered`, así que este paso es obligatorio antes de mintear.
 * Contra un contrato anterior al corte F8 se omite con un aviso (compatibilidad hacia atrás).
 */
async function registerRooms(): Promise<void> {
  heading("3.5 Registro on-chain de habitaciones (F8)");

  if (!(await supportsRoomRegistry())) {
    log("  omitido: el contrato desplegado es anterior al corte F8 (sin registro dinámico)");
    return;
  }

  // D-3: la fuente es la BD. Si no se tocó la BD, se usa el maestro como respaldo declarado.
  const rows =
    roomsFromDb ?? buildRoomSeed().map((room) => ({ roomNumber: room.roomNumber, roomType: room.roomType }));
  const plan = buildRoomRegistrationPlan(rows);
  if (plan.length === 0) {
    log("  sin habitaciones que registrar (la tabla rooms está vacía)");
    return;
  }

  let registered = 0;
  for (const entry of plan) {
    if (await isRoomRegistered(entry.room)) {
      log(`  ya registrada  hab. ${entry.room} (${entry.roomType})`);
      continue;
    }
    if (DRY_RUN) {
      log(`  [dry-run]      registraria hab. ${entry.room} (${entry.roomType})`);
      continue;
    }
    const hash = await send(adminMinter, "registerRoom", [BigInt(entry.room), entry.roomType]);
    registered += 1;
    log(`  registrada     hab. ${entry.room} (${entry.roomType}) · tx ${hash}`);
  }
  log(`  total          ${registered} registradas de ${plan.length} en el plan`);
}

// ── 4. Inventario y reservas ────────────────────────────────────────────────────────────────────

/** Una noche objetivo: habitacion, tipo (del maestro) y precio de venta primaria. */
interface NightPlan {
  readonly room: number;
  readonly type: NightType;
  readonly priceEth: string;
}

/**
 * Surtido de la inyeccion: los tres tipos del maestro (simple, doble y suite) para que el catalogo,
 * el filtro por tipo y el desglose del panel tengan contenido real. El comprador se asigna en
 * tiempo de ejecucion entre las cuentas de huesped **distintas del minteador** (en una red donde
 * solo el propietario tiene clave/fondos no hay mercado que simular).
 */
const NIGHTS: readonly NightPlan[] = [
  { room: 101, type: "simple", priceEth: "0.05" },
  { room: 108, type: "simple", priceEth: "0.06" },
  { room: 118, type: "doble", priceEth: "0.09" },
  { room: 124, type: "doble", priceEth: "0.1" },
  { room: 202, type: "suite", priceEth: "0.25" },
  { room: 210, type: "suite", priceEth: "0.3" },
];


/** Primera fecha futura (desde `offsetDays`) cuya noche de esa habitacion NO exista todavia. */
async function firstFreeDate(room: number, chainNowSeconds: bigint, offsetDays: number): Promise<bigint> {
  for (let offset = offsetDays; offset < offsetDays + 120; offset++) {
    const date = dateFromChain(chainNowSeconds, offset);
    const tokenId = BigInt(room) * 100_000_000n + BigInt(date);
    if ((await ownerOf(tokenId)) === null) return tokenId;
  }
  throw new Error(`no hay fecha libre para la habitacion ${room} en los proximos 120 dias`);
}

async function injectInventory(): Promise<void> {
  heading("4. Inventario y reservas");

  const now = await chainNow();
  const buyers = TRADE_ACCOUNTS;
  const mintedTokens: { plan: NightPlan; tokenId: bigint; buyer: AccountPlan | null }[] = [];

  // 4.1 Minteo con el administrador con wallet (MINTER_ROLE, cuenta 1).
  for (const [index, night] of NIGHTS.entries()) {
    const tokenId = await firstFreeDate(night.room, now, 30 + index * 7);
    const type = roomTypeOf(night.room);
    if (type !== night.type) {
      throw new Error(`la habitacion ${night.room} es "${type}" en el maestro, no "${night.type}"`);
    }
    // URI de metadata deterministica por noche (ADR-12): el contrato fija la referencia y el
    // contenido se resuelve fuera de la cadena. Cada documento declara `image: ipfs://<CID del tipo>`,
    // que es lo que la web pinta al leer los metadatos.
    const dateYYYYMMDD = Number(tokenId % 100_000_000n);
    const metadata = buildNightMetadata({ room: night.room, dateYYYYMMDD, roomType: night.type });
    const metadataURI = `ipfs://night-${night.room}-${dateYYYYMMDD}`;
    if (!metadata.image.startsWith("ipfs://")) {
      throw new Error("la metadata de la noche debe referenciar la imagen por ipfs:// (ADR-12)");
    }

    const buyer = buyers.length > 0 ? buyers[index % buyers.length]! : null;
    if (DRY_RUN) {
      log(
        `  [dry-run]      mintearia ${tokenId} (hab. ${night.room} ${night.type}) a ${night.priceEth} ${NATIVE_SYMBOL}`,
      );
      log(`                 metadata: "${metadata.name}" · imagen ${metadata.image}`);
      continue;
    }
    const hash = await send(adminMinter, "mint", [
      BigInt(night.room),
      BigInt(dateYYYYMMDD),
      parseEther(night.priceEth),
      metadataURI,
    ]);
    log(
      `  minteada       ${tokenId} · hab. ${night.room} (${toRoomTypeDb(night.type)}) · ${night.priceEth} ${NATIVE_SYMBOL} · tx ${hash}`,
    );
    mintedTokens.push({ plan: night, tokenId, buyer });
  }

  if (DRY_RUN) {
    log(
      buyers.length >= 2
        ? "  [dry-run]      compraria en primaria y publicaria una reventa"
        : "  [dry-run]      quedarian a la venta (sin cuentas de huesped distintas del minteador)",
    );
    return;
  }

  // 4.2 Compra primaria con las cuentas de huesped (cada una paga su gas y su noche).
  if (buyers.length === 0) {
    log(
      "  omitida        no hay cuentas de huesped con clave propia y distinta del minteador:",
    );
    log("                 las noches quedan minteadas y a la venta en el catalogo.");
  } else {
    log(
      `  compradores    ${buyers.map((plan) => `#${plan.slot}`).join(", ")}${
        buyers.length < 2 ? " (una sola cuenta: sin reventa)" : ""
      }`,
    );
    for (const { plan, tokenId, buyer } of mintedTokens) {
      if (!buyer) continue;
      const hash = await send(buyer, "buy", [tokenId], parseEther(plan.priceEth));
      log(`  comprada       ${tokenId} por cuenta ${buyer.slot} (${buyer.label}) · tx ${hash}`);
    }
  }

  // 4.3 Reventa: un huesped lista una de sus noches y otro la recompra (royalty real). Hacen falta
  //     DOS cuentas de huesped distintas: nadie puede comprar su propia reventa.
  if (!values["no-reservations"] && buyers.length >= 2) {
    const seller = buyers[buyers.length - 1]!;
    const buyer = buyers[0]!;
    const resale = mintedTokens.find((entry) => entry.buyer === seller);
    if (resale) {
      const resalePrice = parseEther("0.15");
      const listHash = await send(seller, "list", [resale.tokenId, resalePrice]);
      log(`  listada        ${resale.tokenId} por cuenta ${seller.slot} a 0.15 ${NATIVE_SYMBOL} · tx ${listHash}`);

      const buyHash = await send(buyer, "buyResale", [resale.tokenId], resalePrice);
      log(`  revendida      ${resale.tokenId} a cuenta ${buyer.slot} · tx ${buyHash}`);

      const ownerNow = await ownerOf(resale.tokenId);
      log(`  titular ahora  ${ownerNow} (esperado ${buyer.account.address})`);
      if (ownerNow?.toLowerCase() !== buyer.account.address.toLowerCase()) {
        throw new Error("la reventa no dejo la noche en manos del huesped comprador");
      }
    }
  } else if (!values["no-reservations"] && buyers.length < 2) {
    log("  omitida        la reventa necesita dos cuentas de huesped distintas");
  }

  // 4.4 Resumen del estado final de lo inyectado.
  heading("Resumen de lo inyectado");
  for (const { plan, tokenId } of mintedTokens) {
    const holder = await ownerOf(tokenId);
    const sold = await soldOnce(tokenId);
    const huesped = GUESTS.find((g) => g.account.address.toLowerCase() === holder?.toLowerCase());
    const label = huesped ? `huesped #${huesped.slot}` : holder ?? "(sin titular)";
    log(`  ${tokenId} · hab. ${plan.room} (${plan.type}) · vendida=${sold} · titular=${label}`);
  }
}

// ── main ────────────────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log("Inyeccion de datos de la plataforma (@inyectaDatos)");
  log(`Modo: ${DRY_RUN ? "SIMULACION (no firma nada)" : "REAL"}`);
  log("");
  log("Topologia de cuentas:");
  for (const plan of ACCOUNTS) log(`  #${plan.slot}  ${plan.account.address}  ${plan.label}`);

  await checkEnvironment();

  if (values["fund-accounts"]) {
    await fundAccounts();
  } else if (!IS_LOCAL_RPC && TRADE_ACCOUNTS.length > 0) {
    log("\n(AVISO: en una red no local, si las cuentas no tienen fondos usa --fund-accounts)");
  }

  if (values["skip-chain"]) {
    heading("2. Roles on-chain");
    log("  omitido (--skip-chain)");
  } else {
    await grantRoles();
  }

  if (values["skip-db"]) {
    heading("3. Operadores de la base de datos");
    log("  omitido (--skip-db)");
  } else {
    await provisionOperators();
  }

  if (values["skip-chain"] || values["skip-rooms"]) {
    heading("3.5 Registro on-chain de habitaciones (F8)");
    log(`  omitido (${values["skip-chain"] ? "--skip-chain" : "--skip-rooms"})`);
  } else {
    await registerRooms();
  }

  if (values["skip-chain"]) {
    heading("4. Inventario y reservas");
    log("  omitido (--skip-chain)");
  } else {
    await injectInventory();
  }

  heading(DRY_RUN ? "Simulacion terminada (nada modificado)" : "Inyeccion terminada");
}

void main().catch((error: unknown) => {
  console.error(`\nFALLO: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
