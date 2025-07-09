import React from 'react';
import { NavLink } from 'react-router-dom';
import styles from './NavBar.module.scss';
import { useAuth } from '../hocks/useAuth';

function getDiscordAvatarUrl(id, avatar) {
  if (!id || !avatar) return null;
  return `https://cdn.discordapp.com/avatars/${id}/${avatar}.png`;
}

function NavBar() {
  const { user, logout, loading } = useAuth();

  // Helper to check if the current user is a Discord login
  const isDiscordUser = user && (user.provider === 'discord' || user.avatar);

  return (
    <nav className={styles['app-navbar']} aria-label="Main navigation">
      <div className={styles['nav-links']}>
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            [styles.link, isActive ? styles.active : ''].filter(Boolean).join(' ')
          }
        >
          Home
        </NavLink>
        <NavLink
          to="/facts"
          className={({ isActive }) =>
            [styles.link, isActive ? styles.active : ''].filter(Boolean).join(' ')
          }
        >
          Fact Database
        </NavLink>
      </div>

      <div className={styles['user-profile']}>
        {loading ? (
          <div style={{ minWidth: 90, textAlign: 'center', opacity: 0.7 }}>Loading…</div>
        ) : isDiscordUser ? (
          <div className={styles['profile-logged-in']}>
            {user.avatar &&
              <img
                src={getDiscordAvatarUrl(user.id, user.avatar)}
                alt={`${user.username} avatar`}
                className={styles.avatar}
              />
            }
            <span className={styles.username}>{user.username}</span>
            <button
              onClick={logout}
              className={styles['btn-logout']}
              type="button"
            >
              Logout
            </button>
          </div>
        ) : user ? (
          // Example for another provider, e.g. Facebook (expand this as you add providers)
          <div className={styles['profile-logged-in']}>
            <span className={styles.username}>{user.username}</span>
            <button
              onClick={logout}
              className={styles['btn-logout']}
              type="button"
            >
              Logout
            </button>
          </div>
        ) : (
          <div>
            <a
              href="/auth/discord/discord"
              className={styles['btn-login']}
              style={{ marginRight: 8 }}
            >
              Login with Discord
            </a>
            {/* Example: Add another login provider if needed */}
            {/* <a
              href="/auth/facebook"
              className={styles['btn-login']}
            >
              Login with Facebook
            </a> */}
          </div>
        )}
      </div>
    </nav>
  );
}

export default NavBar;
