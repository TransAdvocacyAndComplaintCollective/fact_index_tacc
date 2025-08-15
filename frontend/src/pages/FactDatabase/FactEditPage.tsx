import useFact from "@/hooks/useFact";
import FactEditForm from "@/organisms/FactEditForm";
import { useCallback, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";

type FormValues = {
  fact_text: string;
  source: string;
  type: string;
  context: string;
  reason?: string;
};

export default function FactEditPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();

  const isEdit = id !== "new" && Boolean(id);

  // Only pass an ID to useFact if we're actually editing
  const {
    fact,
    loading,
    error,
    createFact,
    updateFact,
    fetchFact,
    reset,
  } = useFact(isEdit ? id : undefined);

  const initialValues: FormValues = useMemo(() => {
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

  useEffect(() => {
    if (isEdit && id?.trim() && typeof fetchFact === "function") {
      fetchFact().catch((err: any) => {
        console.error("Failed to fetch fact:", err);
        reset();
      });
    } else {
      reset();
    }
  }, [isEdit, id, fetchFact, reset]);

  const handleSubmit = useCallback(
    async (form: FormValues) => {
      const payload = {
        fact_text: form.fact_text,
        source: form.source,
        ...(form.type ? { type: form.type } : {}),
        ...(form.context ? { context: form.context } : {}),
        timestamp: "",
        subjects: [],
        audiences: [],
      };

      if (isEdit && id) {
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
    [isEdit, id, createFact, updateFact, navigate]
  );

  if (loading) return <div>Loading…</div>;
  if (error != null) return <div>{error}</div>;

  return (
    <FactEditForm
      initialValues={initialValues}
      mode={isEdit ? "edit" : "create"}
      saving={loading}
      error={error ?? ""}
      success={undefined}
      onSubmit={handleSubmit}
      onCancel={() => navigate(isEdit ? `/facts/${id}` : "/facts")}
    />
  );
}