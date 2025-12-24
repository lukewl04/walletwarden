Setup & running the backend (Supabase/Postgres + Auth0)

Required environment variables (create a `.env` in `backend/`):

- DATABASE_URL - your Postgres connection string (Supabase provides this)
- AUTH0_ISSUER_BASE_URL - e.g. `https://your-domain.auth0.com/`
- AUTH0_AUDIENCE - the identifier of the Auth0 API you create (e.g. `https://walletwarden/api`)
- FRONTEND_ORIGIN - optional (default `http://localhost:5173`)
- PORT - optional (default 4000)

Install dependencies:

```
npm install express cors dotenv pg express-jwt jwks-rsa
```

Start the server:

```
node index.js
```

What it does:
- On startup it creates a `transactions` table if missing.
- It exposes authenticated endpoints under `/api/transactions` (GET, POST, bulk POST, DELETE).
- It validates the incoming Access Token (Bearer) issued by Auth0 using JWKS.

Auth0 setup (high level):
1. Create an API in Auth0 dashboard and set the Identifier to something like `https://walletwarden/api`.
2. In your application settings, add that audience to the `authorizationParams` for the SDK (see `src/main.jsx`).
3. Ensure your frontend requests access tokens (the SDK will do this when `authorizationParams.audience` is set).
4. The backend expects tokens with that audience and issuer.

If you want, I can add a simple migration script or a small Docker setup to run Postgres locally for development.