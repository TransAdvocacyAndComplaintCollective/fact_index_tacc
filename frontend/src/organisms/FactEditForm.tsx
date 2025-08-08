// organisms/FactEditForm.tsx

import React, { useState, useRef, useEffect } from "react";
import styles from "./style/FactEditPage.module.scss";
import ButtonNative from "@/atoms/Button/ButtonNative";
// style/FactEditForm.module.scss
// The shape of a fact (should import Fact type from your types/hooks if available)
type FactEditFormValues = {
  fact_text: string;
  source: string;
  type: string;
  context: string;
  reason?: string;
};

interface FactEditFormProps {
  initialValues: FactEditFormValues;
  mode: "edit" | "create";
  saving?: boolean;
  error?: string;
  success?: string;
  onChange?: (values: FactEditFormValues) => void;
  onSubmit: (values: FactEditFormValues) => Promise<void> | void;
  onCancel?: () => void;
}

/**
 * A controlled, accessible form for creating or editing a fact.
 */
const FactEditForm: React.FC<FactEditFormProps> = ({
  initialValues,
  mode,
  saving = false,
  error,
  success,
  onChange,
  onSubmit,
  onCancel,
}) => {
  const isEdit = mode === "edit";
  const [form, setForm] = useState<FactEditFormValues>({ ...initialValues });
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setForm({ ...initialValues });
  }, [initialValues]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Only mark as dirty if form differs from initial
  const dirty =
    form.fact_text !== (initialValues.fact_text || "") ||
    form.source !== (initialValues.source || "") ||
    form.type !== (initialValues.type || "") ||
    form.context !== (initialValues.context || "");

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) {
    const { name, value } = e.target;
    setForm(f => {
      const updated = { ...f, [name]: value };
      onChange?.(updated);
      return updated;
    });
  }

  function handleCancel() {
    setForm({ ...initialValues });
    onCancel?.();
  }

  // Form submit handler (delegates to parent)
  function handleFormSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    Promise.resolve(onSubmit(form)).catch((err) => {
      console.error("Failed to submit form:", err);
    });
  }

  // Compute submit label
  let submitLabel = "Create";
  if (saving && isEdit) submitLabel = "Saving...";
  else if (saving) submitLabel = "Creating...";
  else if (isEdit) submitLabel = "Save";

  return (
    <form
      className={styles.factEditForm}
      onSubmit={handleFormSubmit}
      aria-labelledby="edit-fact-form-title"
      autoComplete="off"
    >
      <fieldset disabled={saving}>
        <legend id="edit-fact-form-title">
          {isEdit ? "Edit Fact" : "Add New Fact"}
        </legend>

        <label>
          Fact Text
          <span aria-hidden="true" className={styles.factEditRequired}>*</span>
          <textarea
            className={styles.factEditInput}
            name="fact_text"
            value={form.fact_text}
            onChange={handleChange}
            rows={3}
            ref={textareaRef}
            required
            minLength={5}
          />
        </label>
        <label>
          Source
          <input
            className={styles.factEditInput}
            name="source"
            type="url"
            value={form.source}
            onChange={handleChange}
            placeholder="https://"
          />
        </label>
        <label>
          Type
          <input
            className={styles.factEditInput}
            name="type"
            value={form.type}
            onChange={handleChange}
            placeholder="eg: statistics, quote, etc."
          />
        </label>
        <label>
          Context
          <textarea
            className={styles.factEditInput}
            name="context"
            value={form.context}
            onChange={handleChange}
            rows={2}
          />
        </label>
        {isEdit && (
          <label>
            Edit Reason
            <span aria-hidden="true" className={styles.factEditRequired}>*</span>
            <input
              className={styles.factEditInput}
              name="reason"
              value={form.reason ?? ""}
              onChange={handleChange}
              placeholder="Why are you editing this fact?"
              required={isEdit}
            />
          </label>
        )}

        <div className={styles.factEditActions}>
          <ButtonNative
            type="submit"
            variant="primary"
            disabled={
              saving ||
              !form.fact_text.trim() ||
              (isEdit && (!dirty || !(form.reason ?? "").trim()))
            }
          >
            {submitLabel}
          </ButtonNative>
          <ButtonNative
            type="button"
            variant="secondary"
            onClick={handleCancel}
            disabled={saving}
          >
            Cancel
          </ButtonNative>
        </div>
        {(error != null) && <div role="alert" className={styles.factEditError}>{error}</div>}
        {(success != null) && <div role="status" className={styles.factEditSuccess}>{success}</div>}
      </fieldset>
    </form>
  );
};

export default FactEditForm;
