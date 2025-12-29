import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Auth0Provider } from "@auth0/auth0-react";

import ProtectedRoute from "./auth/ProtectedRoute";
import Home from "./views/home";
import Import from "./components/csv-pdf-upload";
import SplitMaker from "./views/splitmaker";
import { TransactionsProvider } from "./state/TransactionsContext";
import WardenInsights from "./views/wardenInsights";
import Tracker from "./views/tracker";
import "bootstrap/dist/css/bootstrap.min.css";

const ProtectedHome = ProtectedRoute(Home);
const ProtectedImport = ProtectedRoute(Import);
const ProtectedSplit = ProtectedRoute(SplitMaker);
const ProtectedWardenInsights = ProtectedRoute(WardenInsights);
const ProtectedTracker = ProtectedRoute(Tracker);
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
      // Persist tokens across reloads: use refresh tokens with localStorage cache.
      // Note: storing tokens in localStorage has security tradeoffs (XSS risk).
      useRefreshTokens={true}
      cacheLocation="localstorage"
    >
      <TransactionsProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<ProtectedHome />} />
            <Route path="/import" element={<ProtectedImport />} />
            <Route path="/splitmaker" element={<ProtectedSplit />} />
            <Route path="/wardeninsights" element={<ProtectedWardenInsights />} />
            <Route path="/tracker" element={<ProtectedTracker />} />
          </Routes>
        </BrowserRouter>
      </TransactionsProvider>
    </Auth0Provider>
  </React.StrictMode>
);
