/**
 * Helpers de navegación compartidos por los shells (DRY, MINOR#36).
 *
 * Unifica el criterio de «ruta activa» entre la cabecera pública y el back-office:
 * coincidencia exacta o prefijo seguido de separador (`/`). Así `/historico` no
 * marca activo a `/historicos` y la home (`/`) solo se activa en `/`.
 */
export function isActiveRoute(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
