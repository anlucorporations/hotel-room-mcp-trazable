import { z } from "zod";

/**
 * Registro de despliegue por cadena (DISEÑO §14): `deployments/<chainId>.json`.
 * Es isomórfico (sin acceso a disco); el lector con `fs` vive en el subpath `./deployments`.
 */
export const deploymentSchema = z.object({
  chainId: z.number().int().positive(),
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/, "dirección inválida"),
  deploymentBlock: z.number().int().nonnegative(),
  abiHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "hash de ABI inválido"),
  deployedAt: z.string().optional(),
});

export type Deployment = z.infer<typeof deploymentSchema>;
