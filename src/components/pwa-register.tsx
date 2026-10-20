"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Registers the service worker and keeps the `tz` cookie in sync so "today" is local. */
export function PwaRegister() {
  const router = useRouter();
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const current = document.cookie.match(/(?:^|; )tz=([^;]*)/)?.[1];
    if (tz && decodeURIComponent(current ?? "") !== tz) {
      document.cookie = `tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
      if (current) router.refresh();
    }
  }, [router]);
  return null;
}
