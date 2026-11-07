import React, { useEffect, useRef } from 'react';
import { Loader2, Pencil, TriangleAlert } from 'lucide-react';

interface SectionCardProps {
  id: string;
  title: string;
  isEditing: boolean;
  /** True while the edit form differs from the saved values. */
  dirty: boolean;
  saving: boolean;
  error?: string | null;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  view: React.ReactNode;
  edit: React.ReactNode;
  /** Single-field cards put the save button next to the input instead of below it. */
  inlineSave?: boolean;
}

/**
 * Profile section with two modes: View and Edit (inline edit, design spec §4.2).
 * The parent decides which card is editing, so only one card is open at a time.
 */
export const SectionCard: React.FC<SectionCardProps> = ({
  id, title, isEditing, dirty, saving, error, onEdit, onCancel, onSave, view, edit, inlineSave = false,
}) => {
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const editAreaRef = useRef<HTMLDivElement>(null);
  const wasEditing = useRef(isEditing);

  // Focus the first field when the card opens, and return focus to Edit when it closes.
  useEffect(() => {
    if (isEditing && !wasEditing.current) {
      editAreaRef.current?.querySelector<HTMLElement>('input:not([disabled]), select, textarea')?.focus();
    } else if (!isEditing && wasEditing.current) {
      editButtonRef.current?.focus();
    }
    wasEditing.current = isEditing;
  }, [isEditing]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      if (dirty && !saving) onSave();
    }
  };

  const saveButton = (
    <button
      type="submit"
      disabled={!dirty || saving}
      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-ink transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40 max-md:w-full"
    >
      {saving && <Loader2 className="h-4 w-4 animate-spin" />}
      {saving ? 'Menyimpan…' : 'Simpan perubahan'}
    </button>
  );

  return (
    <section
      id={`profile-card-${id}`}
      aria-labelledby={`profile-card-${id}-title`}
      className={`scroll-mt-24 rounded-2xl border p-6 shadow-[0_1px_2px_rgb(15_23_42/0.04)] transition-colors duration-150 max-md:p-5 ${
        isEditing ? 'border-primary-border bg-surface-muted' : 'border-line bg-surface'
      }`}
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <h3 id={`profile-card-${id}-title`} className="text-lg font-bold leading-[26px] text-ink">{title}</h3>
        {isEditing ? (
          <button
            type="button"
            onClick={onCancel}
            className="h-9 rounded-xl px-3 text-sm font-medium text-muted transition-colors hover:text-ink"
          >
            Batal
          </button>
        ) : (
          <button
            ref={editButtonRef}
            type="button"
            onClick={onEdit}
            aria-expanded={false}
            aria-label={`Edit ${title}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 text-sm font-semibold text-ink transition-colors hover:bg-surface-muted"
          >
            <Pencil className="h-4 w-4" />
            Edit
          </button>
        )}
      </div>

      {isEditing ? (
        <form
          onSubmit={(event) => { event.preventDefault(); if (dirty && !saving) onSave(); }}
          onKeyDown={handleKeyDown}
          aria-label={`Edit ${title}`}
        >
          {error && (
            <div role="alert" className="mb-4 flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-[13px] text-red-600">
              <TriangleAlert className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          {inlineSave ? (
            <div className="flex items-start gap-3 max-md:flex-col">
              <div ref={editAreaRef} className="min-w-0 flex-1">{edit}</div>
              <div className="max-md:sticky max-md:bottom-3 max-md:w-full">{saveButton}</div>
            </div>
          ) : (
            <>
              <div ref={editAreaRef}>{edit}</div>
              <div className="mt-6 flex justify-end max-md:sticky max-md:bottom-3">{saveButton}</div>
            </>
          )}
        </form>
      ) : (
        view
      )}
    </section>
  );
};

/** Label-above-value pair used in every card's View mode. */
export const ViewField: React.FC<{ label: string; highlight?: boolean; children?: React.ReactNode; className?: string }> = ({
  label, highlight = false, children, className = '',
}) => {
  const empty = children === null || children === undefined || children === '' || (Array.isArray(children) && children.length === 0);
  return (
    // Turns yellow instantly, then fades out over 1.2s once `highlight` goes false.
    <div className={`-mx-2 rounded-lg px-2 py-1 transition-colors ${highlight ? 'bg-primary-soft' : 'bg-transparent duration-[1200ms]'} ${className}`}>
      <dt className="text-[13px] font-medium leading-[18px] text-muted">{label}</dt>
      <dd className="mt-1 text-[15px] font-semibold leading-[22px] text-ink">
        {empty ? <span className="font-normal text-subtle">—</span> : children}
      </dd>
    </div>
  );
};

/** Shared input styling (design spec §4.4). */
export const inputClass =
  'h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] font-medium text-ink placeholder:text-subtle outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-chip disabled:text-muted aria-[invalid=true]:border-red-600';

export const FieldLabel: React.FC<{ htmlFor: string; children: React.ReactNode }> = ({ htmlFor, children }) => (
  <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium leading-[18px] text-muted">{children}</label>
);

export const FieldError: React.FC<{ message?: string }> = ({ message }) =>
  message ? <p className="mt-1.5 text-[13px] text-red-600">{message}</p> : null;
