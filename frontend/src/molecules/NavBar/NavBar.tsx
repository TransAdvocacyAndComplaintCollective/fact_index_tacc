// src/components/NavBar.tsx
import React from "react";
import * as styles from './NavBar.module.scss';
import { useAuth } from "../../hooks/useAuth";
import UserProfile from "@/molecules/UserProfileSection";
import type { NavLinkItem } from "@/molecules/NavLinks";
import NavLinks from "@/molecules/NavLinks";
import ButtonNavLink from "@/atoms/Button/ButtonNavLink";

const NavBar: React.FC = () => {
  const { loading, authenticated, user, logout } = useAuth();
  const currentUser = user ? Object.values(user)[0] : null;
  const links: NavLinkItem[] = [
    { to: "/", label: "Home", variant: "outlined", size: "sm" },
    { to: "/facts", label: "Fact Database", variant: "outlined", size: "sm" },
  ];
  let userSection: React.ReactNode;

  if (loading) {
    userSection = (
      <div style={{ minWidth: 90, textAlign: "center", opacity: 0.7 }}>
        Loading…
      </div>
    );
  } else if (authenticated && currentUser) {

    userSection = (
      <UserProfile user={currentUser} onLogout={logout} />
    );
  }
  else {
    userSection = (
      <div >

        <ButtonNavLink
          to={"/login"}
          variant={"outlined"}
          size={"sm"}
          className={styles.link}
        >
          Login
        </ButtonNavLink>
      </div>
    );
  }

  return (
    <nav className={styles.appNavbar}>
      <div className={styles.navLeft}>
        <NavLinks links={links} />
      </div>
      <div>{userSection}</div>
    </nav>
  );
};

export default NavBar;
