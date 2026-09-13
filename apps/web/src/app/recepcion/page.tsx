"use client";

import { useState } from "react";
import { PublicShell } from "@/components/layout/PublicShell";

interface CheckInSuccessData {
  tokenId: string;
  roomNumber: number;
  checkInDate: string;
  roomType: string;
}

export default function ReceptionPage() {
  const [mode, setMode] = useState<"scan" | "contingency">("scan");
  const [ticketJws, setTicketJws] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckInSuccessData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Formulario de contingencia
  const [roomNumber, setRoomNumber] = useState("");
  const [checkInDate, setCheckInDate] = useState("");
  const [proofType, setProofType] = useState<"WALLET_ADDRESS" | "TX_HASH" | "VOUCHER_CODE">("WALLET_ADDRESS");
  const [proofValue, setProofValue] = useState("");
  const [reason, setReason] = useState("Huésped sin dispositivo móvil / verificación física");

  async function handleScanSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Extraer JWS si viene la URL completa
      let jws = ticketJws.trim();
      if (jws.includes("#ticket=")) {
        jws = jws.split("#ticket=")[1] || jws;
      }

      const res = await fetch("/api/reception/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketJws: jws }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Error al validar check-in");

      setResult(data);
      setTicketJws("");
    } catch (err: any) {
      setError(err.message || "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  async function handleContingencySubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/reception/checkin/contingency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomNumber: parseInt(roomNumber, 10),
          checkInDate,
          possessionProofType: proofType,
          possessionProofValue: proofValue.trim(),
          reason,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Error al procesar check-in asistido");

      setResult(data);
      setProofValue("");
    } catch (err: any) {
      setError(err.message || "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PublicShell>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-5 py-10">
        <header className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-sea/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-sea">
              Puesto de Control
            </span>
            <span className="text-xs text-ink-soft">RD 933/2021 Compliant</span>
          </div>
          <h1 className="font-display text-h2 font-semibold tracking-tight text-ink">
            Validación de Recepción & Check-in
          </h1>
          <p className="text-body text-ink-soft">
            Valida los resguardos QR/JWS de los huéspedes o gestiona el protocolo de contingencia presencial.
          </p>
        </header>

        {/* Selector de Modo */}
        <div className="flex rounded-pill border border-line bg-sand-2 p-1">
          <button
            type="button"
            onClick={() => {
              setMode("scan");
              setError(null);
              setResult(null);
            }}
            className={`flex-1 rounded-pill py-2 text-center text-small font-semibold transition ${
              mode === "scan" ? "bg-sea text-shell shadow-sm" : "text-ink-soft hover:text-ink"
            }`}
          >
            Escaneo QR / JWS
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("contingency");
              setError(null);
              setResult(null);
            }}
            className={`flex-1 rounded-pill py-2 text-center text-small font-semibold transition ${
              mode === "contingency" ? "bg-sea text-shell shadow-sm" : "text-ink-soft hover:text-ink"
            }`}
          >
            Protocolo de Contingencia (Sin Móvil)
          </button>
        </div>

        {/* Mensajes de Resultado */}
        {result && (
          <div
            data-testid="checkin-success-banner"
            className="rounded-brand border border-emerald-300 bg-emerald-50 p-6 text-emerald-900"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                ✓
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="font-display text-body font-semibold">
                  ¡Check-in Confirmado Exitosamente!
                </h3>
                <p className="text-small text-emerald-800">
                  Habitación <strong>{result.roomNumber}</strong> ({result.roomType}) · Fecha:{" "}
                  <strong>{result.checkInDate}</strong>
                </p>
                <p className="text-xs text-emerald-700">
                  Token ID: <span className="font-mono">{result.tokenId}</span> · Se ha
                  despachado la confirmación on-chain y el registro en el PMS.
                </p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div
            data-testid="checkin-error-banner"
            className="rounded-brand border border-red-300 bg-red-50 p-4 text-red-900"
          >
            <p className="text-small font-medium">{error}</p>
          </div>
        )}

        {/* Modo 1: Escáner / Token JWS */}
        {mode === "scan" && (
          <section className="rounded-brand border border-line bg-shell p-6 shadow-sm">
            <h2 className="font-display text-h3 font-semibold text-ink">
              Lectura de Resguardo Digital
            </h2>
            <p className="mt-1 text-small text-ink-soft">
              Pega el contenido del código QR o el token JWS escaneado desde el lector de mano.
            </p>

            <form onSubmit={handleScanSubmit} className="mt-6 flex flex-col gap-4">
              <div>
                <label htmlFor="ticketJws" className="block text-small font-medium text-ink">
                  Token JWS o URL del Resguardo
                </label>
                <textarea
                  id="ticketJws"
                  rows={4}
                  required
                  value={ticketJws}
                  onChange={(e) => setTicketJws(e.target.value)}
                  placeholder="https://hotel.marinadelsol.es/checkin#ticket=eyJhbGciOi..."
                  className="mt-1 w-full rounded-brand border border-line bg-sand-2 p-3 font-mono text-small text-ink placeholder:text-ink-soft focus:border-sea focus:outline-none focus:ring-1 focus:ring-sea"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !ticketJws.trim()}
                className="min-h-touch rounded-brand bg-sea px-6 py-3 font-semibold text-shell transition hover:bg-sea-deep disabled:opacity-50"
              >
                {loading ? "Validando en < 500ms…" : "Confirmar Check-in Inmediato"}
              </button>
            </form>
          </section>
        )}

        {/* Modo 2: Protocolo de Contingencia */}
        {mode === "contingency" && (
          <section className="rounded-brand border border-line bg-shell p-6 shadow-sm">
            <h2 className="font-display text-h3 font-semibold text-ink">
              Protocolo de Contingencia Asistida
            </h2>
            <p className="mt-1 text-small text-ink-soft">
              Uso exclusivo para huéspedes sin dispositivo móvil. Coteja la identidad y el factor de
              posesión antes de registrar la entrada.
            </p>

            <form onSubmit={handleContingencySubmit} className="mt-6 flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="roomNumber" className="block text-small font-medium text-ink">
                    Número de Habitación
                  </label>
                  <input
                    id="roomNumber"
                    type="number"
                    required
                    value={roomNumber}
                    onChange={(e) => setRoomNumber(e.target.value)}
                    placeholder="101"
                    className="mt-1 w-full rounded-brand border border-line bg-sand-2 p-2.5 text-small text-ink focus:border-sea focus:outline-none focus:ring-1 focus:ring-sea"
                  />
                </div>

                <div>
                  <label htmlFor="checkInDate" className="block text-small font-medium text-ink">
                    Fecha de Entrada (YYYY-MM-DD)
                  </label>
                  <input
                    id="checkInDate"
                    type="date"
                    required
                    value={checkInDate}
                    onChange={(e) => setCheckInDate(e.target.value)}
                    className="mt-1 w-full rounded-brand border border-line bg-sand-2 p-2.5 text-small text-ink focus:border-sea focus:outline-none focus:ring-1 focus:ring-sea"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="proofType" className="block text-small font-medium text-ink">
                    Factor de Posesión a Verificar
                  </label>
                  <select
                    id="proofType"
                    value={proofType}
                    onChange={(e: any) => setProofType(e.target.value)}
                    className="mt-1 w-full rounded-brand border border-line bg-sand-2 p-2.5 text-small text-ink focus:border-sea focus:outline-none focus:ring-1 focus:ring-sea"
                  >
                    <option value="WALLET_ADDRESS">Dirección Wallet Compradora</option>
                    <option value="TX_HASH">Hash de Transacción Polygonscan</option>
                    <option value="VOUCHER_CODE">Código de Resguardo Impreso / Email</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="proofValue" className="block text-small font-medium text-ink">
                    Valor de Prueba / Dato de Cotejo
                  </label>
                  <input
                    id="proofValue"
                    type="text"
                    required
                    value={proofValue}
                    onChange={(e) => setProofValue(e.target.value)}
                    placeholder="0x71C... o hash tx"
                    className="mt-1 w-full rounded-brand border border-line bg-sand-2 p-2.5 font-mono text-small text-ink focus:border-sea focus:outline-none focus:ring-1 focus:ring-sea"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="reason" className="block text-small font-medium text-ink">
                  Motivo de Contingencia
                </label>
                <input
                  id="reason"
                  type="text"
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="mt-1 w-full rounded-brand border border-line bg-sand-2 p-2.5 text-small text-ink focus:border-sea focus:outline-none focus:ring-1 focus:ring-sea"
                />
              </div>

              <div className="rounded-brand bg-sand-2 p-4 text-xs text-ink-soft">
                <strong>Aviso Normativo RD 933/2021:</strong> Al confirmar este check-in, el
                recepcionista declara haber registrado físicamente el parte de entrada de viajeros
                en el software oficial PMS del establecimiento hotelero.
              </div>

              <button
                type="submit"
                disabled={loading}
                className="min-h-touch rounded-brand bg-sea px-6 py-3 font-semibold text-shell transition hover:bg-sea-deep disabled:opacity-50"
              >
                {loading ? "Procesando…" : "Validar y Autorizar Entrada"}
              </button>
            </form>
          </section>
        )}
      </div>
    </PublicShell>
  );
}
