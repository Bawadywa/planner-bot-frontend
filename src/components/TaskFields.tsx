import { ImagePicker } from "./ImagePicker";
import { useT } from "../i18n";
import {
  DEFAULT_PRIORITY,
  PRIORITIES_BY_URGENCY,
  type PriorityCode,
} from "../lib/priority";

/** The editable half of a Task. Deadline is held as "" rather than null while
 *  it is in a form, because that is what an empty <input type="date"> gives
 *  back; it is narrowed to null on the way into the API. */
export interface TaskDraft {
  title: string;
  description: string;
  deadline: string;
  image: string | null;
  priority_code: PriorityCode;
}

export const emptyDraft: TaskDraft = {
  title: "",
  description: "",
  deadline: "",
  image: null,
  priority_code: DEFAULT_PRIORITY,
};

interface TaskFieldsProps {
  draft: TaskDraft;
  onChange: (draft: TaskDraft) => void;
  autoFocus?: boolean;
}

/** Shared by the create and the edit sheet, so the two can never drift apart on
 *  length caps or ordering. The caps mirror the String(n) columns on the Task
 *  model. */
export function TaskFields({ draft, onChange, autoFocus }: TaskFieldsProps) {
  const t = useT();
  const set = <K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) =>
    onChange({ ...draft, [key]: value });

  return (
    <>
      <label className="field">
        <div className="label">
          <span>{t("fields.title")}</span>
          <span className="limit">{draft.title.length}/30</span>
        </div>
        <input
          className="input"
          value={draft.title}
          onChange={(e) => set("title", e.target.value)}
          maxLength={30}
          placeholder={t("fields.titlePlaceholder")}
          autoFocus={autoFocus}
        />
      </label>

      <label className="field">
        <div className="label">
          <span>{t("fields.description")}</span>
          <span className="limit">{draft.description.length}/100</span>
        </div>
        <textarea
          className="textarea"
          value={draft.description}
          onChange={(e) => set("description", e.target.value)}
          maxLength={100}
          placeholder={t("fields.descriptionPlaceholder")}
        />
      </label>

      <label className="field">
        <div className="label">
          <span>{t("fields.deadline")}</span>
        </div>
        <input
          className="input"
          type="date"
          value={draft.deadline}
          onChange={(e) => set("deadline", e.target.value)}
        />
      </label>

      {/* Not a <select>: three options fit as chips, and Telegram's webview
          renders a native picker for a select that covers half the screen. The
          field is a plain div because a <label> would make every chip inside it
          toggle the first one. */}
      <div className="field">
        <div className="label">
          <span>{t("fields.priority")}</span>
        </div>
        <div className="chips" role="radiogroup" aria-label={t("fields.priority")}>
          {PRIORITIES_BY_URGENCY.map((priority) => (
            <button
              key={priority.code}
              type="button"
              role="radio"
              aria-checked={draft.priority_code === priority.code}
              className={`chip priority ${priority.tone}`}
              aria-pressed={draft.priority_code === priority.code}
              onClick={() => set("priority_code", priority.code)}
            >
              {priority.label}
            </button>
          ))}
        </div>
      </div>

      <ImagePicker value={draft.image} onChange={(image) => set("image", image)} />
    </>
  );
}
