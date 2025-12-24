import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Auth0Provider } from "@auth0/auth0-react";

import ProtectedRoute from "./auth/ProtectedRoute";
import Home from "./views/home";
import Import from "./components/csv-pdf-upload";
import { TransactionsProvider } from "./state/TransactionsContext";

import "bootstrap/dist/css/bootstrap.min.css";

const ProtectedHome = ProtectedRoute(Home);
const ProtectedImport = ProtectedRoute(Import);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Auth0Provider
      domain={import.meta.env.VITE_AUTH0_DOMAIN}
      clientId={import.meta.env.VITE_AUTH0_CLIENT_ID}
      authorizationParams={{
        redirect_uri: window.location.origin,
        audience: import.meta.env.VITE_AUTH0_AUDIENCE,
        scope: 'openid profile email'
      }}
    >
      <TransactionsProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<ProtectedHome />} />
            <Route path="/import" element={<ProtectedImport />} />
          </Routes>
        </BrowserRouter>
      </TransactionsProvider>
    </Auth0Provider>
  </React.StrictMode>
);
