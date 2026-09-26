/**
 * Entradas del menú desplegable de la billetera/usuario (RF-40, CU-40).
 *
 * Función **pura** para poder probarla sin DOM: dado el estado de sesión y de wallet, decide qué
 * acciones ofrece el menú. La seguridad real vive en el servidor (RNF-40); esto es solo la vista.
 */

export type WalletMenuAction =
  | "connect"
  | "switchNetwork"
  | "disconnect"
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
}

export interface WalletMenuItem {
  readonly action: WalletMenuAction;
  /** Ruta destino de las acciones de navegación. */
  readonly href?: string;
}

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
    // Gestión de la propia cuenta: disponible para cualquier rol de back-office.
    items.push({ action: "security", href: "/admin/seguridad" });
    // Gestión de la plataforma: solo el owner (DEFAULT_ADMIN_ROLE).
    if (input.isOwner) {
      items.push({ action: "users", href: "/admin/sistemas/usuarios" });
      items.push({ action: "roles", href: "/admin/roles" });
    }
    items.push({ action: "signOut" });
  } else {
    // Sin sesión: acceso al back-office (allí se pedirán las credenciales).
    items.push({ action: "admin", href: "/admin" });
  }

  return items;
}
