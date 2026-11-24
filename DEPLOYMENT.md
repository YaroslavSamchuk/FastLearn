# Production deployment

The Cloudflare Worker hosts the API and MongoDB connection. The Pages Functions route forwards `/api/*` to that Worker so each site keeps its own first-party session cookie.

## Google OAuth

Add both exact redirect URIs to the Google OAuth web client:

```text
https://fastlearn.pages.dev/api/auth/google/callback
https://fastlearn.samchukyaroslav.workers.dev/api/auth/google/callback
```

The sign-in route always requests `prompt=select_account`. The Worker validates the OAuth state and only accepts these two production origins.

## Worker secrets

Set these as Cloudflare Worker secrets. Enter each value when Wrangler prompts; do not put the values in frontend variables or commit them:

```powershell
npx wrangler secret put MONGODB_URI
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

`DB_NAME` is configured as a non-secret Worker variable in `wrangler.toml`.

## Sign-in configuration errors

If `/api/auth/google/start` returns `WORKER_CONFIG_MISSING`, its JSON response lists the missing runtime variables without exposing their values. Add them under the Worker’s **Settings → Variables and secrets** for **Production**, not under **Builds**, then deploy a new Worker version.

## Deploy order

Build and deploy the API Worker first, so it has its MongoDB Durable Object binding:

```powershell
npm run build
npm run worker:deploy
```

Then deploy the Pages site with the `FASTLEARN_API` service binding:

```powershell
npm run pages:deploy
```

The Pages project must be named `fastlearn`, and the Cloudflare account must allow the Pages service binding to the `fastlearn` Worker.

## Local Cloudflare development

Run the Worker and Pages Functions in separate terminals:

```powershell
npm run worker:dev
npm run pages:dev
```

For OAuth tests, also add the exact local callback URI displayed by the local Pages development server to the Google OAuth client. Local Worker environment values can be supplied through Wrangler's local secrets mechanism; do not reuse production credentials in committed files.
