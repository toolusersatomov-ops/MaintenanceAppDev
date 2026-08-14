import React, { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import PageHeader from "@/components/shared/PageHeader";
import SearchableSelect from "@/components/shared/SearchableSelect";
import StatusBadge from "@/components/shared/StatusBadge";
import Timeline from "@/components/shared/Timeline";
import { useMeta, useMachines, machineOptions, fmt } from "@/components/maint/useMaint";
import api from "@/lib/api";
import { Flag } from "lucide-react";

export default function LiveProgress() {
  const meta = useMeta();
  const { machines } = useMachines();
  const [filters, setFilters] = useState({ machine_id: "", technician: "", status: "", flagged: false });
  const [rows, setRows] = useState([]);
  const [technicians, setTechnicians] = useState([]);

  const load = useCallback(() => {
    const q = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) q.set(k, v === true ? "true" : v); });
    api.get(`/maintenance-sup/live-progress?${q.toString()}`).then(({ data }) => setRows(data));
  }, [filters]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get("/maintenance/technicians").then(({ data }) => setTechnicians(data));
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div data-testid="live-progress-page">
      <PageHeader title="Live Maintenance Progress" description="Every active work order with its live technician stage, flags and timeline" />

      <div className="flex flex-wrap gap-2 mb-4">
        <div className="w-56"><SearchableSelect options={[{ value: "", label: "All Machines" }, ...machineOptions(machines)]}
          value={filters.machine_id} onChange={(v) => setFilters({ ...filters, machine_id: v })} placeholder="Machine" testId="live-filter-machine" /></div>
        <div className="w-56"><SearchableSelect options={[{ value: "", label: "All Technicians" }, ...technicians.map((t) => ({ value: t.username, label: t.name }))]}
          value={filters.technician} onChange={(v) => setFilters({ ...filters, technician: v })} placeholder="Technician" testId="live-filter-technician" /></div>
        <div className="w-56"><SearchableSelect options={[{ value: "", label: "All Stages" }, ...(meta?.wo_statuses || []).map((s) => ({ value: s, label: s }))]}
          value={filters.status} onChange={(v) => setFilters({ ...filters, status: v })} placeholder="Stage" testId="live-filter-status" /></div>
        <label className="flex items-center gap-2 text-sm text-ink self-center">
          <input type="checkbox" checked={filters.flagged} onChange={(e) => setFilters({ ...filters, flagged: e.target.checked })}
                  data-testid="live-filter-flagged" /> Flagged only
        </label>
      </div>

      <div className="space-y-3">
        {rows.length === 0 && <p className="text-sm text-ink/60" data-testid="live-progress-empty">No active maintenance work in progress.</p>}
        {rows.map((wo) => (
          <Card key={wo.id} className="bg-oat border-clay/40" data-testid={`live-progress-${wo.wo_id}`}>
            <CardContent className="p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-ink flex items-center gap-2">
                    <span className="font-mono text-beet">{wo.wo_id}</span> {wo.issue_type}
                    {wo.flagged && <span className="inline-flex items-center gap-1 text-xs text-red-700" data-testid={`live-flag-${wo.wo_id}`}><Flag className="h-3.5 w-3.5" /> {wo.flag?.reason}</span>}
                  </p>
                  <p className="text-xs text-ink/60 font-mono">
                    {wo.machine_label} &middot; {wo.component} &middot; {wo.error_code} &middot; {wo.assigned_technician || "Unassigned"} &middot; updated {fmt(wo.updated_at)}
                  </p>
                  {wo.technician_comment && <p className="text-xs text-ink/70">Technician: {wo.technician_comment}</p>}
                  {wo.supervisor_comment && <p className="text-xs text-ink/70">Supervisor: {wo.supervisor_comment}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={wo.priority} />
                  <StatusBadge status={wo.status} testId={`live-stage-${wo.wo_id}`} />
                </div>
              </div>
              <Timeline history={wo.history || []} testId={`live-timeline-${wo.wo_id}`} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
