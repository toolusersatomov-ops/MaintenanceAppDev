import React from "react";
import { Check, Circle } from "lucide-react";

// Vertical timeline / progress tracker for workflow stages.
// history: [{stage, at, by}]
export default function Timeline({ history = [], testId }) {
  if (!history.length) {
    return <p className="text-sm text-ink/60" data-testid={testId ? `${testId}-empty` : "timeline-empty"}>No progress yet.</p>;
  }
  return (
    <div className="relative pl-8 border-l-2 border-stone space-y-6" data-testid={testId || "timeline"}>
      {history.map((h, idx) => (
        <div key={idx} className="relative" data-testid={`${testId || "timeline"}-item-${idx}`}>
          <span className="absolute -left-[41px] top-0 w-8 h-8 rounded-full bg-beet border-2 border-bone flex items-center justify-center">
            <Check className="h-4 w-4 text-bone" />
          </span>
          <p className="text-sm font-semibold text-ink">{h.stage}</p>
          <p className="text-xs text-ink/60 font-mono">
            {h.at ? new Date(h.at).toLocaleString() : ""} {h.by ? `\u00b7 ${h.by}` : ""}
          </p>
        </div>
      ))}
    </div>
  );
}
