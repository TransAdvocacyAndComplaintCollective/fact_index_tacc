// pages/FactDatabase/FactEditPage.tsx
import React, { useEffect, useMemo, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import FactEditForm from "../../organisms/FactEditForm";
import useFact from "../../hooks/useFact";
// import type { Fact } from "./../hooks/useFactDatabase";

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

  const {
    fact,
    loading,
    error,
    createFact,
    updateFact,
    fetchFact,
    setFact,
    reset,
  } = useFact(id);

  // Map between API fact and form values
  const initialValues: FormValues = useMemo(() => {
    // also guard against Error values
    if (!fact || fact instanceof Error) {
      return {
        fact_text: "",
        source: "",
        type: "",
        context: "",
        reason: "",
      };
    }
    return {
      fact_text: fact.fact_text ?? "",
      source: fact.source ?? "",
      type: fact.type ?? "",
      context: fact.context ?? "",
      reason: "",
    };
  }, [fact]);

  // On id change, fetch or clear fact as needed
  useEffect(() => {
    if ((id != null) && id !== "") {
      fetchFact(id).catch((err) => {
        console.error("Failed to fetch fact:", err);
        setFact(null);
        reset();
      });;
    } else {
      // If no id, clear state for new fact creation
      setFact(null);
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Submission handler
  const handleSubmit = useCallback(
    async (form: FormValues) => {
      const payload = {
        fact_text: form.fact_text,
        source: form.source,
        ...(form.type ? { type: form.type } : {}),
        ...(form.context ? { context: form.context } : {}),
        timestamp: "",      // Adjust if you need to set a timestamp
        subjects: [],       // Add subjects/audiences if required
        audiences: [],
      };

      if ((id != null) && id !== "") {
        const res = await updateFact(id, payload);
        if (res != null) {
          navigate(`/facts/${id}`);
        }
      } else {
        const res = await createFact(payload);
        if (res?.id != null) {
          navigate(`/facts/${res.id}`);
        } else {
          navigate(`/facts`);
        }
      }
    },
    [id, createFact, updateFact, navigate]
  );

  if (loading) return <div>Loading…</div>;
  if (error != null) return <div>{error}</div>;

  return (
    <FactEditForm
      initialValues={initialValues}
      mode={(id != null) && id !== "" ? "edit" : "create"}
      saving={loading}
      error={error ?? ""}
      success={undefined}
      onSubmit={handleSubmit}
      onCancel={() => navigate((id != null) && id !== "" ? `/facts/${id}` : "/facts")}
    />
  );
}
