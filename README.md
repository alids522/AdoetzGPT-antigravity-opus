<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/67f9d276-04a3-4908-841c-a80826aee6f4

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Optional fallback: set `GEMINI_API_KEY` in `.env` or `.env.local`. A Gemini key saved in the Preferences page takes priority.
3. Run the app:
   `npm run dev`

The dev server listens on `0.0.0.0:3000`, so devices on the same LAN can open `http://<this-computer-lan-ip>:3000`.

Shared app data is saved to `data/app-state.json` by default. Override that path with `APP_DB_PATH` if you want the JSON database somewhere else.

## Accounts And Postgres Sync

AdoetzGPT includes sign up and login screens. When Postgres sync is enabled, app state is stored per signed-in username through the sync API.
Signed-in sessions are persisted on-device and server tokens last up to 365 days.

You can enter Postgres connection details directly on the login/sign up screen or later in Preferences:

- Database URL: Postgres host, or a full `postgres://` / `postgresql://` URL
- Database
- Database schema
- User
- Password
- Custom database port, blank uses `5432`

The sync API server uses those values per request, so `DATABASE_URL` is optional. Keep `.env` support only as a fallback:

```bash
AUTH_SECRET=replace-with-a-long-random-secret
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DATABASE
POSTGRES_SCHEMA=adoetzgpt
```

The server creates the required schema automatically. The SQL is also available in [docs/postgres-schema.sql](docs/postgres-schema.sql), and at runtime from `/api/postgres/schema.sql?schema=adoetzgpt`.

For local web testing, run `npm run dev` so the API routes exist. If you run only the Vite frontend, `/api/auth/signup` will return 404 because there is no Express API server behind it.

## Android App: AdoetzGPT

This repo includes a standalone Capacitor Android app in `android/`.

Local Android Studio is not required for builds. Push the repo to GitHub and run the `Android Build` workflow from the Actions tab. The workflow installs npm dependencies, builds the web app, syncs Capacitor, builds a debug APK/AAB with Gradle on GitHub-hosted runners, and uploads both artifacts.

Useful local commands if you only want to update the Android project files:

```bash
npm run android:sync
```

Android app details:

- App id: `com.adoetz.gpt`
- App name: `AdoetzGPT`
- Icon and splash assets are generated from `app logo.png`
- Native app persistence uses Capacitor Preferences on-device
- Browser development keeps the existing local API/localStorage fallback
- Live conversation starts an Android foreground microphone service with a persistent notification while Live mode is active

Required Android permissions are declared in `android/app/src/main/AndroidManifest.xml`: internet, microphone, foreground service, foreground service microphone, wake lock, notification posting, and audio settings.
