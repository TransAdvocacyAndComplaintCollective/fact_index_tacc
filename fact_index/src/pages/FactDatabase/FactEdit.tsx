import React, { useState, useRef, useEffect } from "react";

// define the shape of a fact
type FactType = {
  id?: string | number;
  fact_text: string;
  source: string;
  type: string;
  context: string;
};

// props interface for FactEdit
interface FactEditProps {
  fact: FactType;
  mode: "edit" | "create";
  onSave?: () => void;
  onCancel?: () => void;
}
import axios from "axios";
import { useParams, useNavigate } from "react-router-dom";
import * as styles from  "./FactEdit.module.scss"; 
import Button from "../../atoms/Button";

export function FactEdit({ fact, mode, onSave, onCancel }: FactEditProps) {
  const isEdit = mode === "edit";
  const [form, setForm] = useState({
    fact_text: fact.fact_text || "",
    source: fact.source || "",
    type: fact.type || "",
    context: fact.context || "",
    reason: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => { textareaRef.current?.focus(); }, []);

  // compute submit button label to avoid nested ternary
  let submitLabel: string;
  if (saving && isEdit) {
    submitLabel = "Saving...";
  } else if (saving) {
    submitLabel = "Creating...";
  } else if (isEdit) {
    submitLabel = "Save";
  } else {
    submitLabel = "Create";
  }

  function handleCancel() {
    setForm({
      fact_text: fact.fact_text || "",
      source: fact.source || "",
      type: fact.type || "",
      context: fact.context || "",
      reason: "",
    });
    setError("");
    setSuccess("");
    if (onCancel) onCancel();
  }

  const dirty =
    form.fact_text !== (fact.fact_text || "") ||
    form.source !== (fact.source || "") ||
    form.type !== (fact.type || "") ||
    form.context !== (fact.context || "");

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
    setError("");
    setSuccess("");
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!dirty && isEdit) {
      setError("No changes made.");
      return;
    }
    if (!form.fact_text.trim()) {
      setError("Fact text is required.");
      return;
    }
    if (isEdit && !form.reason.trim()) {
      setError("Edit reason is required.");
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        await axios.put(`/api/facts/facts/${fact.id}`, {
          changes: {
            fact_text: form.fact_text,
            source: form.source,
            type: form.type,
            context: form.context,
          },
          reason: form.reason,
        });
      } else {
        await axios.post(`/api/facts/facts/`, {
          fact_text: form.fact_text,
          source: form.source,
          type: form.type,
          context: form.context,
        });
      }
      setSuccess(isEdit ? "Fact updated successfully." : "Fact created successfully.");
      if (onSave) onSave();
      } catch (error: unknown) {
      let errMsg = "Failed to save.";
      if (axios.isAxiosError(error) && error.response?.data?.error) {
        errMsg = error.response.data.error;
      }
      setError(errMsg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className={styles.factEditForm}
      onSubmit={handleSubmit}
      aria-labelledby="edit-fact-form-title"
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
              value={form.reason}
              onChange={handleChange}
              placeholder="Why are you editing this fact?"
              required={isEdit}
            />
          </label>
        )}
        <div className={styles.factEditActions}>
          <Button
            type="submit"
            variant="primary"
            disabled={
              saving ||
              !form.fact_text.trim() ||
              (isEdit && (!dirty || !form.reason.trim()))
            }
          >
            {submitLabel}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={handleCancel}
            disabled={saving}
          >
            Cancel
          </Button>
        </div>
        {error && <div role="alert" className={styles.factEditError}>{error}</div>}
        {success && <div role="status" className={styles.factEditSuccess}>{success}</div>}
      </fieldset>
    </form>
  );
}


export default function FactEditRoute() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [fact, setFact] = useState(id ? null : { fact_text: "", source: "", type: "", context: "" });
  const [loading, setLoading] = useState(Boolean(id));

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/facts/${id}`)
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(setFact)
      .catch(() => setFact(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <main className={styles.factEditForm}>
      <p role="status" aria-live="polite">Loading…</p>
    </main>
  );
  if (id && !fact) return (
    <main className={styles.factEditForm}>
      <p role="status" aria-live="polite">Not found.</p>
    </main>
  );

  return (
    <FactEdit
      fact={fact!}
      mode={id ? "edit" : "create"}
      onSave={() => id ? navigate(`/facts/${id}`) : navigate(`/facts`)}
      onCancel={() => id ? navigate(`/facts/${id}`) : navigate(`/facts`)}
    />
  );
}
