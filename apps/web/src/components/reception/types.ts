import type { RoomBoardStatus } from "@hotel/shared/domain";

/** Contrato de datos del panel de recepción (incremento v2). Espejo de las respuestas de la API. */

export type ReservationStatus = "SOLD" | "CHECKED_IN" | "CHECKED_OUT";

export interface Reservation {
  readonly tokenId: string;
  readonly roomNumber: number;
  readonly roomType: string;
  readonly checkInDate: string;
  readonly status: ReservationStatus;
  readonly currentOwner: string;
  readonly recoveryCode: string | null;
  readonly checkedInAt: string | null;
}

export interface RoomCell {
  readonly roomNumber: number;
  readonly roomType: string | null;
  readonly status: RoomBoardStatus;
}

export interface DayStats {
  readonly totalRooms: number;
  readonly reserved: number;
  readonly occupied: number;
  readonly departures: number;
  readonly free: number;
  readonly blocked: number;
}

export interface OverviewResponse {
  readonly date: string;
  readonly reservations: readonly Reservation[];
  readonly rooms: readonly RoomCell[];
  readonly stats: DayStats;
}

export type ChargeStatus = "PENDING" | "CANCELLED" | "PAID";

export interface Charge {
  readonly id: string;
  readonly tokenId: string;
  readonly concept: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly status: ChargeStatus;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly cancelledBy: string | null;
  readonly cancelledAt: string | null;
  readonly cancelReason: string | null;
}

export interface CheckoutReceipt {
  readonly checkout: {
    readonly id: string;
    readonly tokenId: string;
    readonly roomNumber: number;
    readonly roomCondition: "OK" | "INCIDENCIA";
    readonly chargesCancelled: number;
    readonly processedBy: string;
    readonly incidents: readonly { id: string; kind: string; description: string | null }[];
  };
  readonly created: boolean;
}
