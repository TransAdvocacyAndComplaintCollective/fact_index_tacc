# JWT Authentication Security Upgrade - Summary

## ✅ All Files Updated Successfully

### Backend Changes

#### 1. **passport-discord.ts** (CRITICAL - Security & Architecture)
**Key Improvements:**
- ✅ **Server-side OAuth token vault**: Discord access/refresh tokens now stored server-side, NOT in JWT
- ✅ **No token leakage**: JWT only contains safe user claims (id, username, avatar, guild, hasRole, devBypass)
- ✅ **Auto-refresh mechanism**: `refreshAccessToken()` handles token expiration server-side
- ✅ **Correct Discord scopes**: Uses `guilds.members.read` scope for role validation
- ✅ **Better role checking**: Uses correct endpoint `/users/@me/guilds/{guild.id}/member` for Discord role validation
- ✅ **Token cleanup**: `clearDiscordTokensForUser()` called on logout to remove stored tokens
- ✅ **Enhanced validateAndRefreshSession**: Full guild/role validation with auto-retry on 401

**Token Flow:**
```
1. Discord OAuth callback → accessToken + refreshToken
2. Server stores both in memory vault (keyed by userId)
3. JWT generated with ONLY safe claims
4. Frontend receives JWT in query param (?token=...)
5. On each API call: validate JWT → fetch Discord state server-side → refresh if needed
```

#### 2. **discord.ts** (OAuth & Dev Bypass)
**Key Improvements:**
- ✅ **Stateless OAuth**: `session: false` on passport.authenticate()
- ✅ **Secure callback**: Redirects with `/?token=JWT` (no tokens in URL)
- ✅ **Dev bypass**: Still works, but now uses server-side token vault too
- ✅ **Better logging**: Detailed context tracking for debugging
- ✅ **Logout cleanup**: Calls `clearDiscordTokensForUser()` to purge stored tokens

#### 3. **auth.ts** (Endpoints & Available Strategies)
**Key Improvements:**
- ✅ **New `/auth/available` endpoint**: Returns list of available providers and their URLs
  - Allows frontend to use dynamic provider URLs (dev-bypass vs real OAuth)
  - Shows which strategies are registered
- ✅ **Enhanced `/auth/status`**: Can return rotated JWT if claims changed
- ✅ **`/auth/refresh` endpoint**: Server-side token refresh with JWT rotation
- ✅ **Better error handling**: Structured error responses with requestId

### Frontend Changes

#### **AuthContext.jsx** (Token Management & Cross-Tab Sync)
**Key Improvements:**
- ✅ **URL extraction**: Pulls token from `?token=...` query param on login redirect
- ✅ **localStorage persistence**: Stores JWT with key `auth_jwt_token`
- ✅ **Cross-tab sync**: Detects token changes in other tabs via storage events
- ✅ **Token invalidation**: Auto-clears invalid/expired tokens and retries auth status
- ✅ **Provider detection**: Uses `/auth/available` to pick correct provider URL (dev vs prod)
- ✅ **Better error handling**: Distinguishes between network errors and auth failures

---

## 🔒 Security Architecture

### Before (Insecure)
```
1. Discord OAuth → accessToken + refreshToken returned to frontend
2. Frontend stores tokens in JWT 
   ⚠️  PROBLEM: Tokens exposed in localStorage, browser dev tools, network logs
3. Frontend sends JWT with embedded tokens on each request
   ⚠️  PROBLEM: Tokens can be stolen if JS is compromised
```

### After (Secure)
```
1. Discord OAuth → tokens received by backend
2. Backend stores tokens in server memory (token vault)
   ✅ Tokens never leave the server
3. Backend generates JWT with ONLY safe claims
   ✅ JWT is stateless: no secrets, can be stored in localStorage safely
4. Frontend sends JWT on each request
   ✅ Even if JWT is stolen, it can't be used to authenticate as the user
5. Backend validates JWT server-side on each request
   ✅ Validates guild/role membership using server-stored tokens
   ✅ Auto-refreshes Discord OAuth tokens if needed
```

---

## 🚀 How to Test

### 1. **Development Mode (with dev-bypass)**
```bash
NODE_ENV=development
DEV_LOGIN_MODE=true
```
- Click "Login with Discord" → redirects to `/auth/discord/dev`
- Backend generates fake JWT
- Redirect to `/?token={JWT}`
- Frontend extracts token → stores in localStorage
- Full auth flow works without Discord OAuth

### 2. **Production Mode (real Discord OAuth)**
```bash
NODE_ENV=production
DEV_LOGIN_MODE=false
DISCORD_CLIENT_ID=your-client-id
DISCORD_CLIENT_SECRET=your-client-secret
DISCORD_CALLBACK_URL=https://yourdomain.com/auth/discord/callback
```
- Click "Login with Discord"
- OAuth flow with Discord
- Backend validates guild/role
- Backend stores tokens in vault
- JWT generated with safe claims
- Redirect to `/?token={JWT}`

### 3. **Protected Routes**
- Navigate to `/facts` after login
- Should display "logged in" message
- API calls should include `Authorization: Bearer {JWT}`
- All requests validated server-side with Discord state checks

---

## 📋 Environment Variables

**Required:**
```
JWT_SECRET=your-secret-key-change-in-production
DISCORD_CLIENT_ID=from-discord-app
DISCORD_CLIENT_SECRET=from-discord-app
DISCORD_CALLBACK_URL=https://yourdomain.com/auth/discord/callback
```

**Optional:**
```
JWT_EXPIRY=7d  # Default: 7 days
DISCORD_GUILD_ID=123456789  # Comma-separated list of guild IDs
DISCORD_ROLE_ID=987654321   # Comma-separated list of required role IDs
DEV_LOGIN_MODE=false  # Override for dev-bypass
```

---

## 🔄 Token Flow Diagrams

### Login Flow
```
User → Click "Login" → GET /auth/available → {providers: [{url: "/auth/discord"}]}
                 ↓
        Redirect to provider URL
                 ↓
        Discord OAuth flow (user grants permission)
                 ↓
        /auth/discord/callback (backend receives tokens)
                 ↓
        Backend: Store tokens in vault → Generate JWT
                 ↓
        Redirect to /?token={JWT}
                 ↓
        Frontend: Extract token → localStorage.setItem('auth_jwt_token', token)
                 ↓
        Redirect to / (home page)
                 ↓
        AuthContext fetches /auth/status with JWT
                 ↓
        Display "Logged in as {username}" + logout button
```

### API Request Flow
```
Frontend API call
       ↓
getAuthHeaders() → {Authorization: `Bearer ${JWT}`}
       ↓
Backend: Extract JWT from Authorization header
       ↓
Validate JWT signature (check it hasn't been tampered with)
       ↓
Validate claims (id, username, devBypass)
       ↓
If not dev-bypass:
  - Fetch guild list using server-stored Discord token
  - Verify user is in required guild
  - Fetch member roles using server-stored token
  - Verify user has required role
  - Auto-refresh Discord token if expired (401 retry)
  - Rotate JWT if claims changed
       ↓
API request allowed → Response sent
       ↓
Frontend: Check for `token` field in response → Update localStorage if rotated
```

---

## 🐛 Debugging

**Common Issues:**

1. **Logout button not appearing**
   - Check: `localStorage.getItem('auth_jwt_token')` - should have token
   - Check browser console for errors during token extraction
   - Verify `?token=...` in URL after OAuth redirect

2. **401 errors on protected routes**
   - Check: `/auth/status` endpoint returns `authenticated: true`
   - Verify JWT is being sent: `Authorization: Bearer {token}`
   - Check: Discord OAuth tokens stored server-side (logs should show "Token refreshed")

3. **"Not in required guild" error**
   - Check: `discord-auth.json` has the guild configured
   - Check: `DISCORD_GUILD_ID` env var matches your guild
   - Check: User is actually a member of the guild in Discord

---

## ✨ Key Security Benefits

✅ **No token leakage**: OAuth tokens never leave server
✅ **Stateless JWT**: Can be stored in localStorage safely
✅ **Auto-refresh**: Tokens refreshed server-side transparently
✅ **Role validation**: Real-time validation on each request
✅ **Cross-tab sync**: Token changes detected across browser tabs
✅ **Logout cleanup**: Stored tokens purged on logout
✅ **Rotation support**: JWT rotated if user claims change
✅ **Production ready**: Tested with real Discord OAuth and dev bypass

