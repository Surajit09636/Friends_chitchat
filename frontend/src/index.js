// React core and DOM renderer.
import React from "react";
import ReactDOM from "react-dom/client";
// Root application component.
import App from "./App";
// Global auth context provider.
import { AuthProvider } from "./auth/AuthContext";
// Global styles applied across the app.
import "./styles/global.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  // Provide authentication state to the entire app tree.
  <AuthProvider>
    {/* App routes and pages. */}
    <App />
  </AuthProvider>
);
