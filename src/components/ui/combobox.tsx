"use client";
import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "./input";

export type ComboOption = { value: string; hint?: string };

type Props = Omit<React.ComponentProps<"input">, "value" | "onChange" | "list"> & {
  value: string;
  onValueChange: (value: string) => void;
  options: (string | ComboOption)[];
};

// Free-text input with an in-page suggestion dropdown (replaces <datalist>, which
// mobile browsers render as keyboard chips instead of a dropdown).
export function Combobox({ value, onValueChange, options, className, onFocus, onBlur, ...props }: Props) {
  const [open, setOpen] = React.useState(false);
  const [typed, setTyped] = React.useState(false);
  const opts = options.map((o) => (typeof o === "string" ? { value: o } : o));
  const q = value.trim().toLowerCase();
  const shown =
    typed && q
      ? opts.filter((o) => o.value.toLowerCase().includes(q) || o.hint?.toLowerCase().includes(q))
      : opts;

  return (
    <div className="relative">
      <Input
        {...props}
        value={value}
        autoComplete="off"
        className={cn(opts.length > 0 && "pr-10", className)}
        onChange={(e) => {
          setTyped(true);
          setOpen(true);
          onValueChange(e.target.value);
        }}
        onFocus={(e) => {
          setTyped(false);
          setOpen(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setOpen(false);
          onBlur?.(e);
        }}
      />
      {opts.length > 0 && (
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      )}
      {open && shown.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-border bg-card py-1 shadow-lg">
          {shown.map((o) => (
            <li key={o.value + (o.hint ?? "")}>
              <button
                type="button"
                // mousedown fires before the input's blur, so the pick isn't lost
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onValueChange(o.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-baseline justify-between gap-3 px-3 py-2.5 text-left text-base hover:bg-secondary active:bg-secondary",
                  o.value === value && "text-primary",
                )}
              >
                <span>{o.value}</span>
                {o.hint && <span className="truncate text-xs text-muted-foreground">{o.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
