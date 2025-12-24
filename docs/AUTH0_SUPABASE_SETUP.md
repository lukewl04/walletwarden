Quick setup: Auth0 + Supabase (backend + frontend)

1) Create an API in Auth0
- Go to Auth0 Dashboard → APIs → Create API
- Identifier: e.g. `https://walletwarden/api` (this will be your AUTH0_AUDIENCE)
- Signing Algorithm: RS256

2) Create an SPA application in Auth0
- Add Allowed Callback URLs: `http://localhost:5173`
- Add Allowed Logout URLs and Allowed Web Origins: `http://localhost:5173`

3) Backend env (.env in backend/):
- DATABASE_URL=postgres://... (from Supabase)
- AUTH0_ISSUER_BASE_URL=https://<your-auth0-domain>
- AUTH0_AUDIENCE=https://walletwarden/api
- FRONTEND_ORIGIN=http://localhost:5173

4) Frontend env (.env):
- VITE_AUTH0_DOMAIN=<your-auth0-domain>
- VITE_AUTH0_CLIENT_ID=<your-client-id>
- VITE_AUTH0_AUDIENCE=https://walletwarden/api
- VITE_API_URL=http://localhost:4000

5) Install backend deps in `backend/`:
```
cd backend
npm install express cors dotenv pg express-jwt jwks-rsa
```

6) Start backend & frontend:
- Start backend: `node backend/index.js`
- Start frontend: `npm run dev`

7) Test flow:
- Log in in the SPA
- The client will request an access token for the configured audience
- The backend validates the access token via JWKS
- Persisted transactions are scoped to `user_id = auth0 sub`

Notes & troubleshooting
- If tokens are not issued with your audience, ensure the audience is configured in the SPA app or passed as `authorizationParams.audience` to the `Auth0Provider`.
- Check backend logs for `Could not fetch backend transactions` or `401` errors if the token is missing/invalid.
- For development, you can also inspect tokens with jwt.io to check the audience/issuer claims.