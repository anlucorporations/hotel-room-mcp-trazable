import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getDbPool, resolveRoomDetailState, type RoomDetailState } from "@hotel/shared";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

/**
 * GET /api/reception/rooms/:roomNumber
 *
 * Ficha detalle de una habitación para recepción (RF-51..RF-55).
 *
 * Devuelve dos zonas —habitación y huésped— y un `state` explícito que decide su contenido:
 *
 *   · `RESERVADA`         → checklist de preparación previo a la llegada + ocupación del huésped.
 *   · `OCUPADA`           → calendario del rango de la estancia (limpieza/mantenimiento/cargos/novedades).
 *   · `MANTENIMIENTO`     → descripción del mantenimiento en curso.
 *   · `LIBRE`             → resumen del estado de la habitación (checklist).
 *   · `PENDIENTE_LIMPIEZA`→ checklist y botón de liberación (RF-50).
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

    // Checklist de preparación (RF-51/RF-55): último registro por ítem, independiente del turno.
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

    // Mantenimiento abierto: si existe, la habitación está en estado MANTENIMIENTO (RF-53).
    const maintenanceRows = await pool.query(
      `SELECT id, kind, description, priority, status, reported_by, assigned_to, created_at
         FROM maintenance_incidents
        WHERE room_id = $1 AND status IN ('OPEN', 'IN_PROGRESS')
        ORDER BY created_at DESC
        LIMIT 1`,
      [room.id],
    );
    const maintenance = maintenanceRows.rows[0] ?? null;

    // Noche de HOY de esta habitación: es la que determina ocupación y huésped (RF-52).
    // El estado de ocupación vive en `nfts.status` (CHECKED_IN), no en `reservations.status`.
    const todayNightRows = await pool.query(
      `SELECT rn.reservation_id, rn.token_id, n.status AS night_status, n.current_owner
         FROM reservation_nights rn
         LEFT JOIN nfts n ON n.token_id = rn.token_id
        WHERE rn.room_id = $1 AND rn.night_date = CURRENT_DATE AND rn.active = TRUE
        LIMIT 1`,
      [room.id],
    );
    const todayNight = todayNightRows.rows[0] ?? null;

    // Si no hay noche hoy, la próxima reserva activa (llegada futura) define el estado RESERVADA.
    let upcomingReservationId: string | null = todayNight?.reservation_id ?? null;
    if (!upcomingReservationId) {
      const upcoming = await pool.query(
        `SELECT id FROM reservations
          WHERE room_id = $1 AND status IN ('PENDING', 'CONFIRMED') AND check_in_date > CURRENT_DATE
          ORDER BY check_in_date ASC
          LIMIT 1`,
        [room.id],
      );
      upcomingReservationId = upcoming.rows[0]?.id ?? null;
    }

    // Estado de la ficha (RF-51). El criterio vive en `@hotel/shared` (función pura y probada).
    const operationalStatus = String(room.operational_status);
    const nightStatus = todayNight?.night_status ? String(todayNight.night_status) : null;
    const state: RoomDetailState = resolveRoomDetailState({
      hasOpenMaintenance: Boolean(maintenance),
      operationalStatus,
      nightStatus,
      hasUpcomingReservation: Boolean(upcomingReservationId),
    });

    // La ficha solo muestra huésped cuando hay estancia en curso o reserva vigente.
    const showReservation = state === "OCUPADA" || state === "RESERVADA";

    let reservation: Record<string, unknown> | null = null;
    if (showReservation && upcomingReservationId) {
      const reservationRows = await pool.query(
        `SELECT id, check_in_date, check_out_date, status,
                adult_count, child_count, baby_count, pet_count, accessibility_count
           FROM reservations
          WHERE id = $1`,
        [upcomingReservationId],
      );
      const row = reservationRows.rows[0];
      if (row) {
        // Wallet del titular (RF-52): se sirve **recortada** para preservar la confidencialidad.
        let currentOwner: string | null = (todayNight?.current_owner as string) ?? null;
        if (!currentOwner && todayNight?.token_id) {
          const ownerRow = await pool.query(`SELECT current_owner FROM nfts WHERE token_id = $1`, [
            todayNight.token_id,
          ]);
          currentOwner = (ownerRow.rows[0]?.current_owner as string) ?? null;
        }
        reservation = {
          id: row.id,
          checkInDate: row.check_in_date,
          checkOutDate: row.check_out_date,
          status: row.status,
          adultCount: row.adult_count,
          childCount: row.child_count,
          babyCount: row.baby_count,
          petCount: row.pet_count,
          accessibilityCount: row.accessibility_count,
          tokenId: todayNight?.token_id ?? null,
          currentOwner,
        };
      }
    }

    // Calendario de la estancia (RF-52, solo OCUPADA): rango completo con marcas por fecha.
    let calendar: Array<{
      date: string;
      cleaning: boolean;
      maintenance: boolean;
      charges: boolean;
      notes: boolean;
    }> | null = null;

    if (state === "OCUPADA" && reservation) {
      const start = new Date(String(reservation.checkInDate));
      const end = new Date(String(reservation.checkOutDate));
      const dates: string[] = [];
      for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
        dates.push(d.toISOString().slice(0, 10));
      }

      if (dates.length > 0) {
        const [cleaningRows, maintRows, chargeRows, noteRows] = await Promise.all([
          pool.query(
            `SELECT DISTINCT changed_at::date AS date
               FROM housekeeping_room_logs
              WHERE room_id = $1 AND changed_at::date = ANY($2::date[])`,
            [room.id, dates],
          ),
          pool.query(
            `SELECT DISTINCT e.created_at::date AS date
               FROM maintenance_incident_events e
               JOIN maintenance_incidents i ON i.id = e.incident_id
              WHERE i.room_id = $1 AND e.created_at::date = ANY($2::date[])`,
            [room.id, dates],
          ),
          pool.query(
            `SELECT DISTINCT rn.night_date AS date
               FROM reservation_nights rn
               JOIN additional_charges ac ON ac.token_id = rn.token_id
              WHERE rn.room_id = $1 AND rn.night_date = ANY($2::date[])`,
            [room.id, dates],
          ),
          pool.query(
            `SELECT DISTINCT rn.night_date AS date
               FROM reservation_nights rn
               JOIN stay_checkouts sc ON sc.token_id = rn.token_id
               JOIN checkout_incidents ci ON ci.checkout_id = sc.id
              WHERE rn.room_id = $1 AND rn.night_date = ANY($2::date[])`,
            [room.id, dates],
          ),
        ]);

        const toSet = (rows: Array<{ date: unknown }>): Set<string> =>
          new Set(rows.map((r) => String(r.date)));

        const cleaningSet = toSet(cleaningRows.rows);
        const maintSet = toSet(maintRows.rows);
        const chargeSet = toSet(chargeRows.rows);
        const noteSet = toSet(noteRows.rows);

        calendar = dates.map((date) => ({
          date,
          cleaning: cleaningSet.has(date),
          maintenance: maintSet.has(date),
          charges: chargeSet.has(date),
          notes: noteSet.has(date),
        }));
      }
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
      state,
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
      reservation,
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
