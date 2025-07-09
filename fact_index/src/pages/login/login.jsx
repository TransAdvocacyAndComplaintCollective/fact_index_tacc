import React from "react";
import "./login.scss";

const providers = [
  {
    name: "Discord",
    url: "/auth/discord/discord",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden focusable="false">
        {/* Discord icon SVG */}
        <path
          fill="#5865F2"
          d="M22,24h-4v-3.5c0-1.5,0-3-1-3s-1.4,1.4-1.4,1.4S13,17.1,11.4,16.5c-1.5,0.7-2.7,1.6-2.7,1.6S8,17.4,8,16c0-2.7,3-2.2,3-2.2s0.3-1.4,0.6-2.8C9.6,9.3,7,8.8,7,6.8c0-0.8,0.8-1.2,1.6-1.2c1.1,0,2.5,1.1,3.4,2c0.9-0.9,2.3-2,3.4-2C16.2,5.6,17,6,17,6.8c0,2-2.6,2.5-4.6,4.2c0.3,1.4,0.6,2.8,0.6,2.8S19,13.3,19,16c0,1.4-0.3,2.1-0.3,2.1s-1.2-0.9-2.7-1.6C15,17.1,14.4,18.5,14.4,18.5s-0.4-1.4-1.4-1.4s-1,2-1,3.5V24H2C0.9,24,0,23.1,0,22V2C0,0.9,0.9,0,2,0h20c1.1,0,2,0.9,2,2v20C24,23.1,23.1,24,22,24z"
        />
      </svg>
    ),
  },
  // Add new providers as you build them:
  // {
  //   name: "Bluesky",
  //   url: "/auth/bluesky",
  //   icon: <BlueskyIcon />
  // },
  // {
  //   name: "Facebook",
  //   url: "/auth/facebook",
  //   icon: <FacebookIcon />
  // }
];

export default function Login() {
  return (
    <div className="login-wrapper">
      <div className="login-screen">
        <h2>Login required</h2>
        {providers.map((provider) => (
          <button
            key={provider.name}
            className={`login-btn login-btn-${provider.name.toLowerCase()}`}
            onClick={() => (window.location.href = provider.url)}
          >
            <span className="login-icon">{provider.icon}</span>
            Login with {provider.name}
          </button>
        ))}
      </div>
    </div>
  );
}
