import { withAuthenticationRequired } from "@auth0/auth0-react";

export default function ProtectedRoute(Component) {
  return withAuthenticationRequired(Component, {
    onRedirecting: () => (
      <div className="container py-5">
        <div className="alert alert-info mb-0">
          Redirecting to login…
        </div>
      </div>
    ),
  });
}
