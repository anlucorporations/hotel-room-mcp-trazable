import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Entrada del back-office: redirige al panel por defecto (Métricas, accesible a toda sesión). */
export default function AdminIndexPage() {
  redirect("/admin/dashboard");
}
