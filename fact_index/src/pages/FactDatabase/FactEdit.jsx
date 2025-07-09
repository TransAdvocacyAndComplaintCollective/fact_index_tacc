import React, { useState, useRef, useEffect } from "react";
import PropTypes from "prop-types";
import axios from "axios";
import { useParams, useNavigate } from "react-router-dom";
import * as styles from  "./FactEdit.module.scss"; 

export function FactEdit({ fact, mode, onSave, onCancel }) {
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
  const textareaRef = useRef(null);

  useEffect(() => { textareaRef.current?.focus(); }, []);

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

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
    setError("");
    setSuccess("");
  }

  async function handleSubmit(e) {
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
    } catch (e) {
      setError(e.response?.data?.error || "Failed to save.");
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
          <button
            type="submit"
            className={styles.factEditSaveBtn}
            disabled={
              saving ||
              !form.fact_text.trim() ||
              (isEdit && (!dirty || !form.reason.trim()))
            }
          >
            {saving ? (isEdit ? "Saving..." : "Creating...") : isEdit ? "Save" : "Create"}
          </button>
          <button
            type="button"
            className={styles.factEditCancelBtn}
            onClick={handleCancel}
            disabled={saving}
          >
            Cancel
          </button>
        </div>
        {error && <div role="alert" className={styles.factEditError}>{error}</div>}
        {success && <div role="status" className={styles.factEditSuccess}>{success}</div>}
      </fieldset>
    </form>
  );
}

FactEdit.propTypes = {
  fact: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    fact_text: PropTypes.string,
    source: PropTypes.string,
    type: PropTypes.string,
    context: PropTypes.string,
  }),
  mode: PropTypes.oneOf(["edit", "create"]).isRequired,
  onSave: PropTypes.func,
  onCancel: PropTypes.func,
};

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
      fact={fact}
      mode={id ? "edit" : "create"}
      onSave={() => id ? navigate(`/facts/${id}`) : navigate(`/facts`)}
      onCancel={() => id ? navigate(`/facts/${id}`) : navigate(`/facts`)}
    />
  );
}
