import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import PageHeader from "@/components/shared/PageHeader";
import api from "@/lib/api";

function ScoreRing({ score }) {
  const color = score >= 85 ? "text-green-600" : score >= 70 ? "text-amber-600" : "text-red-600";
  return <p className={`font-mono text-3xl font-bold ${color}`}>{score}</p>;
}

export default function MachineHealth() {
  const [items, setItems] = useState([]);
  useEffect(() => { api.get("/maintenance/health").then(({ data }) => setItems(data)); }, []);

  return (
    <div data-testid="machine-health-page">
      <PageHeader title="Machine Health Center" description="Health score and diagnostic summary for every machine" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((h) => (
          <Card key={h.id} className="bg-oat border-clay/40" data-testid={`machine-health-card-${h.machine_id}`}>
            <CardContent className="p-4 text-center">
              <p className="font-semibold text-ink mb-2">{h.machine_label}</p>
              <ScoreRing score={h.health_score} />
              <p className="text-xs text-ink/60 font-mono mt-2">/ 100 Health Score</p>
              <div className="flex justify-around mt-3 text-xs font-mono">
                <span>Open Alerts: {h.open_technical_alerts}</span>
                <span>Open WOs: {h.open_work_orders}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
