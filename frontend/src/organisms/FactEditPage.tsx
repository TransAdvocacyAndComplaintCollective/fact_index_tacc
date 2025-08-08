// pages/FactDatabase/FactEditPage.tsx
import React, { useState, useEffect } from "react";
import FactEditForm from "./FactEditForm";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";

interface FormValues {
  fact_text: string;
  source: string;
  type: string;
  context: string;
  reason?: string;
}

export default function FactEditPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [initialValues, setInitialValues] = useState<FormValues>({
    fact_text: "",
    source: "",
    type: "",
    context: "",
    reason: "",
  });
  const [loading, setLoading] = useState<boolean>((id != null) && (id != ""));
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);

  // Load existing fact if editing
  useEffect(() => {
    if (!(id ?? "")) {
      setLoading(false);
      setInitialValues({
        fact_text: "",
        source: "",
        type: "",
        context: "",
        reason: "",
      });
      return;
    }
    setLoading(true);
    axios.get<Omit<FormValues, "reason">>(`/api/facts/${id}`)
      .then(res => {
        setInitialValues({ ...res.data, reason: "" });
        setError("");
      })
      .catch(() => {
        setError("Not found.");
        setInitialValues({
          fact_text: "",
          source: "",
          type: "",
          context: "",
          reason: "",
        });
      })
      .finally(() => setLoading(false));
  }, [id]);

  // Handle form submission
  async function handleSubmit(form: FormValues) {
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      if (id != null) {
        await axios.put(`/api/facts/facts/${id}`, {
          changes: {
            fact_text: form.fact_text,
            source: form.source,
            type: form.type,
            context: form.context,
          },
          reason: form.reason,
        });
        setSuccess("Fact updated successfully.");
        navigate(`/facts/${id}`);
      } else {
        await axios.post(`/api/facts/facts/`, {
          fact_text: form.fact_text,
          source: form.source,
          type: form.type,
          context: form.context,
        });
        setSuccess("Fact created successfully.");
        navigate(`/facts`);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div>Loading…</div>;
  if (error && !success) return <div>{error}</div>;

  return (
    <FactEditForm
      initialValues={initialValues}
      mode={id != null ? "edit" : "create"}
      saving={saving}
      error={error}
      success={success}
      onSubmit={handleSubmit}
      onCancel={() => navigate(id != null ? `/facts/${id}` : `/facts`)}
    />
  );
}
