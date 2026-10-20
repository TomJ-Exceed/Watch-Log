import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", {
  variants: {
    variant: {
      default: "bg-secondary text-secondary-foreground",
      gen: "bg-emerald-500/15 text-emerald-300",
      rep: "bg-sky-500/15 text-sky-300",
      accent: "bg-primary/15 text-primary",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
