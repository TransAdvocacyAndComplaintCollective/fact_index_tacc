// pages/login/login.tsx
import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faDiscord,
  faGoogle,
  faFacebook,
} from "@fortawesome/free-brands-svg-icons";
import { faUserShield } from "@fortawesome/free-solid-svg-icons";
import style from "./login.module.scss";
import { useAuth } from "../../hooks/useAuth";
import type { ProviderKeys as AuthProviderKeys } from "@/hooks/useAuth";

// Simple fallback for Bluesky
const BlueskyIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="10" fill="#009DF5" />
    <text x="12" y="16" textAnchor="middle" fill="#fff" fontSize="10" fontFamily="Arial">
      B
    </text>
  </svg>
);

export type Provider = {
  name: string;
  icon: React.ReactNode;
  btnClass?: string;
};

export const PROVIDER_META: Record<AuthProviderKeys, Provider> = {
  discord: {
    name: "Discord",
    icon: <FontAwesomeIcon icon={faDiscord} />,
    btnClass: style.loginBtnDiscord,
  },
  google: {
    name: "Google",
    icon: <FontAwesomeIcon icon={faGoogle} />,
  },
  facebook: {
    name: "Facebook",
    icon: <FontAwesomeIcon icon={faFacebook} />,
  },
  bluesky: {
    name: "Bluesky",
    icon: BlueskyIcon,
  },
  admin: {
    name: "Admin",
    icon: <FontAwesomeIcon icon={faUserShield} />,
  },
  dev: {
    name: "Dev",
    icon: <FontAwesomeIcon icon={faUserShield} />,
  },
};

export type ProviderKeys = keyof typeof PROVIDER_META;

export default function Login() {
  const { loading, providers, login } = useAuth();
  console.log("[Login] Providers:", providers);

  // Helper to safely extract a string message from unknown errors
  function getErrorMessage(err: unknown, defaultMessage: string): string {
    if (err instanceof Error && typeof err.message === "string") {
      return err.message;
    } else if (typeof err === "string") {
      return err;
    }
    return defaultMessage;
  }

  const [loginState, setLoginState] = useState<ProviderKeys | null>(null);
  const [adminCreds, setAdminCreds] = useState({ username: "", password: "" });
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  // Handles OAuth and non-admin logins
  const handleLogin = async (key: ProviderKeys) => {
    setAdminError(null);
    setLoginState(key);
    try {
      if (key === "admin") {
        setShowAdmin(true);
        setLoginState(null);
        return;
      }
      await login(key);
      setLoginState(null);
    } catch (err: unknown) {
      setLoginState(null);
      setAdminError(getErrorMessage(err, "Login failed"));
    }
  };

  // Handles admin form submission
  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginState("admin");
    setAdminError(null);
    try {
      await login("admin", adminCreds);
      setLoginState(null);
      setShowAdmin(false);
    } catch (err: unknown) {
      setAdminError(getErrorMessage(err, "Admin login failed"));
      setLoginState(null);
    }
  };

  return (
    <div className={style.loginWrapper}>
      <div className={style.loginScreen}>
        <h2>Login required</h2>
        {(Object.keys(providers) as ProviderKeys[]).map((key) => {
          if (providers[key] !== true) return null;
          if (!(key in PROVIDER_META)) return null;
          const { name, icon, btnClass } = PROVIDER_META[key];
          return (
            <button
              key={key}
              className={
                btnClass != null && btnClass !== ""
                  ? `${style.loginBtn} ${btnClass}`
                  : style.loginBtn
              }
              onClick={() => void handleLogin(key)}
              type="button"
              disabled={loading || loginState !== null}
              aria-busy={loginState === key}
            >
              <span className={style.loginIcon}>{icon}</span>
              {loginState === key ? "Redirecting..." : `Login with ${name}`}
            </button>
          );
        })}

        {/* Admin login modal */}
        {showAdmin && (
          <div className={style.adminModal}>
            <form onSubmit={(e) => void handleAdminSubmit(e)}>
              <h3>Admin Login</h3>
              <input
                type="text"
                placeholder="Username"
                value={adminCreds.username}
                onChange={(e) => setAdminCreds({ ...adminCreds, username: e.target.value })}
                required
                disabled={loginState != null}
              />
              <input
                type="password"
                placeholder="Password"
                value={adminCreds.password}
                onChange={(e) => setAdminCreds({ ...adminCreds, password: e.target.value })}
                required
                disabled={loginState != null}
              />
              <button type="submit" disabled={loginState != null}>
                {loginState === "admin" ? "Logging in..." : "Login as Admin"}
              </button>
              <button
                type="button"
                onClick={() => setShowAdmin(false)}
                disabled={loginState != null}
              >
                Cancel
              </button>
              {adminError != null && adminError !== "" && (
                <div className={style.errorMsg}>{adminError}</div>
              )}
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
