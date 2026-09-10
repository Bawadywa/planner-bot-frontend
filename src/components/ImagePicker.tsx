import { useId, useRef, useState } from "react";
import { fileToDataUrl } from "../lib/image";
import { ImageIcon, TrashIcon } from "./Icons";
import { useT } from "../i18n";

interface ImagePickerProps {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  /** Overrides the default "Image" heading. A caller that passes one owns its
   *  translation. */
  label?: string;
}

/** Wraps a hidden <input type="file"> so the control can be styled, and runs
 *  every pick through the downscaler before handing back a data: URL. */
export function ImagePicker({ value, onChange, label }: ImagePickerProps) {
  const t = useT();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handlePick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      onChange(await fileToDataUrl(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("image.readFailed"));
    } finally {
      setBusy(false);
      // Reset the input, or picking the same file twice fires no change event.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="field">
      <div className="label">
        <span>{label ?? t("image.label")}</span>
      </div>

      <div className="picker">
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={(e) => void handlePick(e.target.files?.[0])}
        />

        {value && <img className="picker-preview" src={value} alt="" />}

        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          <ImageIcon />
          {busy ? t("image.processing") : value ? t("image.replace") : t("image.attach")}
        </button>

        {value && (
          <button
            type="button"
            className="icon-btn"
            aria-label={t("image.remove")}
            onClick={() => onChange(null)}
          >
            <TrashIcon />
          </button>
        )}
      </div>

      {error && (
        <div className="hint" style={{ color: "var(--danger)", marginTop: 8 }}>
          {error}
        </div>
      )}
    </div>
  );
}
