
import express from "express";
import type { Request, Response, Router, NextFunction } from "express";
import logger from "../../logger.ts";
import { casbinMiddleware } from "../../auth/casbin.ts";
import { derivePermissionsFromDb } from "../../auth/permissions.ts";
import {
  createFact,
  findFacts,
  getFactById,
  getPublicFactById,
  listAudiences,
  listAllAudiences,
  listSubjects,
  listAllSubjects,
  upsertAudience,
  upsertSubject,
  updateFact,
  deleteFact,
} from "../../../../../libs/db-core/src/factRepository.ts";
import type { NewFactInput } from "@factdb/types";
import {
  factValidation,
  idParamValidation,
  handleValidationErrors,
  validateSearchQuery,
} from "../../utils/validation.ts";
import {
  isAppError,
  NotFoundError,
  ValidationError,
} from "../../utils/errors.ts";
import { asyncHandler } from "../../utils/asyncHandler.ts";
import { extractNumericId } from "../../utils/parsing.ts";

const router: Router = express.Router();

function stripFactUserId<T extends { user_id?: unknown }>(fact: T): Omit<T, "user_id"> {
  const clone: any = { ...fact };
  delete clone.user_id;
  return clone;
}

function handleError(res: Response, route: string, err: unknown): void {
  logger.error(`[api] ${route} error`, {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });

  if (isAppError(err)) {
    res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
      ...(err.details && { details: err.details }),
    });
    return;
  }

  res.status(500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
  });
}

function parseFactId(rawId: string | string[] | undefined): number | null {
  const idValue = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!idValue || typeof idValue !== 'string') {
    return null;
  }
  // Check format: only digits allowed, no scientific notation or hex
  if (!/^\d+$/.test(idValue)) {
    return null;
  }
  const id = Number(idValue);
  return Number.isInteger(id) && id > 0 ? id : null;
}

router.get(
  "/facts",
  validateSearchQuery,
  async (req: Request, res: Response) => {
    try {
      const q = req.query.q as string | undefined;
      const authStatus = (req as any).authStatus;
      const permissions = authStatus?.authenticated ? await derivePermissionsFromDb(authStatus) : [];
      const includeNonPublic = permissions.includes("superuser") || permissions.includes("fact:read");
      const results = await findFacts({ keyword: q || undefined, includeNonPublic });
      res.json(authStatus?.authenticated ? results : results.map(stripFactUserId));
    } catch (err) {
      handleError(res, "GET /api/facts/facts", err);
    }
  }
);

// Return list of distinct audiences (from `context`)
router.get("/audiences", async (req: Request, res: Response) => {
  try {
    const audiences = await listAudiences();
    res.json({ audiences });
  } catch (err) {
    handleError(res, "GET /api/facts/audiences", err);
  }
});

// Return list of all audiences (including unused)
router.get("/audiences/all", async (_req: Request, res: Response) => {
  try {
    const audiences = await listAllAudiences();
    res.json({ audiences });
  } catch (err) {
    handleError(res, "GET /api/facts/audiences/all", err);
  }
});

// Return list of distinct subjects (from `type`)
router.get("/subjects", async (req: Request, res: Response) => {
  try {
    const subjects = await listSubjects();
    res.json({ subjects });
  } catch (err) {
    handleError(res, "GET /api/facts/subjects", err);
  }
});

// Return list of all subjects (including unused)
router.get("/subjects/all", async (_req: Request, res: Response) => {
  try {
    const subjects = await listAllSubjects();
    res.json({ subjects });
  } catch (err) {
    handleError(res, "GET /api/facts/subjects/all", err);
  }
});

function parseName(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

router.post(
  "/subjects",
  casbinMiddleware("taxonomy", "write"),
  async (req: Request, res: Response) => {
    try {
      const name = parseName((req.body as any)?.name);
      if (!name) throw new ValidationError("Subject name is required");
      if (name.length > 100) throw new ValidationError("Subject name is too long");
      const created = await upsertSubject(name);
      res.status(201).json({ name: created });
    } catch (err) {
      handleError(res, "POST /api/facts/subjects", err);
    }
  },
);

router.post(
  "/audiences",
  casbinMiddleware("taxonomy", "write"),
  async (req: Request, res: Response) => {
    try {
      const name = parseName((req.body as any)?.name);
      if (!name) throw new ValidationError("Audience name is required");
      if (name.length > 100) throw new ValidationError("Audience name is too long");
      const created = await upsertAudience(name);
      res.status(201).json({ name: created });
    } catch (err) {
      handleError(res, "POST /api/facts/audiences", err);
    }
  },
);

router.get(
  "/facts/:id",
  idParamValidation,
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const id = extractNumericId(req.params.id);
      const authStatus = (req as any).authStatus;
      const permissions = authStatus?.authenticated ? await derivePermissionsFromDb(authStatus) : [];
      const includeNonPublic = permissions.includes("superuser") || permissions.includes("fact:read");
      const fact = includeNonPublic ? await getFactById(id) : await getPublicFactById(id);
      if (!fact) throw new NotFoundError(`Fact with id ${id} not found`);
      res.json(authStatus?.authenticated ? fact : stripFactUserId(fact));
    } catch (err) {
      handleError(res, "GET /api/facts/facts/:id", err);
    }
  }
);

router.post(
  "/facts",
  async (req: Request, res: Response, next: NextFunction) => {
    const wantsPublic = Boolean((req.body as any)?.is_public);
    const mw = casbinMiddleware("fact", wantsPublic ? "pubwrite" : "write");
    return mw(req, res, next);
  },
  factValidation,
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      // Require fact_text for creation
      if (!req.body.fact_text) {
        throw new ValidationError('fact_text is required for fact creation');
      }
      const created = await createFact(req.body as NewFactInput);
      res.status(201).json(created);
    } catch (err) {
      handleError(res, "POST /api/facts/facts", err);
    }
  }
);

router.put(
  "/facts/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    const changes =
      req.body && typeof (req.body as any).changes === "object" && (req.body as any).changes !== null
        ? (req.body as any).changes
        : req.body;

    (req as any).factChanges = changes;
    // Run express-validator against the actual change payload.
    req.body = changes;

    const isModerationChange = Object.prototype.hasOwnProperty.call(changes || {}, "suppressed");
    const mw = casbinMiddleware("fact", isModerationChange ? "admin" : "write");
    return mw(req, res, next);
  },
  idParamValidation,
  factValidation,
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const id = extractNumericId(req.params.id);
      const changes = (req as any).factChanges ?? req.body;
      // Check if fact exists first
      const existing = await getFactById(id);
      if (!existing) {
        throw new NotFoundError(`Fact with id ${id} not found`);
      }
      await updateFact(id, changes as Partial<NewFactInput>);
      res.json({ ok: true });
    } catch (err) {
      handleError(res, "PUT /api/facts/facts/:id", err);
    }
  }
);

router.delete(
  "/facts/:id",
  casbinMiddleware("fact", "admin"),
  idParamValidation,
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const id = extractNumericId(req.params.id);
      // Check if fact exists first
      const existing = await getFactById(id);
      if (!existing) {
        throw new NotFoundError(`Fact with id ${id} not found`);
      }
      await deleteFact(id);
      res.json({ ok: true });
    } catch (err) {
      handleError(res, "DELETE /api/facts/facts/:id", err);
    }
  }
);

router.get("/", (_req: Request, res: Response) => {
  res.json({ message: "Welcome to the Fabs Fact DB API" });
});

export default router;
