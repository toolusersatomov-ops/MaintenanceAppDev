import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import api from "@/lib/api";

export default function TaskAssignment() {
  const [data, setData] = useState({ open_alerts: [], assigned_alerts: [] });
  const navigate = useNavigate();

  const load = () => api.get("/supervisor/task-assignment").then(({ data }) => setData(data));
  useEffect(() => {
    load();
  }, []);

  const Column = ({ title, items, testId }) => (
    <div className="flex-1 min-w-[280px]">
      <h3 className="font-display font-semibold text-ink mb-2">{title} ({items.length})</h3>
      <div className="space-y-2" data-testid={testId}>
        {items.map((a) => (
          <Card key={a.id} className="bg-oat border-clay/40" data-testid={`task-assignment-item-${a.id}`}>
            <CardContent className="p-3 flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-ink">{a.alert_type}: {a.ingredient_name}</p>
                <p className="text-xs text-ink/60 font-mono">{a.machine_label}</p>
                {a.assigned_operations_staff && <p className="text-xs text-beet font-mono">Assigned: {a.assigned_operations_staff}</p>}
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={a.status} />
                <Button size="sm" variant="outline" onClick={() => navigate(`/supervisor/alert/${a.id}`)} data-testid={`task-assignment-view-${a.id}`}>View</Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {items.length === 0 && <p className="text-sm text-ink/60">Nothing here.</p>}
      </div>
    </div>
  );

  return (
    <div data-testid="task-assignment-page">
      <PageHeader title="Task Assignment" description="Assign Operations Staff to alerts that need attention" />
      <div className="flex flex-col sm:flex-row gap-6">
        <Column title="Needs Assignment" items={data.open_alerts} testId="needs-assignment-column" />
        <Column title="Assigned" items={data.assigned_alerts} testId="assigned-column" />
      </div>
    </div>
  );
}
