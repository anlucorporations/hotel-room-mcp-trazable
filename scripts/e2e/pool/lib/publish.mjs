import { adminLogin, api } from "./admin.mjs";
import { currentTotp } from "./totp.mjs";

/** Publica un lote de habitaciones para UNA fecha (AAAA-MM-DD) con un único TOTP. */
export async function publishForDate(session, roomIds, date) {
  return api(session, "/api/admin/rooms/bulk/publish", {
    method: "POST",
    body: JSON.stringify({ roomIds, date, confirmTotpCode: currentTotp() }),
  });
}

/** Lista las habitaciones del back-office. */
export async function listRooms(session) {
  const res = await api(session, "/api/admin/rooms");
  if (!res.ok) throw new Error(`rooms ${res.status}: ${res.text.slice(0, 300)}`);
  return res.json.rooms;
}

export async function loginAdmin() {
  return adminLogin();
}
