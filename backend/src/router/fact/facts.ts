// router/fact/facts.ts
import { Router } from "express";
import type { SearchParams } from "../../db/fact/type.js";
import { createFact, deleteFact, getAudiences, getFactById, getSubjects, searchFacts, updateFact } from "../../db/fact/fact.js";
// Update the import path if the file is named 'queries' without the '.ts' extension or is located elsewhere
// import { createFact, deleteFact, getAudiences, getFactById, getSubjects, searchFacts, updateFact } from "../../db/queries.js";

export const factsRouter = Router();


// --- Subjects ---
factsRouter.get("/subjects", async (_req, res) => {
  try {
    const subjects = await getSubjects();
    res.json(subjects);
  } catch (err) {
    console.error("Error fetching subjects:", err);
    res.status(500).json([]);
  }
});

// --- Audiences ---
factsRouter.get("/audiences", async (_req, res) => {
  try {
    const audiences = await getAudiences();
    res.json(audiences);
  } catch (err) {
    console.error("Error fetching audiences:", err);
    res.status(500).json([]);
  }
});

// --- Search facts ---
factsRouter.post("/search", async (req, res) => {
  try {
    const params: SearchParams = req.body;
    const results = await searchFacts(params);
    res.json(results);
  } catch (err) {
    console.error("Error searching facts:", err);
    res.status(500).json([]);
  }
});

// --- Get fact by ID ---
factsRouter.get("/facts/:id", async (req, res) => {
  try {
    const fact = await getFactById(req.params.id);
    if (!fact) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json(fact);
  } catch (err) {
    console.error("Error fetching fact:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// --- Create fact ---
factsRouter.post("/facts", async (req, res) => {
  try {
    const fact = await createFact(req.body);
    res.status(201).json(fact);
  } catch (err) {
    console.error("Error creating fact:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// --- Update fact ---
factsRouter.put("/facts/:id", async (req, res) => {
  try {
    const updated = await updateFact(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json(updated);
  } catch (err) {
    console.error("Error updating fact:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// --- Delete fact ---
factsRouter.delete("/facts/:id", async (req, res) => {
  try {
    const ok = await deleteFact(req.params.id);
    if (!ok) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json(true);
  } catch (err) {
    console.error("Error deleting fact:", err);
    res.status(500).json(false);
  }
});
export default factsRouter; 