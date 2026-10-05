/**
 * URL pública de la **foto de una habitación** a partir del nombre de fichero canónico.
 *
 * Vive en su propio módulo (sin dependencias) para que la usen tanto el código de servidor
 * (`lib/nights.ts`, que enriquece el catálogo) como el de cliente (`useMyNights`, que enriquece «Mis
 * noches»): importar la primera desde un componente de cliente arrastraría al bundle módulos de
 * servidor (`fs`, el repositorio de Postgres…).
 */
export function roomCoverUrl(fileName: string): string {
  return `/api/rooms/images/${fileName}`;
}
