import type { CSSProperties } from "react";
import { joinClassNames } from "../classNames";

type MaterialSymbolProps = {
  name: string;
  className?: string;
  size?: number;
  fill?: 0 | 1;
  weight?: number;
  grade?: number;
  opticalSize?: number;
  title?: string;
  ariaLabel?: string;
  ariaHidden?: boolean;
};

// Renders a Material Symbols ligature (e.g. "play_arrow") using the font.
// Color is controlled via CSS `color`.
export function MaterialSymbol({
  name,
  className,
  size,
  fill,
  weight,
  grade,
  opticalSize,
  title,
  ariaLabel,
  ariaHidden,
}: MaterialSymbolProps) {
  const style: CSSProperties = {};
  if (typeof size === "number") {
    style.fontSize = `${size}px`;
  }
  if (
    typeof fill === "number" ||
    typeof weight === "number" ||
    typeof grade === "number" ||
    typeof opticalSize === "number"
  ) {
    style.fontVariationSettings = [
      typeof fill === "number" ? `'FILL' ${fill}` : null,
      typeof weight === "number" ? `'wght' ${weight}` : null,
      typeof grade === "number" ? `'GRAD' ${grade}` : null,
      typeof opticalSize === "number" ? `'opsz' ${opticalSize}` : null,
    ]
      .filter((entry): entry is string => Boolean(entry))
      .join(", ");
  }

  const computedAriaHidden =
    typeof ariaHidden === "boolean" ? ariaHidden : !ariaLabel;

  return (
    <span
      className={joinClassNames("material-symbols-outlined", className)}
      style={style}
      aria-label={ariaLabel}
      aria-hidden={computedAriaHidden}
      title={title}
    >
      {name}
    </span>
  );
}

