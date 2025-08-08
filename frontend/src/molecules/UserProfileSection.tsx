// src/molecules/UserProfile.tsx
import React from "react";
import ImgAvatar from "@/atoms/ImgAvatar";
import ButtonNative from "@/atoms/Button/ButtonNative";
import ProviderIcon from "../atoms/ProviderIcon"; // <- Make this as an atom (see below)
import styles from "./UserProfile.module.scss";
import type { User } from "../hooks/useAuth";

interface UserProfileProps {
  user: User;
  onLogout: () => Promise<void>;
}

const UserProfile: React.FC<UserProfileProps> = ({ user, onLogout }) => {
  const providerKey = (user.provider ?? "").toLowerCase();
  const providerDisplay = providerKey
    ? providerKey.charAt(0).toUpperCase() + providerKey.slice(1)
    : "";

  return (
    <div className={styles.profileLoggedIn}>
      <ImgAvatar user={user} />
      <div className={styles.userInfo}>
        <span className={styles.username}>{user.username}</span>
        <span className={styles.provider}>
          Logged in with{" "}
          <strong>
            <ProviderIcon provider={providerKey} /> {providerDisplay}
          </strong>
        </span>
      </div>
      <ButtonNative onClick={() => { onLogout().catch(console.error); }} variant="secondary" size="sm">
        Logout
      </ButtonNative>
    </div>
  );
};

export default UserProfile;
