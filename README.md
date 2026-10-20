# Wrist Check

Personal watch collection + daily wear log. Next.js 16 (App Router) · Tailwind 4 · Supabase · Vercel.

## Structure
```
supabase/migrations/      SQL schema, RLS, storage bucket, signup seeding
src/proxy.ts              session refresh + redirect to /login (Next 16 "proxy" = old middleware)
src/lib/core/             portable TS (types, queries, date helpers) — reusable in an Expo app
src/lib/supabase/         browser + server Supabase clients
src/lib/server/           server-only loaders
src/app/(app)/            screens: / (Today), /day/[date], /calendar, /collection, /watch/*, /stats, /settings
src/components/           UI (ui/ = shadcn-style primitives)
public/sw.js, app/manifest.ts   PWA
```

## Data rules
- Every table has `user_id default auth.uid()` + RLS "own rows only".
- Photos: private bucket `watch-photos`, path `<user_id>/<watch_id>/<uuid>.jpg`, served via signed URLs.
- Sign-ups are restricted to emails in `public.allowed_emails`.
- First sign-up seeds default occasions + sample data (tagged `[sample]`, removable in Settings).

## Local dev
```
npm install
cp .env.example .env.local
npm run dev
```

## Regenerate DB types
`npx supabase gen types typescript --project-id craagbowsbjcqeizgjxe > src/lib/core/database.types.ts`
(the checked-in file is a trimmed version; the generated one works as a drop-in.)
