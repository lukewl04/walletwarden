import React from "react";
import ReactDOM from "react-dom/client";
import "bootstrap/dist/css/bootstrap.min.css";
import "./index.css";
import "./App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Auth0Provider } from "@auth0/auth0-react";

const isDevMode = import.meta.env.VITE_DEV_MODE === 'true';

import ProtectedRoute from "./auth/ProtectedRoute";
import AuthSync from "./auth/AuthSync";
import Home from "./views/home";
import Import from "./components/csv-pdf-upload";
import SplitMaker from "./views/splitmaker";
import { TransactionsProvider } from "./state/TransactionsContext";
import { EntitlementsProvider } from "./state/EntitlementsContext";
import WardenInsights from "./views/wardenInsights";
import WardenInsightsCustomize from "./views/WardenInsightsCustomize";
import Tracker from "./views/tracker";
import Pricing from "./views/Pricing";
import BillingSuccess from "./views/BillingSuccess";
import AdminDashboard from "./views/AdminDashboard";

import Options from "./views/options";

const ProtectedHome = ProtectedRoute(Home);
const ProtectedImport = ProtectedRoute(Import);
const ProtectedSplit = ProtectedRoute(SplitMaker);
const ProtectedWardenInsights = ProtectedRoute(WardenInsights);
const ProtectedWardenInsightsCustomize = ProtectedRoute(WardenInsightsCustomize);
const ProtectedTracker = ProtectedRoute(Tracker);
const ProtectedPricing = ProtectedRoute(Pricing);
const ProtectedBillingSuccess = ProtectedRoute(BillingSuccess);
const ProtectedAdminDashboard = ProtectedRoute(AdminDashboard);

const ProtectedOptions = ProtectedRoute(Options);

// Clean up Auth0 callback params from URL after login redirect
function onRedirectCallback(appState) {
  window.history.replaceState(
    {},
    document.title,
    appState?.returnTo || window.location.pathname
  );
}

// The app shell — routes wrapped in providers
const AppRoutes = (
  <AuthSync>
    <TransactionsProvider>
      <EntitlementsProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<ProtectedHome />} />
            <Route path="/import" element={<ProtectedImport />} />
            <Route path="/splitmaker" element={<ProtectedSplit />} />
            <Route path="/wardeninsights" element={<ProtectedWardenInsights />} />
            <Route path="/insights/customize" element={<ProtectedWardenInsightsCustomize />} />
            <Route path="/tracker" element={<ProtectedTracker />} />
            <Route path="/pricing" element={<ProtectedPricing />} />
            <Route path="/billing/success" element={<ProtectedBillingSuccess />} />
            <Route path="/admin" element={<ProtectedAdminDashboard />} />
            <Route path="/options" element={<ProtectedOptions />} />
          </Routes>
        </BrowserRouter>
      </EntitlementsProvider>
    </TransactionsProvider>
  </AuthSync>
);

ReactDOM.createRoot(document.getElementById("root")).render(
  // Auth0Provider always wraps so useAuth0() hooks don't crash,
  // but ProtectedRoute skips login enforcement when VITE_DEV_MODE=true
  <Auth0Provider
    domain={import.meta.env.VITE_AUTH0_DOMAIN || 'placeholder.auth0.com'}
    clientId={import.meta.env.VITE_AUTH0_CLIENT_ID || 'placeholder'}
    authorizationParams={{
      redirect_uri: window.location.origin,
      audience: import.meta.env.VITE_AUTH0_AUDIENCE,
      scope: 'openid profile email'
    }}
    onRedirectCallback={onRedirectCallback}
    useRefreshTokens={!isDevMode}
    cacheLocation="localstorage"
  >
    {AppRoutes}
  </Auth0Provider>
);
