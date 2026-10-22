# Meghalaya Together · 24–29 October 2026

A mobile-friendly GitHub Pages PWA for two travellers. Includes your **actual three Airbnb stays**, flexible six-day plan, offbeat places, individual **M/B packing checkmarks**, expenses, notes, and backups. Optional **Supabase** login and sync makes it shareable in real time. The website contains the original trip plan and publicly available listing URLs: **never put private reservation codes, home addresses, PINs or passwords in the public repo.** Host details typed later in the app are stored in your local browser and, when signed in, protected Supabase tables.

## Quick setup — publish and connect

### 1. Create Supabase project (required only for sharing/sync)

1. Visit [supabase.com/dashboard](https://supabase.com/dashboard) and create a project.
2. Open **SQL Editor**. Paste and run [supabase/schema.sql](supabase/schema.sql) **once**. It creates trip, member and key/value tables, RLS policies, and secure `create_trip` / `join_trip` RPCs.
3. Go to **Project Settings → API Keys** (the location might be labelled "Connect" or "API" in newer dashboards). Copy the **Project URL** and the **publishable key** (`sb_publishable_...`) or legacy anon key. **Never use a secret/service_role key in browser files.**
4. Edit [config.js](config.js):
   ```js
   window.MEGHALAYA_CLOUD = {
     url: 'https://YOUR-PROJECT.supabase.co',
     publishableKey: 'sb_publishable_...'
   };
   ```
5. In **Authentication → Providers → Email**, enable email authentication and magic-link sign-in. In **Authentication → URL Configuration**, set your deployed URL in **Site URL** and **Redirect URLs**, including the trailing slash, e.g. `https://USERNAME.github.io/meghalaya-together/`.
6. Supabase's default email service has limits, so ensure both of your login emails actually arrive. If not, configure a supported custom SMTP provider in Supabase.

### 2. Deploy to GitHub Pages

1. On GitHub, create a **public repository** named `meghalaya-together` (or any name you want).
2. Upload **the contents of this ZIP**, not the ZIP itself, to the repository root. Keep `index.html`, `cloud.js`, `config.js`, `sw.js`, `manifest.webmanifest`, `icon.svg` and the `supabase/` folder.
3. In the repository, open **Settings → Pages → Build and deployment → Deploy from a branch → main → /(root) → Save**.
4. Open `https://USERNAME.github.io/meghalaya-together/` using your actual GitHub username/repo name. Update the Supabase Auth redirect settings to match the final URL.
5. On phone, use your browser's **Add to Home Screen** feature. It installs like a simple app; it requires HTTPS for the service worker. Safari PWA support varies by iOS version.

> **Static-only mode:** If `config.js` remains blank, the dashboard still works locally and supports JSON backups. Only cloud sign-in/sync requires Supabase.

### 3. Share with your partner

1. On the first phone, open **Together · Sync** → **Send magic link**. Open the email on that same phone/browser.
2. Return to the app and choose **Create shared trip**.
3. Press **Copy invitation link** and privately send it to your partner. The invitation is a secret UUID; only the first two authenticated users (including creator) can join.
4. Your partner opens the link, signs in with **their own email**, and selects **Join shared trip**. If the code wasn't retained, paste the UUID from the invitation URL.
5. Packing checkmarks, itinerary changes, places, budgets, stay notes and expenses now sync between signed-in devices. Use **Sync now** or **Refresh** if mobile connectivity is flaky.

### 4. Import your earlier dashboard data (optional)

The updated app starts from the same itinerary and packing list as your previous single-file dashboard. If you already made edits, use **Together → Upload original local edits** after creating/joining a trip, or use **Backup → Import shared backup**. **Warning:** importing may overwrite your partner's edits to the *same* items. Export backups first.

## Offline behaviour & limitations

- The app caches its shell after the first successful HTTPS load, keeps local browser saves, and queues per-item changes while offline. Reconnect to upload. The Supabase library is also cached after it has been loaded online.
- **Two edits to different items** do not overwrite each other. **Two simultaneous edits to the same field** are last-server-write-wins; there is no multi-user text collaborative editor or conflict resolution UI.
- Travel map links open externally and need internet; don't assume live venue hours or swimming access. The itinerary intentionally labels uncertain details.
- The first offline load must happen **after** opening the page online and allowing its resources to cache. Browser storage can be cleared or evicted by the OS, so download periodic JSON backups.
- The public repo contains static planned activities and listing links; the logged-in trip data is protected by Supabase RLS. Anyone who obtains the **private invitation link** before your partner joins could use the second seat. Send it privately.
- If the two-person sync is too much setup, you can use the static PWA with manual JSON backup exchange instead.

## What exactly is stored where?

| Data | Local browser | Supabase after sign-in | In public repository |
|---|---|---|---|
| Original trip plan and place descriptions | Yes | Only your edits | **Yes** |
| Individual M/B packing progress | Yes | Yes | No |
| New expenses, notes, host contacts, map pins | Yes | Yes | No |
| Login session | Yes, managed by Supabase Auth | Supabase Auth | No |
| Project URL + publishable key | Yes | N/A | Yes in `config.js` (safe with RLS) |

## Maintenance & security

- If changing `sw.js` caching logic or site assets, bump `CACHE_NAME` (for example, `meghalaya-together-v2`) so installed apps refresh reliably.
- Change the Supabase URL or publishable key in `config.js` and push the change to GitHub. Reload both phones after redeploy.
- Keep Supabase RLS enabled. Do not share the `service_role` key. The SQL file is designed for a fresh project and not a general multi-tenant platform.
- To remove access after a trip, use Supabase SQL Editor or project dashboard to delete member access or retire the project. There is no member-removal button in this minimal two-person app.

## Relevant documentation

- [GitHub Pages: configure publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [Supabase JS browser client](https://supabase.com/docs/reference/javascript/installing)
- [Supabase magic-link auth](https://supabase.com/docs/reference/javascript/auth-signinwithotp)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
