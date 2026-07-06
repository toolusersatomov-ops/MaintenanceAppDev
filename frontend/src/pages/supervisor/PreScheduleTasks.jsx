import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import PageHeader from "@/components/shared/PageHeader";
import SearchableSelect from "@/components/shared/SearchableSelect";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import { useToast } from "@/hooks/use-toast";
import api, { formatApiError } from "@/lib/api";

export default function PreScheduleTasks() {
  const [machines, setMachines] = useState([]);
  const [machineId, setMachineId] = useState("");
  const [slots, setSlots] = useState([]);
  const [slotId, setSlotId] = useState("");
  const [staffOptions, setStaffOptions] = useState([]);
  const [staff, setStaff] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [tasks, setTasks] = useState([]);
  const { toast } = useToast();

  const load = () => api.get("/alerts/pre-schedule/list").then(({ data }) => setTasks(data));
  useEffect(() => {
    api.get("/catalog/machines").then(({ data }) => setMachines(data));
    api.get("/supervisor/users").then(({ data }) => setStaffOptions(data.filter((u) => u.role === "operations_staff").map((u) => ({ value: u.username, label: `${u.name} (${u.username})` }))));
    load();
  }, []);

  useEffect(() => {
    if (!machineId) return;
    api.get(`/catalog/machines/${machineId}/slots`).then(({ data }) => setSlots(data.slots));
  }, [machineId]);

  const submit = async () => {
    try {
      await api.post("/alerts/pre-schedule", { machine_id: machineId, slot_id: slotId, operations_staff: staff, scheduled_date: date, notes });
      toast({ title: "Pre-scheduled task created" });
      setSlotId(""); setStaff(""); setDate(""); setNotes("");
      load();
    } catch (e) {
      toast({ title: "Failed", description: formatApiError(e), variant: "destructive" });
    }
  };

  return (
    <div data-testid="pre-schedule-tasks-page">
      <PageHeader title="Pre-Schedule Tasks" description="Schedule a single bin replacement task ahead of time" />
      <Card className="bg-oat border-clay/40 mb-6">
        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SearchableSelect options={machines.map((m) => ({ value: m.id, label: m.label }))} value={machineId} onChange={setMachineId} placeholder="Select Machine" testId="pre-schedule-machine-select" />
          <SearchableSelect options={slots.map((s) => ({ value: s.id, label: `${s.ingredient_name} (${s.slot_code})` }))} value={slotId} onChange={setSlotId} placeholder="Select Slot / Ingredient" testId="pre-schedule-slot-select" />
          <SearchableSelect options={staffOptions} value={staff} onChange={setStaff} placeholder="Select Operations Staff" testId="pre-schedule-staff-select" />
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-bone" data-testid="pre-schedule-date-input" />
          <Textarea placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} className="bg-bone sm:col-span-2" data-testid="pre-schedule-notes-input" />
          <Button onClick={submit} disabled={!machineId || !slotId || !staff} data-testid="pre-schedule-submit-btn" className="bg-beet hover:bg-beet-hover text-bone sm:col-span-2">
            Create Pre-Scheduled Task
          </Button>
        </CardContent>
      </Card>
      <DataTable
        testId="pre-schedule-tasks-table"
        columns={[
          { key: "machine_id", label: "Machine" }, { key: "slot_id", label: "Slot" }, { key: "operations_staff", label: "Staff" },
          { key: "scheduled_date", label: "Scheduled Date" }, { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
        ]}
        rows={tasks}
      />
    </div>
  );
}
