import { formatEther } from "viem";
import { splitYYYYMMDD, type NightType } from "@hotel/shared";

export function formatEth(wei: string): string {
  return `${formatEther(BigInt(wei))} ETH`;
}

export function formatNightDate(yyyymmdd: number): string {
  const { year, month, day } = splitYYYYMMDD(yyyymmdd);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(day)}/${pad(month)}/${year}`;
}

export const TYPE_LABEL: Readonly<Record<NightType, string>> = {
  simple: "Simple",
  doble: "Doble",
  suite: "Suite",
};
