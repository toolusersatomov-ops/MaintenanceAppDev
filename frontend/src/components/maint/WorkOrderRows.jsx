import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import StatusBadge from "@/components/shared/StatusBadge";
import { Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmt } from "@/components/maint/useMaint";

export default function WorkOrderRows({ orders, selectedId, onSelect, emptyText = "No work orders found." }) {
  if (!orders.length) {
    return <p className="text-sm text-ink/60 py-6" data-testid="work-orders-empty">{emptyText}</p>;
  }
  return (
    <div className="space-y-2">
      {orders.map((wo) => (
        <Card
          key={wo.id}
          onClick={() => onSelect && onSelect(wo)}
          data-testid={`work-order-row-${wo.wo_id}`}
          className={cn(
            "bg-oat border-clay/40 transition-colors",
            onSelect && "cursor-pointer hover:border-beet/60",
            selectedId === wo.id && "border-beet ring-1 ring-beet/40"
          )}
        >
          <CardContent className="p-3 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink flex items-center gap-2">
                <span className="font-mono text-beet">{wo.wo_id}</span> {wo.issue_type}
                {wo.flagged && <Flag className="h-3.5 w-3.5 text-red-600" data-testid={`wo-flag-icon-${wo.wo_id}`} />}
              </p>
              <p className="text-xs text-ink/60 font-mono truncate">
                {wo.machine_label} &middot; {wo.component || "\u2014"} &middot; {wo.error_code || "\u2014"} &middot; {wo.assigned_technician || "Unassigned"}
              </p>
              <p className="text-xs text-ink/50">Updated {fmt(wo.updated_at || wo.created_at)}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <StatusBadge status={wo.priority} testId={`wo-priority-${wo.wo_id}`} />
              <StatusBadge status={wo.status} testId={`wo-status-${wo.wo_id}`} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
