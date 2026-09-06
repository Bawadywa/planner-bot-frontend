import { useId, useRef, useState } from "react";
import { fileToDataUrl } from "../lib/image";
import { ImageIcon, TrashIcon } from "./Icons";

interface ImagePickerProps {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  label?: string;
}

/** Wraps a hidden <input type="file"> so the control can be styled, and runs
 *  every pick through the downscaler before handing back a data: URL. */
export function ImagePicker({ value, onChange, label = "Image" }: ImagePickerProps) {
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
      setError(err instanceof Error ? err.message : "Could not read that image.");
    } finally {
      setBusy(false);
      // Reset the input, or picking the same file twice fires no change event.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="field">
      <div className="label">
        <span>{label}</span>
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
          {busy ? "Processing…" : value ? "Replace" : "Attach"}
        </button>

        {value && (
          <button
            type="button"
            className="icon-btn"
            aria-label="Remove image"
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
