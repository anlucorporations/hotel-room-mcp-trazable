import { ImageResponse } from "next/og";

/**
 * Imagen social (Open Graph / Twitter) de la suite pública (propuesta de imagen visual · Fase D).
 *
 * Se genera **en código** con los tokens de marca (`ocean`, `sand`, `champagne`, `terracotta`), no
 * como un PNG suelto: así no puede quedar desincronizada de la paleta —el guardián
 * `brand-pieces.test.ts` mide los mismos HEX— y se regenera sola al cambiar el sistema visual.
 *
 * Next la sirve en `/opengraph-image` y la anuncia en el `<head>` de todas las rutas.
 */

export const runtime = "edge";
export const alt = "Hotel Marina del Sol — 50 habitaciones en Alicante, noches en propiedad";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Tokens del sistema visual (mismos valores que `packages/config/tailwind/preset.cjs`). */
const OCEAN = "#0F2C3F";
const OCEAN_SOFT = "#16455E";
const SAND = "#FBF6EC";
const CHAMPAGNE = "#C5A880";
const TERRACOTTA = "#C0542E";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: `linear-gradient(160deg, ${OCEAN} 0%, ${OCEAN_SOFT} 100%)`,
          padding: "72px 80px",
          color: SAND,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 56, height: 4, background: CHAMPAGNE }} />
          <span
            style={{
              fontSize: 26,
              letterSpacing: 6,
              textTransform: "uppercase",
              color: CHAMPAGNE,
            }}
          >
            Hotel Marina del Sol
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <span style={{ fontSize: 84, lineHeight: 1.05, color: SAND }}>
            Tus noches en el Mediterráneo,
          </span>
          <span style={{ fontSize: 84, lineHeight: 1.05, color: CHAMPAGNE }}>
            en propiedad y trazables.
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 30, color: SAND, opacity: 0.9 }}>
            50 habitaciones · Alicante · reserva desde la web
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 96, height: 6, background: TERRACOTTA }} />
            <span style={{ fontSize: 28, color: SAND }}>marinadelsol.es</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
