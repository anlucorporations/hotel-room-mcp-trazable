/** DTO del módulo de daños (F7) para componentes de cliente. */
export interface DamageNotificationView {
  readonly id: string;
  readonly status: string;
  readonly channel: string;
  readonly dueDate: string;
  readonly concept: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly damageDescription: string;
  readonly roomNumber: number | null;
  readonly evidencePath: string | null;
  readonly disputedAt: string | null;
  readonly resolvedAt: string | null;
}
