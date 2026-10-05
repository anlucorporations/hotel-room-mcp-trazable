"use client";

import { useState } from "react";
import Image from "next/image";
import type { NightType } from "@hotel/shared/domain";

/**
 * Imagen de la noche (UX#10): el contenedor padre fija el ratio (`aspect-[4/3]`), así que se usa
 * `fill` + `sizes` para reservar el hueco y evitar CLS. `priority` activa carga ansiosa +
 * `fetchPriority="high"` solo en las primeras tarjetas (LCP); el resto carga `lazy` por defecto.
 *
 * **Corrección 2026-10-05 (petición del responsable):** antes esta tarjeta pintaba siempre un
 * **placeholder por tipo** (`/images/<tipo>.svg`), de modo que el catálogo no mostraba la foto de la
 * habitación en venta. Ahora, si la noche trae `src` (la portada de **su** habitación, resuelta desde
 * `room_images`), se pinta esa; el placeholder por tipo queda como **reserva** y, si tampoco
 * resuelve, se muestra el aviso accesible `img-fallback` (CU-04 04c) sin bloquear la compra.
 *
 * Nunca se inventa una foto ajena: sin `src` no se enseña la foto de otra habitación.
 */
export function NightImage({
  type,
  src = null,
  alt,
  priority = false,
}: {
  type: NightType;
  /** Portada de la habitación de esa noche; `null` = no tiene foto registrada. */
  src?: string | null;
  alt: string;
  priority?: boolean;
}) {
  /** Cadena de degradación: foto real → imagen de tipo → aviso accesible. */
  const [stage, setStage] = useState<"cover" | "type" | "failed">(src ? "cover" : "type");

  if (stage === "failed") {
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

  const isCover = stage === "cover" && src !== null;
  const source = isCover ? (src as string) : `/images/${type}.svg`;

  return (
    <Image
      key={source}
      src={source}
      alt={alt}
      fill
      sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
      priority={priority}
      // Los placeholders son SVG vectoriales y la foto se sirve por una ruta dinámica: en ambos
      // casos se entrega tal cual con `unoptimized` (mismo origen, CSP estricta) y se evita que el
      // optimizador devuelva 400 sobre el SVG (que provocaba un fallback espurio). Para el CDN real
      // (ADR-12) se quitará `unoptimized`.
      unoptimized
      className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
      onError={() => setStage(isCover ? "type" : "failed")}
    />
  );
}
