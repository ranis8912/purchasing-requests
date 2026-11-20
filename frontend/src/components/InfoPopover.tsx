import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Info } from "lucide-react";

/** "i" button: hover or keyboard focus previews the panel, a click pins it open. Esc or a click outside closes it. */
export default function InfoPopover({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const wrap = useRef<HTMLSpanElement>(null);
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hover || pinned;

  useEffect(() => {
    if (!pinned) return;
    const outside = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setPinned(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setPinned(false); setHover(false); } };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", outside); document.removeEventListener("keydown", esc); };
  }, [pinned]);

  return (
    <span ref={wrap} className="info-pop" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button type="button" className="info-pop__btn" aria-label={label} aria-expanded={open} aria-controls={id}
        onClick={() => setPinned((p) => !p)} onFocus={() => setHover(true)} onBlur={() => setHover(false)}>
        <Info size={18} aria-hidden />
      </button>
      {open && <span id={id} role="dialog" aria-label={label} className="info-pop__panel">{children}</span>}
    </span>
  );
}
