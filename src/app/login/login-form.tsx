"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

type Mode = "signin" | "signup" | "reset";

export function LoginForm({ initialError }: { initialError?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  const [info, setInfo] = useState<string>();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    setInfo(undefined);
    const sb = supabaseBrowser();
    const redirectTo = `${location.origin}/auth/callback`;
    try {
      if (mode === "signin") {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace("/");
        router.refresh();
      } else if (mode === "signup") {
        const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
        if (error) throw error;
        if (data.session) {
          router.replace("/");
          router.refresh();
        } else setInfo("Check your email for a confirmation link, then come back and sign in.");
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${redirectTo}?next=/settings` });
        if (error) throw error;
        setInfo("Reset link sent. After clicking it, set a new password in Settings.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.includes("Database error") ? "Sign-ups are closed right now." : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      {mode !== "reset" && (
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {info && <p className="text-sm text-primary">{info}</p>}
      <Button type="submit" className="w-full" size="lg" disabled={busy}>
        {busy ? "…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
      </Button>
      <div className="flex justify-between text-sm text-muted-foreground">
        <button type="button" onClick={() => setMode(mode === "signup" ? "signin" : "signup")} className="underline-offset-4 hover:underline">
          {mode === "signup" ? "Have an account? Sign in" : "First time? Create account"}
        </button>
        {mode === "signin" && (
          <button type="button" onClick={() => setMode("reset")} className="underline-offset-4 hover:underline">
            Forgot?
          </button>
        )}
      </div>
    </form>
  );
}
