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
 *
 * Requiere: Anvil en marcha (127.0.0.1:8545) y el contrato desplegado (`pnpm deploy:anvil`).
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
  buildNightMetadata,
  buildRoomRegistrationPlan,
  buildRoomSeed,
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
  },
});

const DRY_RUN = values["dry-run"] === true;
const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const CHAIN_ID = Number(process.env.CHAIN_ID ?? anvilChain.id);

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

/** Topologia interna aprobada: una hot-wallet = un solo proposito (cuentas_anvil.md). */
const plan = (slot: number, label: string): AccountPlan => ({
  slot,
  label,
  account: privateKeyToAccount(ANVIL_KEYS_BY_INDEX[slot]!),
});

const owner = plan(0, "desplegador y tesoreria (sin rol on-chain tras el handover)");
const adminMinter = plan(1, "administrador con wallet: DEFAULT_ADMIN + MINTER + PAUSER + TREASURER");
const burner = plan(2, "hot-wallet de quema (BURNER_ROLE)");
const receptionOperator = plan(3, "hot-wallet de recepcion (RECEPTION_ROLE)");
const GUESTS: readonly AccountPlan[] = [4, 5, 6, 7, 8, 9].map((slot) =>
  plan(slot, `huesped simulado #${slot}`),
);

const ACCOUNTS = [owner, adminMinter, burner, receptionOperator, ...GUESTS] as const;

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
 * Cadena de los clientes viem, derivada de `CHAIN_ID` (entorno).
 *
 * `anvilChain` de `@hotel/shared` fija `id = 81234` (la cadena canónica del proyecto).
 * Contra un Anvil con otra chainId (p. ej. el servicio global en 31337) hay que construir
 * el objeto con el id real: si no, viem firma con el chainId equivocado y la transacción
 * se rechaza con "Transaction creation failed.".
 */
const activeChain = {
  id: CHAIN_ID,
  name: "Anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
} as const;

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

/** Envia una transaccion y espera el recibo; devuelve el hash. */
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
    value,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`la transaccion ${functionName} revirtio (hash ${hash})`);
  }
  return hash;
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

  log(`  RPC            ${RPC_URL} (chainId ${chainId})`);
  log(`  Contrato       ${CONTRACT}`);
  log(`  Tesoreria      ${treasury}`);
  for (const plan of ACCOUNTS) {
    const balance = await publicClient.getBalance({ address: plan.account.address });
    log(`  Cuenta ${plan.slot}       ${plan.account.address} · ${plan.label} · ${formatEther(balance)} ETH`);
    if (balance === 0n) {
      log(`    AVISO: la cuenta ${plan.slot} no tiene saldo para pagar gas.`);
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
  readonly buyer: AccountPlan;
}

/**
 * Surtido de la inyeccion: los tres tipos del maestro (simple, doble y suite) para que el catalogo,
 * el filtro por tipo y el desglose del panel tengan contenido real.
 */
const NIGHTS: readonly NightPlan[] = [
  { room: 101, type: "simple", priceEth: "0.05", buyer: GUESTS[0]! },
  { room: 108, type: "simple", priceEth: "0.06", buyer: GUESTS[1]! },
  { room: 118, type: "doble", priceEth: "0.09", buyer: GUESTS[2]! },
  { room: 124, type: "doble", priceEth: "0.1", buyer: GUESTS[3]! },
  { room: 202, type: "suite", priceEth: "0.25", buyer: GUESTS[4]! },
  { room: 210, type: "suite", priceEth: "0.3", buyer: GUESTS[5]! },
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
  const mintedTokens: { plan: NightPlan; tokenId: bigint }[] = [];

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

    if (DRY_RUN) {
      log(`  [dry-run]      mintearia ${tokenId} (hab. ${night.room} ${night.type}) a ${night.priceEth} ETH`);
      log(`                 metadata: "${metadata.name}" · imagen ${metadata.image}`);
      continue;
    }
    const hash = await send(adminMinter, "mint", [
      BigInt(night.room),
      BigInt(dateYYYYMMDD),
      parseEther(night.priceEth),
      metadataURI,
    ]);
    log(`  minteada       ${tokenId} · hab. ${night.room} (${toRoomTypeDb(night.type)}) · ${night.priceEth} ETH · tx ${hash}`);
    mintedTokens.push({ plan: night, tokenId });
  }

  if (DRY_RUN) {
    log("  [dry-run]      compraria en primaria y publicaria una reventa");
    return;
  }

  // 4.2 Compra primaria con las cuentas de usuario (cada una paga su gas y su noche).
  for (const { plan, tokenId } of mintedTokens) {
    const hash = await send(plan.buyer, "buy", [tokenId], parseEther(plan.priceEth));
    log(`  comprada       ${tokenId} por cuenta ${plan.buyer.slot} (${plan.buyer.label}) · tx ${hash}`);
  }

  // 4.3 Reventa: huesped #7 lista una de sus noches y huesped #4 la recompra (royalty real).
  if (!values["no-reservations"]) {
    const seller = GUESTS[3]!;
    const buyer = GUESTS[0]!;
    const resale = mintedTokens.find((entry) => entry.plan.buyer === seller);
    if (resale) {
      const resalePrice = parseEther("0.15");
      const listHash = await send(seller, "list", [resale.tokenId, resalePrice]);
      log(`  listada        ${resale.tokenId} por cuenta ${seller.slot} a 0.15 ETH · tx ${listHash}`);

      const buyHash = await send(buyer, "buyResale", [resale.tokenId], resalePrice);
      log(`  revendida      ${resale.tokenId} a cuenta ${buyer.slot} · tx ${buyHash}`);

      const ownerNow = await ownerOf(resale.tokenId);
      log(`  titular ahora  ${ownerNow} (esperado ${buyer.account.address})`);
      if (ownerNow?.toLowerCase() !== buyer.account.address.toLowerCase()) {
        throw new Error("la reventa no dejo la noche en manos del huesped comprador");
      }
    }
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
