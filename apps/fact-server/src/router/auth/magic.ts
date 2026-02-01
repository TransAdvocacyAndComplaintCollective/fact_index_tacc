import express from "express";
import logger from "../../logger.ts";

const router = express.Router();

// Callback route that the user visits from the magic link.
// Accepts a token parameter and redirects to home with it in the URL
// so the frontend can store it in localStorage and use it for auth.
router.get("/magiclink/callback", (req, res) => {
  try {
    const token = req.query.token as string | undefined;
    if (!token) {
      logger.warn("[magic] Magic link callback: missing token parameter");
      return res.status(400).json({ error: "missing_token", message: "token parameter required" });
    }

    logger.info("[magic] Magic link callback successful - redirecting with token");

    // Redirect to home with token in URL so frontend can store it
    return res.redirect(`/?token=${encodeURIComponent(token)}`);
  } catch (err: unknown) {
    logger.error("[magic] callback error", { error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ error: "server_error" });
  }
});

export default router;
