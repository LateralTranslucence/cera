/**
 * Whether dark text reads better than light text on a background color:
 * the WCAG contrast of black against it beats that of white. Takes hex
 * colors (#rgb or #rrggbb); returns undefined for anything else, such as a
 * named color, so callers can keep their default.
 */
export function isLightColor(color: string | undefined): boolean | undefined {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color?.trim() ?? '')?.[1];
  if (!hex) return undefined;
  const full = hex.length === 3 ? [...hex].map((digit) => digit + digit).join('') : hex;
  const [red, green, blue] = [0, 2, 4].map((offset) => {
    const channel = parseInt(full.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
  const againstBlack = (luminance + 0.05) / 0.05;
  const againstWhite = 1.05 / (luminance + 0.05);
  return againstBlack > againstWhite;
}
