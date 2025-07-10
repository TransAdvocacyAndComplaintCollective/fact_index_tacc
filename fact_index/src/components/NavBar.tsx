import React, { useState } from "react";
import Button from "../atoms/Button";
import styles from "./NavBar.module.scss";
import { useAuth } from "../hocks/useAuth";

type User = {
  id: string;
  username: string;
  avatar?: string;
  provider?: string;
};

function getDiscordAvatarUrl(id?: string, avatar?: string) {
  if (!id || !avatar) return null;
  return `https://cdn.discordapp.com/avatars/${id}/${avatar}.png`;
}

const NavBar: React.FC = () => {
  const { user, logout, loading } = useAuth();

  // Helper: is Discord user
  const isDiscordUser = user && (user.provider === "discord" || user.avatar);

  return (
    <nav className={styles["app-navbar"]} aria-label="Main navigation">
      <div className={styles["nav-links"]}>
        <Button
          to="/"
          nav
          activeClassName={styles.active}
          variant="outlined"
          size="sm"
          className={styles.link}
          style={{ marginRight: 8 }}
        >
          Home
        </Button>
        <Button
          to="/facts"
          nav
          activeClassName={styles.active}
          variant="outlined"
          size="sm"
          className={styles.link}
        >
          Fact Database
        </Button>
      </div>

      <div className={styles["user-profile"]}>
        {loading ? (
          <div style={{ minWidth: 90, textAlign: "center", opacity: 0.7 }}>
            Loading…
          </div>
        ) : user ? (
          <div className={styles["profile-logged-in"]}>
            {isDiscordUser && user.avatar && (
              <img
                src={getDiscordAvatarUrl(user.id, user.avatar) || undefined}
                alt={`${user.username} avatar`}
                className={styles.avatar}
                width={32}
                height={32}
                style={{ marginRight: 6, borderRadius: "50%" }}
              />
            )}
            <span className={styles.username}>{user.username}</span>
            <Button
              onClick={logout}
              variant="secondary"
              size="sm"
              className={styles["btn-logout"]}
              type="button"
              // style={{ marginLeft: 8 }}
            >
              Logout
            </Button>
          </div>
        ) : (
          <div>
            <Button
              href="/auth/discord/discord"
              variant="primary"
              size="sm"
              // className={styles["btn-login"]}
              // style={{ marginRight: 8 }}
            >
              Login with Discord
            </Button>
          </div>
        )}
      </div>
    </nav>
  );
};

export default NavBar;
