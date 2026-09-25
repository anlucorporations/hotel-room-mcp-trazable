import { createPublicClient, getAddress, http, type Address } from "viem";
import { anvilChain } from "@hotel/shared/domain";
import { hotelNightsAbi } from "@hotel/shared/abi";
import { ANVIL_ADDRESSES } from "./dev-accounts";

/**
 * Verificacion (solo lectura) de la topologia de cuentas del entorno local, contra el contrato.
 *
 * Uso: `pnpm --filter @hotel/contracts exec tsx scripts/verify-accounts.ts`
 */
const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const CONTRACT = getAddress(process.env.CONTRACT_ADDRESS ?? "0x5FbDB2315678afecb367f032d93F642f64180aa3");
const client = createPublicClient({ chain: anvilChain, transport: http(RPC) });

const PLANS: readonly { slot: number; label: string; address: Address; expected: readonly string[] }[] = [
  {
    slot: 0,
    label: "propietario/administrador",
    address: getAddress(ANVIL_ADDRESSES.owner!),
    expected: ["DEFAULT_ADMIN_ROLE", "MINTER_ROLE", "PAUSER_ROLE", "BURNER_ROLE", "TREASURER_ROLE", "RECEPTION_ROLE"],
  },
  { slot: 1, label: "operador de check-in", address: getAddress(ANVIL_ADDRESSES.reception!), expected: ["RECEPTION_ROLE"] },
  { slot: 2, label: "usuario de reservas A", address: getAddress(ANVIL_ADDRESSES.userA!), expected: [] },
  { slot: 3, label: "usuario de reservas B", address: getAddress(ANVIL_ADDRESSES.userB!), expected: [] },
];

const ALL_ROLES = [
  "DEFAULT_ADMIN_ROLE",
  "MINTER_ROLE",
  "PAUSER_ROLE",
  "BURNER_ROLE",
  "TREASURER_ROLE",
  "RECEPTION_ROLE",
] as const;

const roleHash = (name: string): Promise<`0x${string}`> =>
  client.readContract({ address: CONTRACT, abi: hotelNightsAbi, functionName: name as "MINTER_ROLE" }) as Promise<`0x${string}`>;

const hashes = new Map<string, `0x${string}`>();
for (const role of ALL_ROLES) hashes.set(role, await roleHash(role));

const held = new Map<string, string[]>();
for (const plan of PLANS) {
  const roles: string[] = [];
  for (const role of ALL_ROLES) {
    const has = (await client.readContract({
      address: CONTRACT,
      abi: hotelNightsAbi,
      functionName: "hasRole",
      args: [hashes.get(role)!, plan.address],
    })) as boolean;
    if (has) roles.push(role);
  }
  held.set(plan.address, roles);
}

const treasury = (await client.readContract({
  address: CONTRACT,
  abi: hotelNightsAbi,
  functionName: "treasury",
})) as Address;

let deviations = 0;
console.log(`Contrato: ${CONTRACT}`);
console.log(`Tesoreria: ${treasury}`);
console.log("");

for (const plan of PLANS) {
  const roles = held.get(plan.address) ?? [];
  const missing = plan.expected.filter((role) => !roles.includes(role));
  const extra = roles.filter((role) => !plan.expected.includes(role));
  if (missing.length > 0 || extra.length > 0) deviations += 1;
  const status = missing.length > 0 ? "FALTA " : extra.length > 0 ? "EXCESO" : "OK    ";
  console.log(`${status} cuenta ${plan.slot} (${plan.label}) ${plan.address}`);
  console.log(`       roles: ${roles.length > 0 ? roles.join(", ") : "(ninguno)"}`);
  if (missing.length > 0) console.log(`       FALTAN: ${missing.join(", ")}`);
  // El exceso se informa pero NO se considera fallo: por decision del responsable (M9) los roles que
  // ya tenian las cuentas de prueba se conservan. Un FALTA si es un fallo: deja una funcion del
  // sistema sin quien pueda ejercerla.
  if (extra.length > 0) {
    console.log(`       DE MAS: ${extra.join(", ")} (conservado por decision; el script no revoca)`);
  }
}

// El propietario debe ser tambien la tesoreria (requisito 1: es el propietario del hotel).
if (treasury.toLowerCase() !== PLANS[0]!.address.toLowerCase()) {
  console.log(`\nREVISAR: la tesoreria es ${treasury} y no la cuenta 0 (${PLANS[0]!.address})`);
  deviations += 1;
}

const missingAnywhere = PLANS.some((plan) => {
  const roles = held.get(plan.address) ?? [];
  return plan.expected.some((role) => !roles.includes(role));
});
console.log(
  missingAnywhere
    ? `\nTopologia INCOMPLETA: hay roles que faltan (${deviations} cuenta(s) con desviacion)`
    : "\nTopologia CORRECTA: cada cuenta tiene al menos los roles de su papel en el sistema",
);
process.exitCode = missingAnywhere ? 1 : 0;
