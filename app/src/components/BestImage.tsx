// Shows the large version of a story's image, falling back to the original if the large one fails.
import { useEffect, useState } from "react";
import { Image, ImageProps } from "expo-image";

export function BestImage({ large, small, onFail, ...rest }: Omit<ImageProps, "source"> & { large?: string | null; small?: string | null; onFail?: () => void }) {
  const first = large || small || "";
  const [src, setSrc] = useState(first);
  useEffect(() => setSrc(first), [first]);
  return (
    <Image {...rest} source={{ uri: src }}
      onError={() => { if (small && src !== small) setSrc(small); else onFail?.(); }} />
  );
}
