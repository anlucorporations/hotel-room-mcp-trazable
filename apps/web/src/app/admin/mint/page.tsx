import { getTranslations } from "next-intl/server";
import { AdminMint } from "@/components/admin/AdminMint";

export const dynamic = "force-dynamic";

export default async function AdminMintPage() {
  const t = await getTranslations("admin");
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-10">
      <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
      <AdminMint />
    </main>
  );
}
