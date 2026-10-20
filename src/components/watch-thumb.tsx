import { Watch as WatchIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Square photo with a tasteful placeholder when no photo exists. */
export function WatchThumb({ url, alt, className, iconClass }: { url: string | null; alt: string; className?: string; iconClass?: string }) {
  return (
    <div className={cn("relative aspect-square overflow-hidden rounded-2xl bg-secondary", className)}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={alt} loading="lazy" decoding="async" className="size-full object-cover" />
      ) : (
        <div className="flex size-full items-center justify-center bg-gradient-to-br from-secondary to-card">
          <WatchIcon className={cn("size-1/3 text-muted-foreground/50", iconClass)} strokeWidth={1.25} />
        </div>
      )}
    </div>
  );
}
