import { useMemo } from "react";
import { encode } from "uqr";

/**
 * A QR code for `value`, drawn as one SVG path (dark modules on a light
 * quiet zone, so phones read it in dark mode too).
 */
export const QrCode = ({
  label,
  size = 168,
  value,
}: {
  label: string;
  size?: number;
  value: string;
}) => {
  const { modules, path } = useMemo(() => {
    const qr = encode(value, { border: 2 });
    let d = "";
    for (const [y, row] of qr.data.entries()) {
      for (const [x, dark] of row.entries()) {
        if (dark) {
          d += `M${x} ${y}h1v1h-1z`;
        }
      }
    }
    return { modules: qr.size, path: d };
  }, [value]);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${modules} ${modules}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#0b0b10"/></svg>`;
  return (
    <img
      alt={label}
      className="rounded-xl bg-white"
      height={size}
      src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
      width={size}
    />
  );
};
