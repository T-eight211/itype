"use client";

import { useCallback, useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

type TypingCoachJsonPanelProps = {
  data: unknown;
};

export function TypingCoachJsonPanel({ data }: TypingCoachJsonPanelProps) {
  const text = JSON.stringify(data, null, 2);
  const lines = text.split("\n");
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, [text]);

  return (
    <div className="mt-6 rounded-lg border bg-muted/40">
      <div className="flex items-center justify-end border-b border-border/60 px-3 py-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void copy()} className="gap-1.5">
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copied" : "Copy JSON"}
        </Button>
      </div>
      <div className="overflow-auto p-4">
        <div className="min-w-max font-mono text-xs leading-6">
          {lines.map((line, i) => (
            <div key={i} className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-3">
              <span className="select-none text-right tabular-nums text-muted-foreground">{i + 1}</span>
              <span className="whitespace-pre text-left">{line}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
