import { ImagePicker } from "./ImagePicker";

/** The editable half of a Task. Deadline is held as "" rather than null while
 *  it is in a form, because that is what an empty <input type="date"> gives
 *  back; it is narrowed to null on the way into the API. */
export interface TaskDraft {
  title: string;
  description: string;
  deadline: string;
  image: string | null;
}

export const emptyDraft: TaskDraft = {
  title: "",
  description: "",
  deadline: "",
  image: null,
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
  const set = <K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) =>
    onChange({ ...draft, [key]: value });

  return (
    <>
      <label className="field">
        <div className="label">
          <span>Title</span>
          <span className="limit">{draft.title.length}/30</span>
        </div>
        <input
          className="input"
          value={draft.title}
          onChange={(e) => set("title", e.target.value)}
          maxLength={30}
          placeholder="Write the release notes"
          autoFocus={autoFocus}
        />
      </label>

      <label className="field">
        <div className="label">
          <span>Description</span>
          <span className="limit">{draft.description.length}/100</span>
        </div>
        <textarea
          className="textarea"
          value={draft.description}
          onChange={(e) => set("description", e.target.value)}
          maxLength={100}
          placeholder="Optional detail"
        />
      </label>

      <label className="field">
        <div className="label">
          <span>Deadline</span>
        </div>
        <input
          className="input"
          type="date"
          value={draft.deadline}
          onChange={(e) => set("deadline", e.target.value)}
        />
      </label>

      <ImagePicker value={draft.image} onChange={(image) => set("image", image)} />
    </>
  );
}
