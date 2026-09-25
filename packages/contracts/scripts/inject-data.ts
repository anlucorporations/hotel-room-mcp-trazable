/**
 * Inyeccion de datos de la plataforma (`@inyectaDatos`) sobre Anvil, con una topologia de cuentas
 * EXPLICITA y verificable.
 *
 * ── Cuentas (claves de desarrollo publicadas por Anvil; no son secretos) ─────────────────────────
 *
 *   #  Direccion                                     Papel en el sistema
 *   0  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266    **Propietario / administrador**: titular de
 *                                                    TODOS los roles y de la tesoreria. Acceso a
 *                                                    todas las funciones del sistema en modo admin.
 *   1  0x70997970C51812dc3A010C7d01b50e0d17dc79C8    **Operador de check-in** (RECEPTION_ROLE).
 *   2  0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC    **Usuario de reservas A** (compra primaria).
 *   3  0x90F79bf6EB2c4f870365E785982E1f101E93b906    **Usuario de reservas B** (compra primaria y
 *                                                    reventa: lista su noche para que A la recompre).
 *
 * Los usuarios 2 y 3 quedan con acceso a la interfaz **con su propia wallet**: la web nunca firma
 * por ellos (ADR-11), asi que su papel es comprar, revender y cobrar, no administrar.
 *
 * ── Que hace el script, en orden ────────────────────────────────────────────────────────────────
 *
 *   1. Comprueba el entorno: RPC, `chainId`, contrato desplegado y saldo de cada cuenta.
 *   2. **Roles on-chain**: concede al propietario los seis roles (admin, minter, pauser, burner,
 *      treasurer y reception) y RECEPTION_ROLE al operador de check-in. Es idempotente: solo firma
 *      lo que falta. Los concede quien TIENE `DEFAULT_ADMIN_ROLE` en ese momento (`ROLE_GRANTOR_...`,
 *      por defecto la cuenta 0).
 *   3. **Operadores en la base de datos**: aprovisiona el operador de administracion (cuenta 0) y el
 *      de recepcion (cuenta 1) con contrasena + TOTP, y los IMPRIME UNA VEZ. Si el operador ya
 *      existe, NO rota sus credenciales (eso invalidaria su autenticador): usa `--rotate-operators`.
 *   4. **Inventario y reservas**: mintea noches de los tres tipos del maestro en fechas futuras
 *      (evitando las que ya existen), las compra en primaria con las cuentas de usuario, y publica
 *      una reventa del usuario B. Deja el historico con ventas primarias y secundarias reales.
 *
 * ── Uso ─────────────────────────────────────────────────────────────────────────────────────────
 *
 *   pnpm --filter @hotel/contracts inject:data                     # inyeccion completa
 *   pnpm --filter @hotel/contracts inject:data -- --dry-run        # solo informa, no firma nada
 *   pnpm --filter @hotel/contracts inject:data -- --skip-chain     # solo operadores de la BD
 *   pnpm --filter @hotel/contracts inject:data -- --skip-db        # solo cadena
 *   pnpm --filter @hotel/contracts inject:data -- --rotate-operators
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
import { anvilChain, buildNightMetadata, roomTypeOf, toRoomTypeDb, type NightType } from "@hotel/shared/domain";
import { hotelNightsAbi } from "@hotel/shared/abi";
import { ANVIL_ACCOUNTS } from "./dev-accounts";

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

const owner: AccountPlan = {
  slot: 0,
  label: "propietario/administrador",
  account: privateKeyToAccount(ANVIL_ACCOUNTS.owner),
};
const receptionOperator: AccountPlan = {
  slot: 1,
  label: "operador de check-in",
  account: privateKeyToAccount(ANVIL_ACCOUNTS.reception),
};
const userA: AccountPlan = {
  slot: 2,
  label: "usuario de reservas A",
  account: privateKeyToAccount(ANVIL_ACCOUNTS.userA),
};
const userB: AccountPlan = {
  slot: 3,
  label: "usuario de reservas B",
  account: privateKeyToAccount(ANVIL_ACCOUNTS.userB),
};

const ACCOUNTS = [owner, receptionOperator, userA, userB] as const;

/** Rol on-chain → cuenta que debe tenerlo (topologia pedida). */
const ROLES: readonly { name: string; slot: number; why: string }[] = [
  { name: "DEFAULT_ADMIN_ROLE", slot: 0, why: "gobierno del contrato (conceder/revocar roles)" },
  { name: "MINTER_ROLE", slot: 0, why: "publicar noches desde el back-office" },
  { name: "PAUSER_ROLE", slot: 0, why: "pausar y reanudar el sistema" },
  { name: "BURNER_ROLE", slot: 0, why: "quema programada de noches caducadas" },
  { name: "TREASURER_ROLE", slot: 0, why: "retirar los fondos de la tesoreria" },
  { name: "RECEPTION_ROLE", slot: 0, why: "el propietario conserva acceso a recepcion" },
  { name: "RECEPTION_ROLE", slot: 1, why: "operador de check-in del mostrador" },
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

  const operators = [
    { plan: owner, role: "DEFAULT_ADMIN_ROLE" as const, username: "admin@hotel.es" },
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
  { room: 101, type: "simple", priceEth: "0.05", buyer: userA },
  { room: 108, type: "simple", priceEth: "0.06", buyer: userB },
  { room: 118, type: "doble", priceEth: "0.09", buyer: userA },
  { room: 124, type: "doble", priceEth: "0.1", buyer: userB },
  { room: 202, type: "suite", priceEth: "0.25", buyer: userA },
  { room: 210, type: "suite", priceEth: "0.3", buyer: userB },
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

  // 4.1 Minteo con la cuenta propietaria (MINTER_ROLE).
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
    const hash = await send(owner, "mint", [
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

  // 4.3 Reventa: el usuario B lista una de sus noches y A la recompra (genera royalty real).
  if (!values["no-reservations"]) {
    const resale = mintedTokens.find((entry) => entry.plan.buyer === userB);
    if (resale) {
      const resalePrice = parseEther("0.15");
      const listHash = await send(userB, "list", [resale.tokenId, resalePrice]);
      log(`  listada        ${resale.tokenId} por cuenta 3 a 0.15 ETH · tx ${listHash}`);

      const buyHash = await send(userA, "buyResale", [resale.tokenId], resalePrice);
      log(`  revendida      ${resale.tokenId} a cuenta 2 · tx ${buyHash}`);

      const ownerNow = await ownerOf(resale.tokenId);
      log(`  titular ahora  ${ownerNow} (esperado ${userA.account.address})`);
      if (ownerNow?.toLowerCase() !== userA.account.address.toLowerCase()) {
        throw new Error("la reventa no dejo la noche en manos del usuario A");
      }
    }
  }

  // 4.4 Resumen del estado final de lo inyectado.
  heading("Resumen de lo inyectado");
  for (const { plan, tokenId } of mintedTokens) {
    const holder = await ownerOf(tokenId);
    const sold = await soldOnce(tokenId);
    const label = holder?.toLowerCase() === userA.account.address.toLowerCase() ? "usuario A" : holder?.toLowerCase() === userB.account.address.toLowerCase() ? "usuario B" : holder;
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
