import { useEffect, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Portaled so tooltips stay visible outside clipped inventory cards. */
export function Tooltip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const id = useId();
  const [anchor, setAnchor] = useState<DOMRect>();
  useEffect(() => {
    if (!anchor) return;
    const close = () => setAnchor(undefined);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", escape, true);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", escape, true);
    };
  }, [anchor]);
  return (
    <span
      className="tooltip-anchor"
      aria-describedby={anchor ? id : undefined}
      onMouseEnter={(event) =>
        setAnchor(event.currentTarget.getBoundingClientRect())
      }
      onMouseLeave={() => setAnchor(undefined)}
      onFocus={(event) =>
        setAnchor(event.currentTarget.getBoundingClientRect())
      }
      onBlur={() => setAnchor(undefined)}
    >
      {children}
      {anchor &&
        createPortal(
          <span
            id={id}
            role="tooltip"
            className="ui-tooltip"
            style={{
              left: Math.max(
                132,
                Math.min(window.innerWidth - 132, anchor.x + anchor.width / 2),
              ),
              top:
                anchor.bottom + 48 > window.innerHeight
                  ? anchor.top - 8
                  : anchor.bottom + 8,
              transform:
                anchor.bottom + 48 > window.innerHeight
                  ? "translate(-50%, -100%)"
                  : "translateX(-50%)",
            }}
          >
            {label}
          </span>,
          document.body,
        )}
    </span>
  );
}
