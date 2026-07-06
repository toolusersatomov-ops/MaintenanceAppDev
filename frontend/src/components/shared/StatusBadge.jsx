import React from "react";
import { cn } from "@/lib/utils";

const STATUS_STYLES = {
  Running: "bg-green-100 text-green-800 border-green-300",
  Warning: "bg-amber-100 text-amber-800 border-amber-300",
  Normal: "bg-green-100 text-green-800 border-green-300",
  "Low Stock": "bg-red-100 text-red-800 border-red-300",
  "Near Expiry": "bg-amber-100 text-amber-800 border-amber-300",
  "Replacement Due": "bg-orange-100 text-orange-800 border-orange-300",
  Open: "bg-red-100 text-red-800 border-red-300",
  Assigned: "bg-blue-100 text-blue-800 border-blue-300",
  Acknowledged: "bg-blue-100 text-blue-800 border-blue-300",
  Resolved: "bg-green-100 text-green-800 border-green-300",
  Closed: "bg-green-100 text-green-800 border-green-300",
  Completed: "bg-green-100 text-green-800 border-green-300",
  Pending: "bg-stone-200 text-ink border-stone-400",
  "Pending Approval": "bg-amber-100 text-amber-800 border-amber-300",
  "Pending Review": "bg-blue-100 text-blue-800 border-blue-300",
  "In Progress": "bg-blue-100 text-blue-800 border-blue-300",
  "Ready for Pickup": "bg-emerald-100 text-emerald-800 border-emerald-300",
  "Saved / Ready for Pickup": "bg-emerald-100 text-emerald-800 border-emerald-300",
  Picked: "bg-blue-100 text-blue-800 border-blue-300",
  "Clean / Ready for Filling": "bg-emerald-100 text-emerald-800 border-emerald-300",
  "Dirty / Returned from Machine": "bg-red-100 text-red-800 border-red-300",
  "Returned to Kitchen": "bg-amber-100 text-amber-800 border-amber-300",
  Approved: "bg-green-100 text-green-800 border-green-300",
  Rejected: "bg-red-100 text-red-800 border-red-300",
  Scheduled: "bg-blue-100 text-blue-800 border-blue-300",
  Overdue: "bg-red-100 text-red-800 border-red-300",
  High: "bg-red-100 text-red-800 border-red-300",
  Medium: "bg-amber-100 text-amber-800 border-amber-300",
  Low: "bg-stone-200 text-ink border-stone-400",
};

export default function StatusBadge({ status, className, testId }) {
  const style = STATUS_STYLES[status] || "bg-stone-200 text-ink border-stone-400";
  return (
    <span
      data-testid={testId || `status-badge-${String(status).toLowerCase().replace(/[\s/]+/g, "-")}`}
      className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap", style, className)}
    >
      {status}
    </span>
  );
}
