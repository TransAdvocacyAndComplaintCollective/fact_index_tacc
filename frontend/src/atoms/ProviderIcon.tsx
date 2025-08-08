// src/atoms/ProviderIcon.tsx
import React from "react";
import type { JSX } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faDiscord,
  faGoogle,
  faFacebook,
} from "@fortawesome/free-brands-svg-icons";
import { faFeatherAlt, faUserShield } from "@fortawesome/free-solid-svg-icons";

// Map provider keys to icons
const PROVIDER_ICONS: Partial<Record<string, JSX.Element>> = {
  discord: <FontAwesomeIcon icon={faDiscord} />,
  google: <FontAwesomeIcon icon={faGoogle} />,
  facebook: <FontAwesomeIcon icon={faFacebook} />,
  bluesky: <FontAwesomeIcon icon={faFeatherAlt} />,
  dev: <FontAwesomeIcon icon={faUserShield} />,
  admin: <FontAwesomeIcon icon={faUserShield} />,
};

interface ProviderIconProps {
  provider: string;
  className?: string; // Optional for extra styling
}

const ProviderIcon: React.FC<ProviderIconProps> = ({ provider, className }) => {
  const icon = PROVIDER_ICONS[provider.toLowerCase()];
  return icon ? <span className={className}>{icon}</span> : null;
};

export default ProviderIcon;
