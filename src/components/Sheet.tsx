import { useEffect, type ReactNode } from "react";
import { pushBack } from "../telegram";

interface SheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** Bottom sheet - the mobile-native way to ask for a couple of fields without
 *  leaving the list you are looking at. */
export function Sheet({ title, onClose, children }: SheetProps) {
  useEffect(() => {
    // Telegram's back arrow closes the sheet, not the screen underneath it.
    const pop = pushBack(onClose);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    // Stop the list behind the sheet scrolling under the finger.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      pop();
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      className="sheet-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        // Without this a click that started inside the sheet bubbles to the
        // backdrop and closes it.
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-grip" />
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}
