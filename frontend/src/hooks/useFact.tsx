// hooks/useFact.ts

import { useCallback } from "react";
import axios from "axios";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { QueryObserverResult } from "@tanstack/react-query";
import type { Fact } from "./useFactDatabase";

type FactInput = Omit<Fact, "id">;
interface UseFactResult {
  fact: Fact | null;
  loading: boolean;
  error: string | null;
  fetchFact: () => Promise<QueryObserverResult<Fact, Error>>;
  createFact: (input: FactInput) => Promise<Fact | null>;
  updateFact: (id: string, input: FactInput) => Promise<Fact | null>;
  deleteFact: (id: string) => Promise<boolean>;
  reset: () => void;
}


export function useFact(initialId?: string): UseFactResult {
  const queryClient = useQueryClient();

  // Query to fetch a fact by ID
  const isValidInitialId = initialId != null && initialId.trim() !== "";
  const {
    data: fact,
    isLoading,
    error,
    refetch: fetchFact,
  } = useQuery<Fact, Error>({
    queryKey: ["fact", initialId],
    queryFn: async () => {
      if (!isValidInitialId) {
        throw new Error("No ID provided");
      }
      const res = await axios.get<Fact>(`/api/facts/facts/${initialId}`);
      return res.data;
    },
    enabled: isValidInitialId,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // Mutation to create a new fact
  const createMutation = useMutation<Fact, Error, FactInput>({
    mutationFn: async (input: FactInput) => {
      const res = await axios.post<Fact>("/api/facts/facts", input);
      return res.data;
    },
    onSuccess: (data) => {
      // Update fact query cache for this fact
      queryClient.setQueryData(["fact", data.id], data);
      // Invalidate facts list to refresh if used elsewhere
      void queryClient.invalidateQueries({ queryKey: ["facts"] });
    },
  });

  // Mutation to update an existing fact
  const updateMutation = useMutation<Fact, Error, FactInput & { id: string }>({
    mutationFn: async (input: FactInput & { id: string }) => {
      const { id, ...rest } = input;
      const res = await axios.put<Fact>(`/api/facts/facts/${id}`, rest);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["fact", data.id], data);
      void queryClient.invalidateQueries({ queryKey: ["facts"] });
    },
  });

  // Mutation to delete a fact
  const deleteMutation = useMutation<boolean, Error, string>({
    mutationFn: async (id: string) => {
      await axios.delete(`/api/facts/facts/${id}`);
      return true;
    },
    onSuccess: async (_data, id) => {
      queryClient.removeQueries({ queryKey: ["fact", id] });
      await queryClient.invalidateQueries({ queryKey: ["facts"] });
    },
  });

  // Wrapper functions
  const createFact = useCallback(
    async (input: FactInput) => {
      try {
        const result = await createMutation.mutateAsync(input);
        return result;
      } catch (err) {
        console.error("Failed to create fact", err);
        return null;
      }
    },
    [createMutation]
  );
  const updateFact = useCallback(
    async (id: string, input: FactInput) => {
      try {
        const result = await updateMutation.mutateAsync({ id, ...input });
        return result;
      } catch (err) {
        console.error("Failed to update fact", err);
        return null;
      }
    },
    [updateMutation]
  );

  const deleteFact = useCallback(
    async (id: string) => {
      try {
        await deleteMutation.mutateAsync(id);
        return true;
      } catch {
        console.error("Failed to delete fact");
        return false;
      }
    },
    [deleteMutation]
  );

  const reset = useCallback(() => {
    queryClient.removeQueries({ queryKey: ["fact", initialId] });
  }, [initialId, queryClient]);

  // Extract error into a variable to avoid nested ternary
  let errorMessage: string | null = null;
  if (error != null) {
    if (error instanceof Error) {
      errorMessage = error.message;
    } else {
      errorMessage = String(error);
    }
  }
  const loading =
    isLoading
    || createMutation.status === "pending"
    || updateMutation.status === "pending"
    || deleteMutation.status === "pending";

  return {
    fact: fact ?? null,
    loading: loading,
    error: errorMessage,
    fetchFact,
    createFact,
    updateFact,
    deleteFact,
    reset,
  };
}

export default useFact;
