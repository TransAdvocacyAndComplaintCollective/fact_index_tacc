// src/components/NavBar.tsx
import React from "react";
import Button from "../atoms/Button";
import * as styles from './NavBar.module.scss';

import { useAuth, User } from "../hooks/useAuth";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faDiscord,
  faGoogle,
  faFacebook,
} from "@fortawesome/free-brands-svg-icons";
import { faFeatherAlt, faUserShield } from "@fortawesome/free-solid-svg-icons";

// Avatar URL builders
function getDiscordAvatarUrl(id?: string, avatar?: string) {
  return id && avatar
    ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.png`
    : undefined;
}
function getFacebookAvatarUrl(id?: string) {
  return id
    ? `https://graph.facebook.com/${id}/picture?type=square`
    : undefined;
}

const PROVIDER_ICONS: Record<string, React.ReactNode> = {
  discord: <FontAwesomeIcon icon={faDiscord} />,
  google: <FontAwesomeIcon icon={faGoogle} />,
  facebook: <FontAwesomeIcon icon={faFacebook} />,
  bluesky: <FontAwesomeIcon icon={faFeatherAlt} />,
  dev: <FontAwesomeIcon icon={faUserShield} />,
  admin: <FontAwesomeIcon icon={faUserShield} />,
};

function getUserAvatar(user?: User | null) {
  if (!user || !user.provider) return undefined;
  switch (user.provider) {
    case "discord":
      return getDiscordAvatarUrl(user.id, user.avatar);
    case "facebook":
      return getFacebookAvatarUrl(user.id);
    case "admin":
      return user.profileImage;
    case "google":
    case "bluesky":
      return user.avatar;
    default:
      return user.avatar;
  }
}

const NavBar: React.FC = () => {
  const { loading, providers, authenticated, user, login, logout } = useAuth();
  const avatarUrl = getUserAvatar(user ? Object.values(user)[0] : null);
  const currentUser = user ? Object.values(user)[0] : null;

  let userSection: React.ReactNode;

  if (loading) {
    userSection = (
      <div style={{ minWidth: 90, textAlign: "center", opacity: 0.7 }}>
        Loading…
      </div>
    );
  } else if (authenticated && currentUser) {
    const providerKey = currentUser.provider?.toLowerCase() || "";
    const providerDisplay =
      providerKey.charAt(0).toUpperCase() + providerKey.slice(1);

    userSection = (
      <div className={styles.profileLoggedIn}>
        {avatarUrl && (
          <img
            src={avatarUrl}
            alt={`${currentUser.username}'s avatar`}
            className={styles.avatar}
          />
        )}
        <div className={styles.userInfo}>
          <span className={styles.username}>{currentUser.username}</span>
          <span className={styles.provider}>
            Logged in with{" "}
            <strong>
              {PROVIDER_ICONS[providerKey]} {providerDisplay}
            </strong>
          </span>
        </div>
        <Button onClick={logout} variant="secondary" size="sm">
          Logout
        </Button>
      </div>
    );
  } else {
    userSection = (
      <div className={styles.loginButtons}>
        {Object.entries(providers || {}).map(
          ([key, available]) =>
            available &&
            key !== "admin" && (
              <Button
                key={key}
                onClick={() => login(key as any)}
                variant="outlined"
                size="sm"
                className={styles.link}
              >
                {PROVIDER_ICONS[key]} {key.charAt(0).toUpperCase() + key.slice(1)}
              </Button>
            )
        )}
      </div>
    );
  }

  return (
    <nav className={styles.appNavbar}>
      <div className={styles.navLeft}>
        <Button to="/" variant="outlined" size="sm" className={styles.link}>
          Home
        </Button>
        <Button to="/facts" variant="outlined" size="sm" className={styles.link}>
          Fact Database
        </Button>
      </div>
      <div className={styles.userProfile}>{userSection}</div>
    </nav>
  );
};

export default NavBar;
