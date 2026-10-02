"use client";

import { useState } from "react";
import Image from "next/image";
import type { NightType } from "@hotel/shared/domain";

/**
 * Imagen de la noche servida por host/CDN (ADR-12) vía `next/image` (UX#10): el contenedor
 * padre fija el ratio (`aspect-[4/3]`), así que se usa `fill` + `sizes` para reservar el hueco
 * y evitar CLS. `priority` activa carga ansiosa + `fetchPriority="high"` solo en las primeras
 * tarjetas (LCP); el resto carga `lazy` por defecto. Si la imagen no resuelve, cae a un
 * placeholder accesible (`img-fallback`, CU-04 04c, docs/SRS.md §9) sin bloquear la compra.
 */
export function NightImage({
  type,
  alt,
  priority = false,
}: {
  type: NightType;
  alt: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        data-testid="img-fallback"
        role="img"
        aria-label={alt}
        className="flex h-full w-full items-center justify-center bg-gradient-to-br from-azure to-fern font-display text-small tracking-wide text-shell"
      >
        Imagen no disponible
      </div>
    );
  }

  return (
    <Image
      src={`/images/${type}.svg`}
      alt={alt}
      fill
      sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
      priority={priority}
      // Los placeholders de habitación son SVG vectoriales: el optimizador no los reescala
      // (ver next.config) y, de hecho, devuelve 400 al pedir `/_next/image` sobre ellos. Se
      // sirven tal cual con `unoptimized` (mismo origen, CSP estricta), evitando el fallback
      // espurio y los reflows del 400. Para el CDN real (ADR-12) se quitará `unoptimized`.
      unoptimized
      className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
      onError={() => setFailed(true)}
    />
  );
}
