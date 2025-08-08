
import React from 'react';
import styles from './ImgAvatar.module.scss'; 
import type { User } from '@/hooks/useAuth';

interface ImgAvatarProps {
  user?: User | null;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  alt?: string;
}

// Avatar URL builders
function getDiscordAvatarUrl(id?: string, avatar?: string) {
  if (id != null && id !== "" && avatar != null && avatar !== "") {
    return `https://cdn.discordapp.com/avatars/${id}/${avatar}.png`;
  }
  return undefined;
}
function getFacebookAvatarUrl(id?: string) {
  if (id != null && id !== "") {
    return `https://graph.facebook.com/${id}/picture?type=square`;
  }
  return undefined;
}

function getUserAvatar(user?: User | null) {
  if (!user || (user.provider == null)) return undefined;
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

const ImgAvatar: React.FC<ImgAvatarProps> = ({
  user,
  className = "",
  style = {},
  alt = "",
}) => {
  const avatarUrl = getUserAvatar(user);
  if (avatarUrl === undefined || avatarUrl === "") {
    return null;
  }
  return (
    <img
      src={avatarUrl}
      alt={alt.length > 0 ? alt : `${user?.username ?? "User"}'s avatar`}
      className={[styles.avatar, className].join(" ")}
      style={{ ...style }}
      loading="lazy"
    />
  );
};

export default ImgAvatar;

// ImgAvatar.scss.d.ts