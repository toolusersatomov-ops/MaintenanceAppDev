import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/shared/PageHeader";
import SearchableSelect from "@/components/shared/SearchableSelect";
import StatusBadge from "@/components/shared/StatusBadge";
import InfoGrid from "@/components/maint/InfoGrid";
import { useMachines, machineOptions, fmt } from "@/components/maint/useMaint";
import api from "@/lib/api";

const QUICK_ACTIONS = [
  ["Diagnostics", "/technician/diagnostics"],
  ["Work Orders", "/technician/work-orders"],
  ["Preventive Maintenance", "/technician/preventive-maintenance"],
  ["Calibration", "/technician/calibration-testing"],
  ["Component Testing", "/technician/component-testing"],
  ["Service History", "/technician/service-history"],
  ["Door / Panel Access", "/technician/door-panel-access"],
];

export default function MyMachines() {
  const { machines } = useMachines();
  const [machineId, setMachineId] = useState("");
  const [detail, setDetail] = useState(null);
  const navigate = useNavigate();

  useEffect(() => { if (!machineId && machines.length) setMachineId(machines[0].machine_id); }, [machines, machineId]);
  useEffect(() => {
    if (!machineId) return;
    api.get(`/maintenance/machines/${machineId}`).then(({ data }) => setDetail(data));
  }, [machineId]);

  const h = detail?.health;

  return (
    <div data-testid="my-machines-page">
      <PageHeader title="My Machines" description="Machines assigned to you with live technical health" />
      <div className="max-w-md mb-6">
        <SearchableSelect options={machineOptions(machines)} value={machineId} onChange={setMachineId}
                           placeholder="Select Machine" testId="my-machines-machine-select" />
      </div>

      {h && (
        <Card className="bg-oat border-clay/40 mb-4" data-testid="machine-summary-card">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="font-display text-lg font-bold text-ink">{h.machine_label}</h2>
              <div className="flex items-center gap-2">
                <StatusBadge status={h.machine_status} />
                <StatusBadge status={h.health_status} testId="machine-health-status" />
                <span className="font-mono text-sm text-beet font-bold" data-testid="machine-health-score">{h.health_score}/100</span>
              </div>
            </div>
            <InfoGrid items={[
              ["Machine ID", h.machine_id], ["Location", h.location], ["Machine Status", h.machine_status],
              ["Technical Health Score", `${h.health_score}/100`], ["Health Status", h.health_status],
              ["Active Error Codes", h.active_error_codes?.join(", ") || "None"],
              ["Active Technical Alerts", h.active_alerts], ["Open Work Orders", h.open_work_orders],
              ["Last Maintenance", fmt(h.last_maintenance)], ["Next PM Due", fmt(h.next_pm_due)],
              ["Last Calibration", fmt(h.last_calibration)],
              ["Assigned Technician", h.assigned_technician || "Shared pool"],
              ["Current Downtime", h.downtime_minutes ? `${h.downtime_minutes} min` : "None"],
            ]} />
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2 mb-6">
        {QUICK_ACTIONS.map(([label, path]) => (
          <Button key={label} variant="outline" onClick={() => navigate(`${path}?machine_id=${machineId}`)}
                   data-testid={`quick-action-${label.toLowerCase().replace(/[\s/]+/g, "-")}`}>{label}</Button>
        ))}
      </div>

      {detail && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="bg-oat border-clay/40" data-testid="machine-component-health">
            <CardContent className="p-4">
              <h3 className="font-display font-semibold text-ink mb-3">Component Health</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {detail.component_health.length === 0 && <p className="text-sm text-ink/60">No diagnostics recorded yet.</p>}
                {detail.component_health.map((c) => (
                  <div key={c.component} className="flex items-center justify-between text-sm border-b border-stone/60 py-1">
                    <span className="text-ink">{c.component}</span><StatusBadge status={c.status} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-oat border-clay/40" data-testid="machine-active-alerts">
            <CardContent className="p-4">
              <h3 className="font-display font-semibold text-ink mb-3">Active Technical Alerts</h3>
              {detail.alerts.length === 0 && <p className="text-sm text-ink/60">No active alerts.</p>}
              {detail.alerts.map((a) => (
                <div key={a.id} className="py-2 border-b border-stone/60" data-testid={`machine-alert-${a.alert_id}`}>
                  <p className="text-sm text-ink font-medium">{a.alert_type} <span className="font-mono text-xs text-ink/60">{a.error_code}</span></p>
                  <p className="text-xs text-ink/60">{a.component} &middot; {fmt(a.created_at)}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
