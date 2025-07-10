// src/pages/Home/Home.tsx

import React from "react";
import { Link } from "react-router-dom";
import { useAuthContext } from "../../context/AuthContext";
import "./Home.scss";
import Button from "../../atoms/Button"; // <-- Make sure Button.tsx exists here

// You may want to declare or import these types from your AuthContext
interface User {
  username?: string;
  [key: string]: any;
}

interface AuthContextValue {
  loading: boolean;
  authenticated: boolean;
  user: User | null;
}

export default function Home() {
  const { loading, authenticated, user } = useAuthContext() as AuthContextValue;

  if (loading) {
    return (
      <main className="app-root" data-testid="home-loading">
        <h1>Welcome to FACT INDEX</h1>
        <p className="home-intro">Checking authentication…</p>
      </main>
    );
  }

  return (
    <main className="app-root" data-testid="home-main">
      <h1>Welcome to FACT INDEX</h1>
      <div className="home-intro">
        {authenticated ? (
          <span>
            Hello{user?.username ? `, ${user.username}` : ""}! You are logged in.
          </span>
        ) : (
          <span>
            You can <Link to="/login">log in</Link> to access all features.
          </span>
        )}
      </div>

      <nav aria-label="Main navigation">
        <ul>
          <li>
            <Link to="/">Home</Link>
          </li>
          

          {authenticated && (
            <>
              <li>
                <Link to="/facts">Facts Database</Link>
              </li>
              <li>
                <Link to="/facts/new">Add a New Fact</Link>
              </li>
            </>
          )}
        </ul>
      </nav>
    </main>
  );
}
