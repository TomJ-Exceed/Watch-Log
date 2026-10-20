import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-12">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192.png" alt="" className="mb-6 size-16 rounded-2xl" />
      <h1 className="text-3xl font-semibold tracking-tight">Wrist Check</h1>
      <p className="mt-1 mb-8 text-muted-foreground">Your collection and daily wear log.</p>
      <LoginForm initialError={typeof error === "string" ? error : undefined} />
    </main>
  );
}
