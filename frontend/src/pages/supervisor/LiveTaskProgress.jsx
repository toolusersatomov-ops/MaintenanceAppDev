import React, { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import Timeline from "@/components/shared/Timeline";
import SearchableSelect from "@/components/shared/SearchableSelect";
import api from "@/lib/api";

export default function LiveTaskProgress() {
  const [params] = useSearchParams();
  const [items, setItems] = useState([]);
  const [machines, setMachines] = useState([]);
  const [staffOptions, setStaffOptions] = useState([]);
  const [f, setF] = useState({
    machine: params.get("machine") || "", ingredient: "", ticket: "",
    staff: "", status: params.get("status") || "", date: "",
  });

  useEffect(() => {
    api.get("/catalog/machines").then(({ data }) => setMachines([{ value: "", label: "All Machines" }, ...data.map((m) => ({ value: m.id, label: m.label || m.id }))]));
    api.get("/supervisor/users").then(({ data }) => setStaffOptions([{ value: "", label: "All Staff" }, ...data.filter((u) => u.role === "operations_staff").map((u) => ({ value: u.username, label: `${u.name} (${u.username})` }))])).catch(() => {});
  }, []);

  const load = useCallback(() => {
    const q = new URLSearchParams();
    if (f.machine) q.set("machine_id", f.machine);
    if (f.ingredient) q.set("ingredient", f.ingredient);
    if (f.ticket) q.set("ticket", f.ticket);
    if (f.staff) q.set("staff", f.staff);
    if (f.status) q.set("status", f.status);
    if (f.date) q.set("date", f.date);
    api.get(`/supervisor/live-task-progress?${q.toString()}`).then(({ data }) => setItems(data));
  }, [f]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <div data-testid="live-task-progress-page">
      <PageHeader title="Live Task Progress" description="Real-time timeline for every alert, bin replacement, and cleaning task" />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mb-5" data-testid="live-progress-filters">
        <SearchableSelect options={machines} value={f.machine} onChange={(v) => setF({ ...f, machine: v })} placeholder="Machine" testId="ltp-filter-machine" />
        <Input placeholder="Ingredient / Item" value={f.ingredient} onChange={(e) => setF({ ...f, ingredient: e.target.value })} className="bg-oat" data-testid="ltp-filter-ingredient" />
        <Input placeholder="Ticket ID" value={f.ticket} onChange={(e) => setF({ ...f, ticket: e.target.value })} className="bg-oat" data-testid="ltp-filter-ticket" />
        <SearchableSelect options={staffOptions} value={f.staff} onChange={(v) => setF({ ...f, staff: v })} placeholder="Operations Staff" testId="ltp-filter-staff" />
        <Input placeholder="Status / Stage" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} className="bg-oat" data-testid="ltp-filter-status" />
        <Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className="bg-oat" data-testid="ltp-filter-date" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {items.map((t) => (
          <Card key={t.id} className="bg-oat border-clay/40" data-testid={`live-progress-card-${t.id}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between gap-2">
                <span className="truncate">{t.ingredient_name || t.ref_type} &middot; {t.machine_label || t.machine_id}</span>
                <StatusBadge status={t.current_stage} />
              </CardTitle>
              <div className="text-xs text-ink/70 font-mono grid grid-cols-2 gap-x-3 gap-y-0.5 mt-1" data-testid={`live-progress-meta-${t.id}`}>
                <span>Ticket: <span className="text-beet font-semibold">{t.ticket_id}</span></span>
                {t.slot_id && <span>Slot: {t.slot_id.split("-").pop()} ({t.slot_type || "-"})</span>}
                {t.assigned_operations_staff && <span>Assigned: {t.assigned_operations_staff}</span>}
                {t.created_by && <span>Created By: {t.created_by}</span>}
                {t.status && <span>Status: {t.status}</span>}
                <span>Updated: {t.updated_at ? new Date(t.updated_at).toLocaleString() : "-"}</span>
              </div>
            </CardHeader>
            <CardContent>
              <Timeline history={t.history} testId={`live-progress-timeline-${t.id}`} />
            </CardContent>
          </Card>
        ))}
        {items.length === 0 && <p className="text-sm text-ink/60" data-testid="live-task-progress-empty">No tasks match the current filters.</p>}
      </div>
    </div>
  );
}
