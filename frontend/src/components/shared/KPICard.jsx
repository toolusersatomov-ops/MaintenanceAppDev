import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function KPICard({ label, value, icon: Icon, accent = false, testId, suffix }) {
  return (
    <Card
      data-testid={testId || `kpi-${String(label).toLowerCase().replace(/\s+/g, "-")}`}
      className="bg-oat border-clay/40 hover:shadow-md transition-shadow"
    >
      <CardContent className="p-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs sm:text-sm text-ink/70 font-medium truncate">{label}</p>
          <p className={cn("font-mono text-2xl sm:text-3xl font-bold mt-1 truncate", accent ? "text-beet" : "text-ink")}>
            {value}
            {suffix ? <span className="text-sm font-sans ml-1 text-ink/60">{suffix}</span> : null}
          </p>
        </div>
        {Icon ? (
          <div className="shrink-0 h-10 w-10 rounded-full bg-beet/10 flex items-center justify-center">
            <Icon className="h-5 w-5 text-beet" />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
