"use client";

import { useRouter } from "next/navigation";
import { ChangePinForm } from "@/components/terminal/TerminalLogin";

/** Rotación de PIN desde el propio terminal (F5 · T5.3). */
export default function TerminalChangePinPage() {
  const router = useRouter();
  return <ChangePinForm onDone={() => router.push("/terminal")} />;
}
