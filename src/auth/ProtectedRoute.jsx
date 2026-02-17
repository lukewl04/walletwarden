import { withAuthenticationRequired, useAuth0 } from "@auth0/auth0-react";

function AuthErrorBoundary({ children }) {
  const { error, logout } = useAuth0();

  if (error) {
    return (
      <div className="container py-5">
        <div className="alert alert-danger">
          <h5>Authentication Error</h5>
          <p>{error.message}</p>
          <button
            className="btn btn-primary"
            onClick={() => {
              // Clear all auth state then do a proper Auth0 logout
              localStorage.clear();
              logout({ logoutParams: { returnTo: window.location.origin } });
            }}
          >
            Sign In Again
          </button>
        </div>
      </div>
    );
  }
  return children;
}

export default function ProtectedRoute(Component) {
  const Wrapped = withAuthenticationRequired(Component, {
    onRedirecting: () => (
      <div className="container py-5">
        <div className="alert alert-info mb-0">
          Signing you in…
        </div>
      </div>
    ),
  });

  // Wrap with error boundary so auth errors don't cause redirect loops
  return function ProtectedWithErrorHandling(props) {
    return (
      <AuthErrorBoundary>
        <Wrapped {...props} />
      </AuthErrorBoundary>
    );
  };
}
