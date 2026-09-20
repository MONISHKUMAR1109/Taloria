# Deploying TALORIA (free tier)

One service hosts everything: the Express API **and** the built React SPA
(same origin keeps the httpOnly refresh-token cookie working).

Stack: Render (free web service) + Neon (free Postgres).

## 1. Create the database on Neon

1. Sign up at https://neon.tech (free, no card).
2. Create a project, note the **region** you pick.
3. Grab the **connection string** (`postgresql://user:password@host/dbname?sslmode=require`).

> Keep your TALORIA region near the Neon region for lower latency.

## 2. Provision the database (run once, from this repo)

Put the connection string in `backend/.env` as `DATABASE_URL`, then:

```bash
npm run db:setup   # applies schema.sql + seeds demo data
npm run test:int   # integration suite against the live DB
```

`test:local` unit tests don't need any database.

## 3. Create the web service on Render

1. https://dashboard.render.com/new/web (connect your GitHub account first).
2. Pick the **Taloria** repo, branch `main`.
3. Leave root directory as `/`.
4. Set:
   - **Build command**: `npm install && npm --prefix backend install && npm --prefix frontend install && npm --prefix frontend run build`
   - **Start command**: `npm start`
5. Add env vars:
   - `NODE_ENV=production`
   - `JWT_SECRET` (Render: Generate)
   - `DATABASE_URL` (paste the Neon string from step 1)
6. Free instance, create service. Wait for **Deployed** + green health check (`/health`).

> Alternatively use the `render.yaml` blueprint at the repo root (Blueprints →
> New Blueprint Instance). If you do, still replace the placeholder
> `DATABASE_URL` in Service → Environment afterwards.

## 4. Demo accounts

| Role      | Email                    | Password      |
| --------- | ------------------------ | ------------- |
| Athlete   | `athlete1@taloria.demo`  | `Password123!`|
| Organizer | `org1@taloria.demo`      | `Password123!`|

Registration is open, so anyone can also sign up as a scout/organizer/sponsor.
E-mail verification emails are **printed to the Render logs** (no SMTP yet),
so a verify link sent to a brand-new account appears there.

## Notes

- Free Render instances sleep after ~15 min of inactivity; first visit is slow.
- Uploads live on the instance disk (ephemeral, reset on redeploys) in the demo.
- Seeding is idempotent (`ON CONFLICT DO NOTHING` based) and safe to re-run.