import passport from "passport";
import { Strategy as MagicLinkStrategy } from "passport-magic-link";
import { randomBytes } from "node:crypto";
import { log, generateJWT } from "./jwt.ts";

const MAGIC_LINK_SECRET = process.env.MAGIC_LINK_SECRET || randomBytes(32).toString("hex");
const MAGIC_LINK_ENABLED = Boolean(process.env.MAGIC_LINK_ENABLED === "true" || process.env.MAGIC_LINK_SECRET);
const MAGIC_LINK_TTL = parseInt(process.env.MAGIC_LINK_TTL || "600", 10); // seconds

// In-memory pending captures for admin requests: email -> resolver
const pendingSends = new Map<string, { resolve: (token: string) => void; timer: NodeJS.Timeout }>();

// Minimal sendToken implementation — logs the token (replace with email/SMS in production)
const sendToken = async (user: any, token: string, req?: any) => {
  try {
    const destination = (user && (user.email || user.emailAddress)) || "(unknown)";
    const link = `${req?.protocol || "https"}://${req?.get?.("host") || "localhost"}/auth/magiclink/callback?token=${encodeURIComponent(token)}`;
    log("info", `[magiclink] Sending token to ${destination} link=${link.slice(0, 120)}...`);

    // If an admin requested a capture for this email, resolve the pending promise
    const emailKey = (user && (user.email || user.emailAddress)) ? String(user.email || user.emailAddress).trim() : null;
    if (emailKey && pendingSends.has(emailKey)) {
      const pending = pendingSends.get(emailKey)!;
      clearTimeout(pending.timer);
      pendingSends.delete(emailKey);
      pending.resolve(token);
    }

    // In production integrate with an email/SMS provider here
    return Promise.resolve(true);
  } catch (err) {
    log("error", "[magiclink] sendToken error:", err);
    return Promise.reject(err);
  }
};

/**
 * Capture the next sendToken call for the given email. Returns the raw token.
 * Used by admin endpoints to generate a magic link and return it directly.
 */
export function captureSendTokenFor(email: string, timeoutMs = 10000): Promise<string> {
  return new Promise((resolve, reject) => {
    const key = String(email).trim();
    if (!key) return reject(new Error("invalid_email"));

    if (pendingSends.has(key)) return reject(new Error("capture_in_progress"));

    const timer = setTimeout(() => {
      pendingSends.delete(key);
      reject(new Error("timeout"));
    }, timeoutMs) as unknown as NodeJS.Timeout;

    pendingSends.set(key, { resolve, timer });
  });
}

// Minimal verifyUser implementation — lookup or create a minimal user object
const verifyUser = async (user: any, req?: any) => {
  // The magic-link package will pass the request fields listed in userFields.
  // We'll create a minimal user record used by generateJWT later when handling the authenticate callback.
  const email = user && (user.email || user.emailAddress) ? String(user.email || user.emailAddress).trim() : null;
  const id = email || `magic-${randomBytes(6).toString("hex")}`;
  return { id, email } as any;
};

export function isMagicLinkEnabled(): boolean {
  return MAGIC_LINK_ENABLED;
}

// Register strategy if enabled
if (MAGIC_LINK_ENABLED) {
  try {
    passport.use(
      "magiclink",
      new (MagicLinkStrategy as any)(
        {
          secret: MAGIC_LINK_SECRET,
          userFields: ["email"],
          tokenField: "token",
          ttl: MAGIC_LINK_TTL,
          passReqToCallbacks: true,
        },
        // sendToken
        async (user: any, token: string, req?: any) => sendToken(user, token, req),
        // verifyUser
        async (user: any, req?: any) => verifyUser(user, req),
      ),
    );
    log("info", `[magiclink] Strategy registered (enabled=${MAGIC_LINK_ENABLED})`);
  } catch (err) {
    log("error", "[magiclink] Failed to register strategy:", err);
  }
} else {
  log("info", "[magiclink] Magic link disabled (MAGIC_LINK_ENABLED not set)");
}

export default passport;
