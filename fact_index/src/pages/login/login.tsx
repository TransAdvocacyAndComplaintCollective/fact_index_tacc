import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDiscord } from "@fortawesome/free-brands-svg-icons";
import "./login.scss";

interface Provider {
  name: string;
  url: string;
  icon: React.ReactNode;
}
const providers: Provider[] = [
  {
    name: "Discord",
    url: "/auth/discord/login",
    icon: <FontAwesomeIcon icon={faDiscord} />,
  },
  // ...add others as needed
];

export default function Login() {
  const [loading, setLoading] = useState<string | null>(null);

  const handleLogin = (provider: Provider) => {
    setLoading(provider.name);
    setTimeout(() => {
      window.location.href = provider.url;
    }, 150); // Brief delay for loading feedback, optional
  };

  return (
    <div className="login-wrapper">
      <div className="login-screen">
        <h2>Login required</h2>
        {providers.map((provider) => (
          <button
            key={provider.name}
            className={`login-btn login-btn-${provider.name.toLowerCase()}`}
            onClick={() => handleLogin(provider)}
            type="button"
            disabled={loading !== null}
            aria-busy={loading === provider.name}
          >
            <span className="login-icon">{provider.icon}</span>
            {loading === provider.name ? `Redirecting...` : `Login with ${provider.name}`}
          </button>
        ))}
      </div>
    </div>
  );
}
