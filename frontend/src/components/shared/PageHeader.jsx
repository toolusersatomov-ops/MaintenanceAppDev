import React from "react";

export default function PageHeader({ title, description, actions, testId }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6" data-testid={testId || "page-header"}>
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink tracking-tight">{title}</h1>
        {description && <p className="text-sm text-ink/60 mt-1">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
