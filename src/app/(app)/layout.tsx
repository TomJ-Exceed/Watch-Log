import { BottomNav } from "@/components/bottom-nav";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <main className="mx-auto w-full max-w-lg px-4 pb-[calc(env(safe-area-inset-bottom)+6rem)] pt-[calc(env(safe-area-inset-top)+1rem)]">
        {children}
      </main>
      <BottomNav />
    </>
  );
}
