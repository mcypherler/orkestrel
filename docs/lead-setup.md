# Orkestrel prototype — lead setup checklist

Follow in order. Give Claude Code variable **names**, never credentials in chat, source control, screenshots or tickets.

## A. Create the accounts

### 1. Vercel and database

1. Create or choose the Git repository for Orkestrel.
2. In [Vercel](https://vercel.com/), create a project by importing that repository.
3. Add a managed Postgres database through the Vercel Marketplace (for example Neon or Supabase), connect it to the project, and note the environment variable it creates. Prefer `DATABASE_URL`; map the provider's generated variable in server code if its name differs.
4. Record the final production domain, for example `https://orkestrel.example.com`.

Vercel variables have separate Development, Preview and Production scopes, and changes apply only to new deployments. See [Vercel environment variables](https://vercel.com/docs/environment-variables).

### 2. Ticketmaster

1. Create a [Ticketmaster developer account](https://developer.ticketmaster.com/).
2. Create an application and copy its **Consumer Key**. Use this as `TICKETMASTER_API_KEY`.
3. Test the key in Ticketmaster's Discovery API Explorer or with one GB music-event query.
4. Do not request Partner/Commerce access for the first prototype.

The public Discovery API authenticates using the API key query parameter; see its [official reference](https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/).

### 3. Spotify

1. Sign in to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard). The owner of a Development Mode app currently needs Spotify Premium.
2. Create one app named `Orkestrel Prototype`; select Web API.
3. Copy the Client ID and Client Secret.
4. In app settings, add exact redirect URIs:
   - local: `http://127.0.0.1:3000/api/auth/spotify/callback`
   - production: `https://YOUR-PRODUCTION-DOMAIN/api/auth/spotify/callback`
5. Under Users Management, allowlist each family tester by their Spotify account email. Development Mode currently permits up to five authenticated users.

Spotify requires an exact redirect match, HTTPS outside loopback development, and does not allow `localhost`; see [redirect URI rules](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri) and [quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes).

Do not use changing Vercel deployment URLs as Spotify callbacks. Either give Preview one stable registered domain/callback, or disable Spotify connection on ad-hoc Preview deployments.

### 4. Twilio WhatsApp Sandbox

1. Create a [Twilio account](https://www.twilio.com/try-twilio).
2. In Console, open Messaging → Try it out → Send a WhatsApp message and activate the Sandbox.
3. Jo scans the QR code or sends `join <sandbox code>` from the WhatsApp number that will receive test alerts.
4. Copy the Account SID, Auth Token and sandbox sender shown by Twilio.
5. During development, use the sandbox's permitted messages. For realistic proactive alerts, keep console-preview mode available because sandbox custom templates are not supported.
6. When a deployment exists, set the sandbox inbound webhook to `https://YOUR-DOMAIN/api/webhooks/twilio/whatsapp` and the status callback to `https://YOUR-DOMAIN/api/webhooks/twilio/status`.

The recipient must join the sandbox; free-form messaging is limited to the 24-hour window after an inbound message. See [Twilio's sandbox instructions](https://www.twilio.com/docs/whatsapp/sandbox).

## B. Create secrets

Generate three independent random values with a password manager or approved secret generator:

- `SESSION_SECRET`: at least 32 random bytes/characters (used to sign application sessions and OAuth state).
- `TOKEN_ENCRYPTION_KEY`: 32 random bytes, encoded as base64 (used to encrypt OAuth tokens at rest).
- `CRON_SECRET`: at least 32 random bytes/characters (used to authenticate scheduled job requests).

Do not reuse a password or any provider credential.

## C. Required Vercel variables

In Vercel: Project → Settings → Environment Variables. Add each variable to Development, Preview and Production unless the value column says otherwise. Use different recipient/messaging values in Preview when possible.

| Variable | Value / purpose | Secret? |
|---|---|---:|
| `APP_URL` | Production: `https://YOUR-DOMAIN`; local override uses `http://127.0.0.1:3000` | No |
| `DATABASE_URL` | Postgres connection string created by the database integration | Yes |
| `SESSION_SECRET` | Long independent random secret for sessions and OAuth state | Yes |
| `TOKEN_ENCRYPTION_KEY` | Base64-encoded 32-byte key | Yes |
| `CRON_SECRET` | Long independent random secret | Yes |
| `TICKETMASTER_API_KEY` | Ticketmaster Consumer Key | Yes |
| `EVENT_SOURCE_MODE` | `hybrid` for Preview; `ticketmaster` for real production alerts | No |
| `SPOTIFY_CLIENT_ID` | Spotify app Client ID | No |
| `SPOTIFY_CLIENT_SECRET` | Spotify app Client Secret | Yes |
| `SPOTIFY_REDIRECT_URI` | Exact environment callback URI | No |
| `SPOTIFY_SCOPES` | `user-top-read user-read-recently-played` | No |
| `WHATSAPP_PROVIDER` | `console` initially; `twilio` when sandbox is ready | No |
| `TWILIO_ACCOUNT_SID` | Twilio Account SID | Yes |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token | Yes |
| `TWILIO_WHATSAPP_FROM` | Sandbox value such as `whatsapp:+...` | No |
| `WHATSAPP_RECIPIENT` | Jo's opted-in number as `whatsapp:+44...` | Personal |
| `TWILIO_CONTENT_SID` | Approved production template SID; omit for console/sandbox demo | No |
| `ALERTS_ENABLED` | `false` until an end-to-end preview is approved | No |
| `MOCK_DATA_ENABLED` | `true` only in local/Preview; `false` in Production | No |

If Meta Cloud API is chosen later, replace the Twilio-specific variables behind the provider interface with `META_WHATSAPP_ACCESS_TOKEN`, `META_WHATSAPP_PHONE_NUMBER_ID`, `META_WHATSAPP_VERIFY_TOKEN` and the approved template name. Do not configure both providers as active.

After editing variables, redeploy: Vercel does not apply new values to an already-created deployment.

## D. Local `.env.local`

1. Ensure `.env*` is ignored by Git, except a safe `.env.example` containing blank placeholders.
2. Install the [Vercel CLI](https://vercel.com/docs/cli), sign in and link the local folder to the project.
3. Pull only the Development values:

```powershell
vercel link
vercel env pull .env.local --environment=development
```

Vercel documents `vercel env pull` for exporting Development variables. Re-run it after any dashboard change; see the [CLI environment guide](https://vercel.com/docs/cli/env).

4. In `.env.local`, override the two local URL values:

```dotenv
APP_URL=http://127.0.0.1:3000
SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000/api/auth/spotify/callback
WHATSAPP_PROVIDER=console
ALERTS_ENABLED=false
MOCK_DATA_ENABLED=true
EVENT_SOURCE_MODE=hybrid
```

5. Never copy Production secrets into `.env.local`. Never commit `.env.local`. If it is exposed, rotate the affected credential immediately rather than merely deleting the file.

## E. Safe activation sequence

1. Deploy with `WHATSAPP_PROVIDER=console`, `ALERTS_ENABLED=false`, `MOCK_DATA_ENABLED=true`.
2. Connect the allowlisted Spotify account and confirm imported artists can be edited.
3. Run one manual event poll; inspect normalized live and mock events.
4. Preview the exact Harry Styles alert. Confirm mock data is labelled and cannot be mistaken for purchasable stock.
5. Activate Twilio sandbox, keep `ALERTS_ENABLED=false`, and send one explicit test message.
6. Set `ALERTS_ENABLED=true` only after Jo confirms opt-in, recipient, wording and frequency.
7. Before Production, set `MOCK_DATA_ENABLED=false` and `EVENT_SOURCE_MODE=ticketmaster`, then redeploy.
8. Keep a visible kill switch: changing `ALERTS_ENABLED=false` and redeploying must stop all outbound sends.

## F. Lead sign-off before a family test

- [ ] Spotify account is allowlisted and callback works.
- [ ] Jo explicitly opted in to WhatsApp alerts.
- [ ] Ticket links use the provider's official URL.
- [ ] Unknown price says “check seller”; no unverified “great view” claim appears.
- [ ] Mock events are labelled and blocked from Production alerts.
- [ ] No secrets or phone numbers appear in source control or logs.
- [ ] Duplicate polling does not duplicate an alert.
- [ ] `ALERTS_ENABLED=false` stops messages.
- [ ] Disconnect/delete controls work for Spotify data and tokens.

