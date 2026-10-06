import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getDbPool } from "@hotel/shared";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

/**
 * GET /api/reception/rooms/:roomNumber
 *
 * Ficha detalle de una habitación para recepción (RF-51..RF-55).
 * Devuelve dos zonas: habitación y huésped, según el estado operativo.
 *
 * 200 `{ room, state, checklist, reservation, maintenance, calendar }`
 * 401/403 sin permiso · 404 no encontrada · 500 error
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roomNumber: string }> },
): Promise<NextResponse> {
  const auth = await requireRole(request, "RECEPTION_ROLE");
  if (!auth.ok) return auth.response;

  const roomNumber = Number((await params).roomNumber);
  if (!Number.isInteger(roomNumber) || roomNumber <= 0) {
    return NextResponse.json(
      { error: "HABITACION_INVALIDA", message: "El número de habitación no es válido." },
      { status: 400 },
    );
  }

  const pool = getDbPool();

  try {
    const roomRow = await pool.query(
      `SELECT id, room_number, room_type, floor, capacity, beds, size_m2,
              publication_status, operational_status, is_accessible,
              view_kind, has_balcony
         FROM rooms
        WHERE room_number = $1 AND archived_at IS NULL`,
      [roomNumber],
    );
    if (roomRow.rowCount === 0) {
      return NextResponse.json(
        { error: "HABITACION_NO_ENCONTRADA", message: "La habitación no existe o está archivada." },
        { status: 404 },
      );
    }

    const room = roomRow.rows[0];

    // Último checklist completado por ítem (independientemente de la asignación).
    const checklistRows = await pool.query(
      `SELECT ci.code, ci.name_es, ci.name_en, ci.name_ru, ci.is_mandatory,
              cc.completed, cc.completed_by, cc.completed_at, cc.notes
         FROM room_cleaning_checklist_items ci
         LEFT JOIN LATERAL (
             SELECT completed, completed_by, completed_at, notes
               FROM room_cleaning_checklists
              WHERE room_id = $1 AND item_code = ci.code
              ORDER BY completed_at DESC NULLS LAST, created_at DESC
              LIMIT 1
         ) cc ON TRUE
        ORDER BY ci.sort_order`,
      [room.id],
    );

    // Reserva activa de hoy (check_in <= hoy < check_out) o la próxima llegada.
    const reservationRows = await pool.query(
      `SELECT r.id, r.check_in_date, r.check_out_date, r.status,
              r.adult_count, r.child_count, r.baby_count, r.pet_count, r.accessibility_count,
              rn.token_id
         FROM reservations r
         LEFT JOIN reservation_nights rn
                ON rn.reservation_id = r.id AND rn.night_date = r.check_in_date
        WHERE r.room_id = $1
          AND r.status IN ('PENDING', 'CONFIRMED')
        ORDER BY r.check_in_date ASC
        LIMIT 1`,
      [room.id],
    );

    const reservation = reservationRows.rows[0] ?? null;

    // Wallet del titular del token (RF-52): solo si la reserva ya tiene noche acuñada.
    let currentOwner: string | null = null;
    if (reservation?.token_id) {
      const ownerRow = await pool.query(
        `SELECT current_owner FROM nfts WHERE token_id = $1`,
        [reservation.token_id],
      );
      currentOwner = (ownerRow.rows[0]?.current_owner as string) ?? null;
    }

    // Mantenimiento abierto en la habitación.
    const maintenanceRows = await pool.query(
      `SELECT id, kind, description, priority, status, reported_by, assigned_to, created_at
         FROM maintenance_incidents
        WHERE room_id = $1 AND status IN ('OPEN', 'IN_PROGRESS')
        ORDER BY created_at DESC
        LIMIT 1`,
      [room.id],
    );

    const maintenance = maintenanceRows.rows[0] ?? null;

    // Calendario de ocupación: rango completo de la reserva con flags por fecha.
    let calendar: Array<{ date: string; cleaning: boolean; maintenance: boolean; charges: boolean; notes: boolean }> | null = null;
    if (reservation) {
      const start = new Date(reservation.check_in_date);
      const end = new Date(reservation.check_out_date);
      const dates: string[] = [];
      for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
        dates.push(d.toISOString().slice(0, 10));
      }

      const [cleaningRows, maintRows, chargeRows, noteRows] = await Promise.all([
        pool.query(
          `SELECT changed_at::date AS date
             FROM housekeeping_room_logs
            WHERE room_id = $1 AND changed_at::date = ANY($2::date[])`,
          [room.id, dates],
        ),
        pool.query(
          `SELECT created_at::date AS date
             FROM maintenance_incident_events e
             JOIN maintenance_incidents i ON i.id = e.incident_id
            WHERE i.room_id = $1 AND e.created_at::date = ANY($2::date[])`,
          [room.id, dates],
        ),
        pool.query(
          `SELECT n.check_in_date AS date
             FROM nfts n
             JOIN additional_charges ac ON ac.token_id = n.token_id
            WHERE n.room_number = $1 AND n.check_in_date = ANY($2::date[])`,
          [roomNumber, dates],
        ),
        pool.query(
          `SELECT n.check_in_date AS date
             FROM nfts n
             JOIN stay_checkouts sc ON sc.token_id = n.token_id
             JOIN checkout_incidents ci ON ci.checkout_id = sc.id
            WHERE n.room_number = $1 AND n.check_in_date = ANY($2::date[])`,
          [roomNumber, dates],
        ),
      ]);

      const cleaningSet = new Set(cleaningRows.rows.map((r: { date: unknown }) => String(r.date)));
      const maintSet = new Set(maintRows.rows.map((r: { date: unknown }) => String(r.date)));
      const chargeSet = new Set(chargeRows.rows.map((r: { date: unknown }) => String(r.date)));
      const noteSet = new Set(noteRows.rows.map((r: { date: unknown }) => String(r.date)));

      calendar = dates.map((date) => ({
        date,
        cleaning: cleaningSet.has(date),
        maintenance: maintSet.has(date),
        charges: chargeSet.has(date),
        notes: noteSet.has(date),
      }));
    }

    return NextResponse.json({
      room: {
        id: room.id,
        roomNumber: room.room_number,
        roomType: room.room_type,
        floor: room.floor,
        capacity: room.capacity,
        beds: room.beds,
        sizeM2: room.size_m2,
        publicationStatus: room.publication_status,
        operationalStatus: room.operational_status,
        isAccessible: room.is_accessible,
        viewKind: room.view_kind,
        hasBalcony: room.has_balcony,
      },
      checklist: checklistRows.rows.map((row: Record<string, unknown>) => ({
        code: row.code,
        nameEs: row.name_es,
        nameEn: row.name_en,
        nameRu: row.name_ru,
        isMandatory: row.is_mandatory,
        completed: row.completed ?? false,
        completedBy: row.completed_by,
        completedAt: row.completed_at,
        notes: row.notes,
      })),
      reservation: reservation
        ? {
            id: reservation.id,
            checkInDate: reservation.check_in_date,
            checkOutDate: reservation.check_out_date,
            status: reservation.status,
            adultCount: reservation.adult_count,
            childCount: reservation.child_count,
            babyCount: reservation.baby_count,
            petCount: reservation.pet_count,
            accessibilityCount: reservation.accessibility_count,
            tokenId: reservation.token_id,
            currentOwner,
          }
        : null,
      maintenance: maintenance
        ? {
            id: maintenance.id,
            kind: maintenance.kind,
            description: maintenance.description,
            priority: maintenance.priority,
            status: maintenance.status,
            reportedBy: maintenance.reported_by,
            assignedTo: maintenance.assigned_to,
            createdAt: maintenance.created_at,
          }
        : null,
      calendar,
    });
  } catch (error: unknown) {
    console.error("[API /api/reception/rooms] Error:", error);
    return NextResponse.json(
      {
        error: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "Error al cargar la ficha de la habitación",
      },
      { status: 500 },
    );
  }
}
