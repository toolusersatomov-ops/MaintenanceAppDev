import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import Timeline from "@/components/shared/Timeline";
import api from "@/lib/api";

export default function LiveTaskProgress() {
  const [items, setItems] = useState([]);
  useEffect(() => { api.get("/supervisor/live-task-progress").then(({ data }) => setItems(data)); }, []);

  return (
    <div data-testid="live-task-progress-page">
      <PageHeader title="Live Task Progress" description="Real-time timeline for every alert, bin replacement, and cleaning task" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {items.map((t) => (
          <Card key={t.id} className="bg-oat border-clay/40" data-testid={`live-progress-card-${t.id}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>{t.machine_label || t.ref_type}</span>
                <StatusBadge status={t.current_stage} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Timeline history={t.history} testId={`live-progress-timeline-${t.id}`} />
            </CardContent>
          </Card>
        ))}
        {items.length === 0 && <p className="text-sm text-ink/60" data-testid="live-task-progress-empty">No active tasks yet.</p>}
      </div>
    </div>
  );
}
