/**
 * Entradas del menú desplegable de la billetera/usuario (RF-40, CU-40).
 *
 * Función **pura** para poder probarla sin DOM: dado el estado de sesión, de wallet y los roles del
 * operador, decide qué acciones ofrece el menú. La seguridad real vive en el servidor (RNF-40); esto
 * es solo la vista.
 *
 * D-77: con sesión, el menú ofrece el **acceso a las otras suites** que corresponden al tipo de
 * usuario (owner → las cuatro; recepción → Front Office; housekeeping/mantenimiento → su ruta; otros
 * roles de back-office → Administración), delante de las acciones de cuenta.
 */

import { suiteLinksForRoles, type SuiteKey } from "./suite-access";

export type WalletMenuAction =
  | "connect"
  | "switchNetwork"
  | "disconnect"
  | "suiteAdmin"
  | "suiteReception"
  | "suiteHousekeeping"
  | "suiteMaintenance"
  | "security"
  | "users"
  | "roles"
  | "admin"
  | "signOut";

export interface WalletMenuInput {
  readonly hasSession: boolean;
  readonly isOwner: boolean;
  readonly isConnected: boolean;
  readonly isWrongNetwork: boolean;
  /** Roles de la sesión (D-77); vacío o ausente = sin acceso a suites. */
  readonly roles?: readonly string[];
}

export interface WalletMenuItem {
  readonly action: WalletMenuAction;
  /** Ruta destino de las acciones de navegación. */
  readonly href?: string;
}

/** Acción del menú correspondiente a cada suite. */
const SUITE_ACTION: Readonly<Record<SuiteKey, WalletMenuAction>> = {
  admin: "suiteAdmin",
  reception: "suiteReception",
  housekeeping: "suiteHousekeeping",
  maintenance: "suiteMaintenance",
};

export function walletMenuItems(input: WalletMenuInput): readonly WalletMenuItem[] {
  const items: WalletMenuItem[] = [];

  // Acción de wallet (una sola según el estado).
  if (input.isConnected && input.isWrongNetwork) {
    items.push({ action: "switchNetwork" });
  } else if (input.isConnected) {
    items.push({ action: "disconnect" });
  } else {
    items.push({ action: "connect" });
  }

  if (input.hasSession) {
    // D-77: accesos a las suites según el tipo de usuario, antes de las acciones de cuenta.
    for (const suite of suiteLinksForRoles(input.roles ?? [], input.isOwner)) {
      items.push({ action: SUITE_ACTION[suite.key], href: suite.href });
    }
    // Gestión de la propia cuenta: disponible para cualquier rol de back-office.
    items.push({ action: "security", href: "/admin/seguridad" });
    // Gestión de la plataforma: solo el owner (DEFAULT_ADMIN_ROLE).
    if (input.isOwner) {
      items.push({ action: "users", href: "/admin/sistemas/usuarios" });
      items.push({ action: "roles", href: "/admin/roles" });
    }
    items.push({ action: "signOut" });
  } else {
    // Sin sesión: solo iniciar sesión (D-77); los accesos a suites requieren sesión válida.
    items.push({ action: "admin", href: "/admin" });
  }

  return items;
}
