"use client";

import { useTranslations } from "next-intl";
import { formatEther } from "viem";
import { useReadContract } from "wagmi";
import { hotelNightsAbi } from "@hotel/shared/abi";
import { activeChain, contractAddress, deploymentBlock } from "@/config/chain";
import { AdminCard } from "@/components/admin/AdminPanel";

/**
 * Estado del contrato canónico (RF-43, CU-43): dirección, red, bloque de despliegue, pausa,
 * tesorería, suelo de listado y propiedad. **Solo lectura**: las acciones de gobernanza viven en
 * los componentes `AdminRoles` y `AdminPause`, que esta página embebe.
 */
export function SystemContractState() {
  const t = useTranslations("system");

  const paused = useReadContract({ address: contractAddress, abi: hotelNightsAbi, functionName: "paused" });
  const treasury = useReadContract({ address: contractAddress, abi: hotelNightsAbi, functionName: "treasury" });
  const minListing = useReadContract({ address: contractAddress, abi: hotelNightsAbi, functionName: "minListingPrice" });
  const owner = useReadContract({ address: contractAddress, abi: hotelNightsAbi, functionName: "owner" });

  const value = (data: unknown): string => {
    if (data === undefined) return t("loadingValue");
    if (typeof data === "bigint") return data.toString();
    return String(data);
  };

  return (
    <AdminCard>
      <h2 className="font-display text-h3 font-semibold">{t("contractStateTitle")}</h2>
      <dl data-testid="contract-state" className="mt-3 grid gap-2 text-small tablet:grid-cols-2">
        <div><dt className="text-ink-soft">{t("fieldAddress")}</dt><dd className="font-mono break-all">{contractAddress}</dd></div>
        <div><dt className="text-ink-soft">{t("fieldChain")}</dt><dd>{activeChain.id}</dd></div>
        <div><dt className="text-ink-soft">{t("fieldDeploymentBlock")}</dt><dd>{deploymentBlock.toString()}</dd></div>
        <div><dt className="text-ink-soft">{t("fieldPaused")}</dt><dd>{paused.data === undefined ? t("loadingValue") : paused.data ? t("yes") : t("no")}</dd></div>
        <div><dt className="text-ink-soft">{t("fieldTreasury")}</dt><dd className="font-mono break-all">{value(treasury.data)}</dd></div>
        <div><dt className="text-ink-soft">{t("fieldMinListing")}</dt><dd>{minListing.data === undefined ? t("loadingValue") : `${formatEther(minListing.data)} ETH`}</dd></div>
        <div><dt className="text-ink-soft">{t("fieldOwner")}</dt><dd className="font-mono break-all">{value(owner.data)}</dd></div>
      </dl>
    </AdminCard>
  );
}
