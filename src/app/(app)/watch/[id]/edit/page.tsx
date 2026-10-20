import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { getWatch, listDealers, listStraps } from "@/lib/core/queries";
import { WatchForm } from "@/components/watch/watch-form";
import { DeleteWatchButton } from "@/components/watch/watch-actions";

export default async function EditWatchPage({ params }: PageProps<"/watch/[id]/edit">) {
  const { id } = await params;
  const { supabase, userId } = await requireUser();
  const [data, dealers, straps, brandRows] = await Promise.all([
    getWatch(supabase, id),
    listDealers(supabase),
    listStraps(supabase),
    supabase.from("watches").select("brand"),
  ]);
  if (!data) notFound();
  const brands = [...new Set((brandRows.data ?? []).map((r) => r.brand))].sort();
  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link href={`/watch/${id}`} className="-ml-2 p-2 text-muted-foreground" aria-label="Back"><ChevronLeft className="size-5" /></Link>
          <h1 className="text-xl font-semibold">Edit watch</h1>
        </div>
        <DeleteWatchButton watchId={id} photoPaths={data.photos.map((p) => p.storage_path)} />
      </header>
      <WatchForm userId={userId} watch={data.watch} photos={data.photos} dealers={dealers} straps={straps} brands={brands} />
    </div>
  );
}
