import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import DataTable from "@/components/shared/DataTable";
import InfoGrid from "@/components/maint/InfoGrid";
import { fmt } from "@/components/maint/useMaint";
import api from "@/lib/api";

export default function MachineHealth() {
  const [params] = useSearchParams();
  const healthFilter = params.get("health") || "";
  const [machines, setMachines] = useState([]);
  const [detail, setDetail] = useState(null);

  useEffect(() => { api.get("/maintenance/machines").then(({ data }) => setMachines(data)); }, []);

  const open = async (m) => {
    const { data } = await api.get(`/maintenance/machines/${m.machine_id}`);
    setDetail(data);
  };

  const shown = healthFilter ? machines.filter((m) => m.health_status === healthFilter) : machines;

  return (
    <div data-testid="machine-health-page">
      <PageHeader title="Machine Health Center" description={`Technical health across the fleet${healthFilter ? ` \u00b7 filtered: ${healthFilter}` : ""}`} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {shown.length === 0 && <p className="text-sm text-ink/60" data-testid="machine-health-empty">No machines match this filter.</p>}
        {shown.map((m) => (
          <Card key={m.machine_id} className="bg-oat border-clay/40 cursor-pointer hover:border-beet/60"
                 onClick={() => open(m)} data-testid={`machine-health-card-${m.machine_id}`}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-display font-bold text-ink">{m.machine_label}</p>
                <StatusBadge status={m.health_status} testId={`health-status-${m.machine_id}`} />
              </div>
              <p className="font-mono text-2xl font-bold text-beet" data-testid={`health-score-${m.machine_id}`}>{m.health_score}<span className="text-sm text-ink/50">/100</span></p>
              <div className="text-xs text-ink/70 space-y-0.5">
                <p>Machine Status: {m.machine_status}</p>
                <p>Active Faults: {m.active_faults?.join(", ") || "None"}</p>
                <p>Open Work Orders: {m.open_work_orders} &middot; Alerts: {m.active_alerts}</p>
                <p>Last Maintenance: {fmt(m.last_maintenance)}</p>
                <p>Next PM Due: {fmt(m.next_pm_due)}</p>
                <p>Last Calibration: {fmt(m.last_calibration)}</p>
                <p>Downtime: {m.downtime_minutes ? `${m.downtime_minutes} min` : "None"}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="bg-bone max-w-5xl max-h-[88vh] overflow-y-auto" data-testid="machine-detail-dialog">
          <DialogHeader><DialogTitle>{detail?.health?.machine_label} &mdash; Technical Detail</DialogTitle></DialogHeader>
          {detail && (
            <>
              <InfoGrid cols={4} items={[
                ["Health Score", `${detail.health.health_score}/100`], ["Health Status", <StatusBadge status={detail.health.health_status} />],
                ["Machine Status", detail.health.machine_status], ["Active Alerts", detail.health.active_alerts],
                ["Open Work Orders", detail.health.open_work_orders], ["Overdue PM", detail.health.overdue_pm],
                ["Failed Calibrations", detail.health.failed_calibrations],
                ["Repeated Failures", detail.health.repeated_failures?.join(", ") || "None"],
              ]} />
              <Tabs defaultValue="components" className="mt-4">
                <TabsList className="bg-oat flex-wrap h-auto">
                  {[["components", "Component Health"], ["alerts", "Alerts"], ["wos", "Work Orders"], ["diag", "Diagnostics"],
                    ["pm", "PM History"], ["cal", "Calibration"], ["parts", "Parts"], ["service", "Service History"], ["down", "Downtime"]]
                    .map(([k, l]) => <TabsTrigger key={k} value={k} data-testid={`machine-tab-${k}`}>{l}</TabsTrigger>)}
                </TabsList>
                <TabsContent value="components">
                  <DataTable columns={[{ key: "component", label: "Component" }, { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> }]}
                              rows={detail.component_health} testId="tab-components" emptyText="No diagnostics recorded." />
                </TabsContent>
                <TabsContent value="alerts">
                  <DataTable columns={[{ key: "alert_id", label: "Alert", mono: true }, { key: "alert_type", label: "Type" },
                    { key: "component", label: "Component" }, { key: "error_code", label: "Error Code", mono: true },
                    { key: "severity", label: "Severity", render: (r) => <StatusBadge status={r.severity} /> },
                    { key: "created_at", label: "Created", render: (r) => fmt(r.created_at) },
                    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> }]}
                    rows={detail.alerts} testId="tab-alerts" emptyText="No active alerts." />
                </TabsContent>
                <TabsContent value="wos">
                  <DataTable columns={[{ key: "wo_id", label: "Work Order", mono: true }, { key: "issue_type", label: "Issue" },
                    { key: "work_type", label: "Type" }, { key: "assigned_technician", label: "Technician" },
                    { key: "priority", label: "Priority", render: (r) => <StatusBadge status={r.priority} /> },
                    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
                    { key: "created_at", label: "Created", render: (r) => fmt(r.created_at) }]}
                    rows={detail.work_orders} testId="tab-work-orders" emptyText="No work orders." />
                </TabsContent>
                <TabsContent value="diag">
                  <DataTable columns={[{ key: "diag_id", label: "Diagnostic", mono: true }, { key: "technician", label: "Technician" },
                    { key: "overall_result", label: "Result", render: (r) => <StatusBadge status={r.overall_result} /> },
                    { key: "created_at", label: "Date", render: (r) => fmt(r.created_at) }]}
                    rows={detail.diagnostics} testId="tab-diagnostics" emptyText="No diagnostics." />
                </TabsContent>
                <TabsContent value="pm">
                  <DataTable columns={[{ key: "pm_id", label: "PM", mono: true }, { key: "pm_type", label: "Type" },
                    { key: "frequency", label: "Frequency" }, { key: "technician", label: "Technician" },
                    { key: "due_at", label: "Due", render: (r) => fmt(r.due_at) },
                    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> }]}
                    rows={detail.pm_history} testId="tab-pm" emptyText="No PM schedules." />
                </TabsContent>
                <TabsContent value="cal">
                  <DataTable columns={[{ key: "cal_id", label: "Calibration", mono: true }, { key: "slot_id", label: "Slot", mono: true },
                    { key: "bin_id", label: "Bin ID", mono: true }, { key: "calibration_type", label: "Type" },
                    { key: "variance_pct", label: "Variance %" },
                    { key: "result", label: "Result", render: (r) => <StatusBadge status={r.result} /> },
                    { key: "created_at", label: "Date", render: (r) => fmt(r.created_at) }]}
                    rows={detail.calibration_history} testId="tab-calibration" emptyText="No calibrations." />
                </TabsContent>
                <TabsContent value="parts">
                  <DataTable columns={[{ key: "part_name", label: "Part" }, { key: "part_code", label: "Code", mono: true },
                    { key: "quantity", label: "Qty" }, { key: "component", label: "Component" },
                    { key: "technician", label: "Technician" }, { key: "created_at", label: "Date", render: (r) => fmt(r.created_at) }]}
                    rows={detail.parts_history} testId="tab-parts" emptyText="No parts replaced." />
                </TabsContent>
                <TabsContent value="service">
                  <DataTable columns={[{ key: "work_order_ref", label: "Work Order", mono: true }, { key: "issue", label: "Issue" },
                    { key: "repair", label: "Repair" }, { key: "technician", label: "Technician" },
                    { key: "downtime_minutes", label: "Downtime (min)" },
                    { key: "final_status", label: "Status", render: (r) => <StatusBadge status={r.final_status} /> },
                    { key: "date", label: "Date", render: (r) => fmt(r.date) }]}
                    rows={detail.service_history} testId="tab-service" emptyText="No service history." />
                </TabsContent>
                <TabsContent value="down">
                  <DataTable columns={[{ key: "work_order_ref", label: "Work Order", mono: true }, { key: "issue", label: "Issue" },
                    { key: "started", label: "Started", render: (r) => fmt(r.started) },
                    { key: "ended", label: "Ended", render: (r) => fmt(r.ended) }, { key: "minutes", label: "Minutes" }]}
                    rows={detail.downtime_history} testId="tab-downtime" emptyText="No downtime events." />
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
