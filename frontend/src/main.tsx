import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { PortalAuthProvider } from "./portal/PortalAuthContext";
import { initTheme } from "./theme";
import "./styles.css";

initTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <PortalAuthProvider>
          <App />
        </PortalAuthProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
