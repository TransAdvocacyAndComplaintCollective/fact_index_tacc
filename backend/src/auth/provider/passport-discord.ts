// src/passport-discord.ts
import express, { Request, Response } from "express";
import passport from "passport";
import { Strategy as DiscordStrategy, Profile } from "passport-discord";
import pinoLogger from "../../logger/pino.js";
import type { AuthUser, DiscordAuthUser } from "../auth_types.js";
import { RequestIssueJWT } from "../tokenUtils.js";
import type { LoginFact } from "../../db/user/types.ts";

import { IdentifierType, Provider } from "../../db/user/model.js";
import { getPermissions } from "../../db/user/access.js";
import { AppDataSource } from "../../db/db.js";

const router = express.Router();
const log = pinoLogger.child({ component: "discord-auth" });

// ----- Env helper -----
function mustEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) {
    log.error({ key }, `Missing required env var: ${key}`);
    throw new Error(`Environment variable ${key} is required`);
  }
  return value;
}

// ----- Config -----
const DISCORD_ENV_KEYS = [
  "DISCORD_CLIENT_ID",
  "DISCORD_CLIENT_SECRET",
  "DISCORD_CALLBACK_URL",
  "DISCORD_GUILD_ID",
  "DISCORD_JWT_SECRET",
];

export const DISCORD_ENABLED = DISCORD_ENV_KEYS.every(k => Boolean(process.env[k]));

export const REQUIRED_ROLE_IDS: string[] = process.env.DISCORD_REQUIRED_ROLE_IDS
  ? process.env.DISCORD_REQUIRED_ROLE_IDS.split(",").map(s => s.trim()).filter(Boolean)
  : [];

if (!DISCORD_ENABLED) {
  log.warn("Discord provider disabled due to missing env vars");
}

// ----- Guild membership & role verification -----
export async function verifyDiscordMembership(accessToken: string): Promise<boolean> {
  const guildId = mustEnv("DISCORD_GUILD_ID");
  const resp = await fetch(`https://discord.com/api/users/@me/guilds/${guildId}/member`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (resp.status === 401) throw new Error("Discord token invalid");
  if (!resp.ok) throw new Error(`Unable to verify Discord membership (status ${resp.status})`);

  const member = (await resp.json()) as { roles?: string[] };

  if (REQUIRED_ROLE_IDS.length) {
    return REQUIRED_ROLE_IDS.some(id => member.roles?.includes(id));
  }
  return true;
}

// ----- Passport Strategy -----
if (DISCORD_ENABLED) {
  passport.use(
    new DiscordStrategy(
      {
        clientID: mustEnv("DISCORD_CLIENT_ID"),
        clientSecret: mustEnv("DISCORD_CLIENT_SECRET"),
        callbackURL: mustEnv("DISCORD_CALLBACK_URL"),
        scope: ["identify", "guilds", "guilds.members.read"],
        state: true,
      },
      async (accessToken, _refreshToken, profile: Profile, done) => {
        try {
          const inGuild = profile.guilds?.some(g => g.id === mustEnv("DISCORD_GUILD_ID"));
          if (!inGuild) return done(null, false, { message: "Missing guild access" });

          // Fetch member info from Discord API
          const guildId = mustEnv("DISCORD_GUILD_ID");
          const memberResp = await fetch(`https://discord.com/api/users/@me/guilds/${guildId}/member`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (memberResp.status === 401) throw new Error("Discord token invalid");
          if (!memberResp.ok) throw new Error(`Unable to verify Discord membership (status ${memberResp.status})`);
          const member = (await memberResp.json()) as { roles?: string[] };

          const hasRole = REQUIRED_ROLE_IDS.length
            ? REQUIRED_ROLE_IDS.some(id => member.roles?.includes(id))
            : true;
          if (!hasRole) return done(null, false, { message: "Missing required role" });

          const loginFacts: LoginFact[] = [
            { 
              provider: Provider.DISCORD,
              type: IdentifierType.USER_ID,
              value: profile.id,
            },
            { 
              provider: Provider.DISCORD,
              type: IdentifierType.USERNAME,
              value: profile.username,
            },
          ];
          if (profile.email) {
            loginFacts.push({
              provider: Provider.DISCORD,
              type: IdentifierType.EMAIL,
              value: profile.email,
            });
          }
          let guildIds: string[] = [];
          let roles: string[] = [];
          profile.guilds?.forEach(guild => {
            loginFacts.push({
              provider: Provider.DISCORD,
              type: IdentifierType.GUILD_ID,
              value: guild.id,
            });
            guildIds.push(guild.id);
          });
          member.roles?.forEach(roleId => {
            loginFacts.push({
              provider: Provider.DISCORD,
              type: IdentifierType.ROLE_ID,
              value: roleId,
            });
            roles.push(roleId);
          });
          const params = await getPermissions(AppDataSource, loginFacts);

          const user: DiscordAuthUser = {
            id: profile.id,
            provider: "discord",
            username: profile.username,
            avatar: profile.avatar ?? null,
            accessToken,
            expiresAt: 0, // LET WORK THIS OUT LATER
            authenticated: true,
            reason: "authenticated",
            params: params,
            guildIds: guildIds,
            roleIds: roles,
            loginFacts: loginFacts
          };

          done(null, user);
        } catch (err: any) {
          log.error({ err }, "Discord verify error");
          done(err, false, { message: "Discord auth failure" });
        }
      }
    )
  );
}

// ----- Routes -----
router.get("/login", passport.authenticate("discord"));

export function validateDiscord(validatedUser: DiscordAuthUser): Promise<DiscordAuthUser | null> {
  // Implement your validation logic here
  return Promise.resolve(validatedUser);
}

router.get(
  "/callback",
  passport.authenticate("discord", { session: false, failureRedirect: "/login" }),
  async (req: Request, res: Response) => {
    const user = req.user as DiscordAuthUser;

    // Optional: revalidate before issuing JWT
    const validatedUser = await validateDiscord(user);
    if (!validatedUser) {
      log.warn({ id: user.id }, "Discord revalidation failed in callback");
      return res.redirect("/login");
    }

    await RequestIssueJWT(res, validatedUser as AuthUser);
    res.redirect(`/`);
  }
);

export default router;
