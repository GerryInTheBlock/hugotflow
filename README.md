# HugotFlow

Cross-Platform Gym Management with Workout Program Recommendation System Using C4.5 Decision Tree
Algorithm for Hugot Gym in Silang, Cavite. BSCS thesis, Cavite State University – Carmona Campus.

| Folder | What it is | Stack (Chapter 3, Materials) |
| --- | --- | --- |
| `client/` | One app for members and instructors (Android/iOS) and for owner/staff (web on the gym laptop) | React Native, Expo SDK 57, Expo Router, NativeWind 4 |
| `supabase/` | Database, Row Level Security, scheduled jobs, storage | Supabase (PostgreSQL, JWT auth, pg_cron) |
| `services/recommender/` | Workout recommendation service | Python 3.10+, FastAPI, scikit-learn, pandas, NumPy |
| `docs/` | Iteration notes and the paper-alignment checklist | |

## First-time setup (Windows)

1. **Database.** Create the Supabase project and run the seven files in `supabase/migrations` (see `supabase/README.md`).
2. **App.**
   ```powershell
   cd client
   powershell -ExecutionPolicy Bypass -File .\setup.ps1
   ```
   Open `client/.env` and paste the Supabase **Project URL** and **anon public key**.
   Never put the service_role key in the app.
3. **Run.**
   ```powershell
   npx expo start
   ```
   Press `w` for the web console. On a phone, scan the QR code with Expo Go (same Wi-Fi network).
4. **Roles.** Sign up the owner, staff and instructor accounts in the app, then set their roles once
   (SQL in `supabase/README.md`).

## Testing two roles at the same time

A browser keeps one login per web address, so open the same running app on two addresses:

| Window | Address | Sign in as |
| --- | --- | --- |
| Owner / staff console | `http://localhost:8081` | the owner or a staff account |
| Member app | `http://127.0.0.1:8081` | a member account (make the window phone-sized, e.g. DevTools device mode) |

Both talk to the same Supabase project, so a Day Pass requested in the member window appears in the
console's Day Pass requests, and a payment recorded in the console appears in the member's Membership.
For a third role (e.g. staff and owner together), use a private/incognito window, or Expo Go on a phone.

## Design

The colors, type and spacing come from the Figma file "UI", page **Dark theme · Hugot Gym**.
Tokens live in `client/src/theme/tokens.json`. Build screens from `client/src/components/ui.tsx`
so they stay consistent.

## Working rule

The approved Chapters 1–3 are the specification. Before each iteration review, run the checklist in
`docs/paper-alignment.md`.
