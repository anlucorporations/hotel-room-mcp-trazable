import { z } from "zod";

/**
 * Registro de despliegue por cadena (ADR-09): `deployments/<chainId>.json`.
 * Es isomórfico (sin acceso a disco); el lector con `fs` vive en el subpath `./deployments`.
 */

const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "dirección inválida");
const abiHashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "hash de ABI inválido");

/**
 * Despliegue del contrato auxiliar `HotelOperations` (vNext · F2). Opcional para no invalidar los
 * registros anteriores: el contrato se despliega aparte de `HotelNights` y su ausencia significa
 * «todavía no hay operaciones firmadas en esta cadena».
 */
export const operationsDeploymentSchema = z.object({
  address: addressSchema,
  deploymentBlock: z.number().int().nonnegative(),
  abiHash: abiHashSchema,
});

export type OperationsDeployment = z.infer<typeof operationsDeploymentSchema>;

export const deploymentSchema = z.object({
  chainId: z.number().int().positive(),
  address: addressSchema,
  deploymentBlock: z.number().int().nonnegative(),
  abiHash: abiHashSchema,
  deployedAt: z.string().optional(),
  // Faucet de pruebas (RF-21, ADR-13): opcional — solo presente en dev/test, nunca en
  // producción. Retrocompatible: los despliegues anteriores sin faucet siguen siendo válidos.
  faucet: addressSchema.optional(),
  // Contrato de operaciones firmadas (F2): opcional y retrocompatible con los registros previos.
  operations: operationsDeploymentSchema.optional(),
});

export type Deployment = z.infer<typeof deploymentSchema>;
