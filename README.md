# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.


## Environment bootstrap (optional)

If you are working in a fresh container/codespace and need private registry/git credentials, run:

```sh
./scripts/setup-env.sh
```

This interactive script can:
- configure `~/.npmrc` with an npm auth token,
- configure git credential storage with a GitHub PAT,
- optionally run `npm install`.

It writes credentials to your home directory and does not commit secrets to this repository.

## Frontend environment variables

Copy `.env.example` to `.env` and set values for your Supabase project:

```sh
cp .env.example .env
```

`VITE_ENABLE_DEV_SWITCHER` defaults to `false` and should stay `false` outside local development.
If you set it to `true`, also enable the Supabase edge function switch (`ENABLE_DEV_LOGIN=true`) and configure `DEV_LOGIN_TEST_PASSWORD` in edge-function secrets.
By default, if Supabase env vars are missing the app falls back to the project's default Supabase credentials.
Set `VITE_REQUIRE_SUPABASE_ENV="true"` to enforce strict fail-fast behavior in controlled environments.
Set `VITE_ENABLE_OPERATIONAL_REMINDERS="false"` to disable Mission Control reminder queries in environments where workflow tables are not provisioned.
Set `VITE_ENABLE_OPERATIONAL_ALERTS="true"` only when the `operational-alerts` edge function is deployed and configured.

Invoice records support `invoices.pdf_storage_path` as the source-of-truth object path; if empty, the system defaults to `clients/<client_id>/<invoice_number>.pdf`.

Edge function environment:

- `INVOICE_PDF_BUCKET` (optional, defaults to `invoice-pdfs`) for invoice artifact upload + signed URL generation.
- `SLACK_WEBHOOK_URL` (optional) for critical operational alert notifications.
- `OPS_ALERT_EMAILS` (optional CSV list) for email alert recipients.
- `OPS_ALERT_FROM_EMAIL` (optional) sender used by operational alerts when email is configured.
- `PORTAL_ONBOARDING_EMAIL_FROM` (optional) sender used for wholesale onboarding email.
- `PORTAL_APP_URL` (optional) sign-in URL used in wholesale onboarding email body.
- `EMPLOYEE_ONBOARDING_EMAIL_FROM` (optional) sender used for employee onboarding email.
- `STAFF_APP_URL` (optional) sign-in URL used in employee onboarding email body.

Important: if sender addresses use `@resend.dev`, Resend stays in testing mode and only delivers to your account email.
To send emails to clients/employees, verify your domain in Resend and set all `*_FROM` secrets to that verified domain.

## Release runbook and smoke testing

- Runbook: `docs/release-runbook.md`
- Smoke script: `scripts/staging-smoke-test.sh`
- RLS scope script: `scripts/rls-scope-smoke-test.sh`
- Private beta readiness script: `scripts/private-beta-readiness.sh`
- Platform 1.0 assessment + roadmap: `docs/platform-1.0-roadmap.md`

Example usage:

```sh
export SUPABASE_URL="https://<project>.supabase.co"
export SUPABASE_ANON_KEY="<anon-key>"
export SMOKE_USER_EMAIL="staging-office@example.com"
export SMOKE_USER_PASSWORD="<password>"
export APP_BASE_URL="https://staging.example.com" # optional

./scripts/staging-smoke-test.sh
```

Role-scope smoke example:

```sh
export SUPABASE_URL="https://<project>.supabase.co"
export SUPABASE_ANON_KEY="<anon-key>"
export PORTAL_USER_EMAIL="portal-user@example.com"
export PORTAL_USER_PASSWORD="<password>"
export OFFICE_USER_EMAIL="office-user@example.com"
export OFFICE_USER_PASSWORD="<password>"
export DRIVER_USER_EMAIL="driver-user@example.com"
export DRIVER_USER_PASSWORD="<password>"
export EXPECTED_PORTAL_CLIENT_ID="<optional-client-id>"
export EXPECTED_DRIVER_USER_ID="<optional-driver-user-id>"

./scripts/rls-scope-smoke-test.sh
```

Optional role-scoped integration test (same environment variables as above):

```sh
npm run test -- src/test/role-scope.integration.test.ts
```

All-in-one private beta gate:

```sh
export SAMPLE_INVOICE_ID="<optional-invoice-id-for-pdf-smoke>"
./scripts/private-beta-readiness.sh
```

`private-beta-readiness.sh` is strict: it now requires all smoke-test environment variables and fails fast if any are missing.

Optional operational alert dry-run (office/admin token required):

```sh
curl -X POST "${SUPABASE_URL}/functions/v1/operational-alerts" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer <office-or-admin-access-token>" \
  -H "Content-Type: application/json" \
  -d '{"dry_run": true}'
```

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
