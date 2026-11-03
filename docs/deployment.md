# Deploying HugotFlow (free tiers only)

This deployment is for the proposal and testing stage (system testing and UAT). Everything runs on free plans; no
credit card or paid account is needed.

| Part | Where | Free-tier limit to know |
|---|---|---|
| Database, login, file storage, background jobs | Supabase project `fexadquqrdwjakbzhnow` | Pauses after 7 days with no activity. Resume it from the Supabase dashboard (one click). 500 MB database, 1 GB storage |
| Web console (owner + front desk on the gym laptop) and web app for iPhone users | Render static site `hugotflow-web` | None that matters for one gym |
| C4.5 recommendation engine | Render web service `hugotflow-recommender` | Sleeps after 15 min idle; the first plan after that takes about 30–60 s |
| Android app (members, instructors) | APK built with EAS (Expo) | About 15 Android builds a month on the free plan |
| Code | GitHub `GerryInTheBlock/hugotflow` | None |

Not used because they cost money: Apple Developer, Google Play, paid plans, custom domains.

## Keys: what goes where
| Key | Public? | Where it is set |
|---|---|---|
| Supabase URL | Yes | Render `hugotflow-web` and `hugotflow-recommender`, EAS environment, `client/.env` |
| Supabase **publishable** key (`sb_publishable_…`) | Yes (RLS protects the data) | Render `hugotflow-web`, EAS environment, `client/.env` |
| Supabase **secret / service role** key | **No** | Only Render `hugotflow-recommender` → Environment, and `services/recommender/.env` on your laptop. Never in the repo, the app or chat |

The secret key was once pasted in chat, so **rotate it before the first deploy**: Supabase → Project Settings → API Keys →
create a new secret key, delete the old one, then update `services/recommender/.env`.

## 1. Render (web console + engine)
1. Push the repo to GitHub (as GerryInTheBlock).
2. Sign up at render.com (free, GitHub login is fine). New → **Blueprint** → pick `GerryInTheBlock/hugotflow`.
   Render reads `render.yaml` and creates both services on the free plan.
3. It asks once for the values marked `sync: false`:
   - `hugotflow-recommender`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (the new secret key)
   - `hugotflow-web`: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (publishable key)
   The two services find each other automatically (`fromService` in `render.yaml`).
4. Check: `https://hugotflow-recommender.onrender.com/health` answers `{"status":"ok"}`, and the web console opens at
   `https://hugotflow-web.onrender.com`. Render may add a suffix to the names if they are taken; use the URLs it shows.
5. Supabase → Authentication → URL Configuration: set **Site URL** to the web console URL and add it to
   **Redirect URLs** (needed for password-reset links).
6. On the gym laptop, open the web console once while online and install it (browser menu → Install app) so the
   Check-In Terminal works offline.

Every push to `main` redeploys both services.

## 2. Android APK (EAS)
1. Create a free account at expo.dev.
2. In `client/`, run `npx eas login` yourself (your password is never typed by anyone else), then `npx eas init` once
   to link the project.
3. Store the public values as EAS environment variables for the `preview` environment:
   `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_RECOMMENDER_URL` (the Render engine URL).
4. Build: `npx eas build -p android --profile preview`. When it finishes, EAS shows an install link and QR code.
   Share it with testers; Android asks them to allow installing from this source.
5. iPhone testers open the web console URL in Safari and use Share → Add to Home Screen.

## 3. Redeploying
- Database: new files in `supabase/migrations/` are applied to Supabase (after review) and committed.
- Web + engine: push to `main`.
- Android: run the EAS build again and share the new link (the app version is in `client/app.json`).

## Current deployment (3 Nov 2026)
| Part | Link |
|---|---|
| Web console + iPhone web app | https://hugotflow-web.onrender.com |
| C4.5 engine | https://hugotflow-recommender.onrender.com (`/health`) |
| Android APK, version 0.1.0 (build 1) | https://expo.dev/accounts/gerrytapuyo/projects/hugotflow/builds/7b3a27b0-740b-4894-8934-4c6727d7cf74 |
