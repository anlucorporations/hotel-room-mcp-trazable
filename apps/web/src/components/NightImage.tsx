"use client";

import { useState } from "react";
import type { NightType } from "@hotel/shared";

/**
 * Imagen de la noche servida por host/CDN (ADR-12). Si no resuelve, muestra un placeholder
 * accesible (`img-fallback`, CU-04 04c) sin bloquear la compra.
 */
export function NightImage({ type, alt }: { type: NightType; alt: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        data-testid="img-fallback"
        role="img"
        aria-label={alt}
        className="flex h-40 w-full items-center justify-center bg-slate-200 text-sm text-slate-500"
      >
        Imagen no disponible
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- placeholders locales en dev; next/image en prod (ADR-12)
    <img
      src={`/images/${type}.svg`}
      alt={alt}
      className="h-40 w-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}
