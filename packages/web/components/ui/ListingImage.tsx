"use client";

import { useState } from "react";

const GRADIENTS = [
  "from-brand-400 to-brand-600",
  "from-ai-400 to-ai-600",
  "from-warning-300 to-warning-500",
  "from-info-400 to-info-600",
];
function grad(seed: string) {
  return GRADIENTS[seed.charCodeAt(0) % GRADIENTS.length];
}

/**
 * Listing photo with a deterministic gradient fallback — used if there's no
 * image or the remote photo fails to load, so a card is never broken/empty.
 */
export function ListingImage({
  src,
  alt,
  seed,
  className = "",
}: {
  src?: string | null;
  alt: string;
  seed: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      <img
        src={src}
        alt={alt}
        onError={() => setFailed(true)}
        className={`h-full w-full object-cover ${className}`}
      />
    );
  }
  return <div className={`h-full w-full bg-gradient-to-br ${grad(seed)} ${className}`} />;
}
