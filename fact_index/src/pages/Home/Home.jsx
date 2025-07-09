// src/pages/Home/Home.jsx

import React from "react";
import { useAuthContext } from "../../context/AuthContext";
import { Link } from "react-router-dom";
import "./Home.scss";
// import { FaDatabase, FaPlusCircle, FaHome } from "react-icons/fa"; // optional icons

export default function Home() {
  const { loading, authenticated, user } = useAuthContext();

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
      <h1>Welcome to FACT INDEX2</h1>
      <div className="home-intro">
        {authenticated ? (
          <>
            <span>
              Hello{user?.username ? `, ${user.username}` : ""}! You are logged in.
            </span>
          </>
        ) : (
          <>
            <span>
              You can <Link to="/login">log in</Link> to access all features.
            </span>
          </>
        )}
      </div>

      <nav aria-label="Main navigation">
        <ul>
          <li>
            <Link to="/">
              {/* <FaHome style={{ marginRight: 6 }} /> */}
              Home
            </Link>
          </li>
          {authenticated && (
            <>
              <li>
                <Link to="/facts">
                  {/* <FaDatabase style={{ marginRight: 6 }} /> */}
                  Facts Database
                </Link>
              </li>
              <li>
                <Link to="/facts/new">
                  {/* <FaPlusCircle style={{ marginRight: 6 }} /> */}
                  Add a New Fact
                </Link>
              </li>
            </>
          )}
        </ul>
      </nav>
    </main>
  );
}
