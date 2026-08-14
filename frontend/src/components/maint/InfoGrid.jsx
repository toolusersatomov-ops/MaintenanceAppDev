import React from "react";

// Read-only label/value grid used across maintenance detail views.
export default function InfoGrid({ items, cols = 3, testId }) {
  return (
    <div
      className={`grid grid-cols-1 sm:grid-cols-2 ${cols === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"} gap-x-6 gap-y-3`}
      data-testid={testId || "info-grid"}
    >
      {items.filter(Boolean).map(([label, value]) => (
        <div key={label} data-testid={`info-${String(label).toLowerCase().replace(/[\s/]+/g, "-")}`}>
          <p className="text-xs uppercase tracking-wide text-ink/50">{label}</p>
          <div className="text-sm text-ink font-medium mt-0.5 break-words">{value === null || value === undefined || value === "" ? "\u2014" : value}</div>
        </div>
      ))}
    </div>
  );
}
