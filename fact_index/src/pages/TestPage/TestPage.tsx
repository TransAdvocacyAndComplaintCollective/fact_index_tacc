import React, { useCallback } from "react";


function TestPage() {
  const handleClick = useCallback(() => {
    console.log("Test button clicked!");
  }, []);

  return (
    <div className="test-page">
      <h1>Test Page</h1>
      <img src="https://cdn.discordapp.com/avatars/243118320981639169/10f0478f7765ff1b5a4e487c80f02b8d.png" alt="Placeholder" />
      <p>This is a test page to verify routing and component rendering.</p>
      <button type="button" onClick={handleClick}>Test Button</button>
    </div>
  );
}
export default TestPage;