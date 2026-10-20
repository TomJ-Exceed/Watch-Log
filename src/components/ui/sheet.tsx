"use client";
import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Sheet = Dialog.Root;
export const SheetTrigger = Dialog.Trigger;
export const SheetClose = Dialog.Close;

/** Bottom sheet (mobile-first dialog). */
export function SheetContent({
  className,
  children,
  title,
  ...props
}: React.ComponentProps<typeof Dialog.Content> & { title: string }) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in" />
      <Dialog.Content
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border-t border-border bg-card p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-2xl outline-none",
          className,
        )}
        {...props}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />
        <div className="mb-4 flex items-center justify-between">
          <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
          <Dialog.Close className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary" aria-label="Close">
            <X className="size-5" />
          </Dialog.Close>
        </div>
        <Dialog.Description className="sr-only">{title}</Dialog.Description>
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  );
}
