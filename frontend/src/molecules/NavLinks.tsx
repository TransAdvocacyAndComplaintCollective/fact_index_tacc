// src/molecules/NavLinks.tsx
import React from "react";
import ButtonNavLink from "@/atoms/Button/ButtonNavLink";
import styles from "./NavLinks.module.scss";
import type { ButtonSize, ButtonVariant } from "@/atoms/Button/ButtonTypes";

export interface NavLinkItem {
  to: string;
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

interface NavLinksProps {
  links: NavLinkItem[];
}

const NavLinks: React.FC<NavLinksProps> = ({ links }) => {
  return (
    <div className={styles.navLinks}>
      {links.map((link) => (
        <ButtonNavLink
          key={link.to}
          to={link.to}
          variant={link.variant ?? "outlined"}
          size={link.size ?? "sm"}
          className={link.className ?? styles.link}
        >
          {link.label}
        </ButtonNavLink>
      ))}
    </div>
  );
};

export default NavLinks;
