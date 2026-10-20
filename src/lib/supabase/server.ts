import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/core/database.types";

export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component: the proxy refreshes the session instead.
          }
        },
      },
    },
  );
}

/** Supabase client + verified user id; redirects to /login if signed out. */
export async function requireUser() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");
  return { supabase, userId };
}

/** Today's date (YYYY-MM-DD) in the user's timezone (cookie set by the client). */
export async function getToday() {
  const tz = (await cookies()).get("tz")?.value || "America/New_York";
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  }
}
