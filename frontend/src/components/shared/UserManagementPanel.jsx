import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Lock, Unlock, UserPlus } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import DataTable from "@/components/shared/DataTable";
import SearchableSelect from "@/components/shared/SearchableSelect";
import StatusBadge from "@/components/shared/StatusBadge";
import { useToast } from "@/hooks/use-toast";
import api, { formatApiError } from "@/lib/api";

const ROLE_OPTIONS = [
  { value: "kitchen_staff", label: "Kitchen Staff" }, { value: "operations_staff", label: "Operations Staff" },
  { value: "operations_supervisor", label: "Operations Supervisor" }, { value: "maintenance_technician", label: "Maintenance Technician" },
  { value: "maintenance_supervisor", label: "Maintenance Supervisor" }, { value: "admin", label: "Admin" },
];
const MACHINE_OPTIONS = ["M001", "M002", "M003", "M004", "M005"];

export default function UserManagementPanel() {
  const [users, setUsers] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ username: "", password: "", role: "operations_staff", name: "", assigned_machines: [] });
  const { toast } = useToast();

  const load = () => api.get("/supervisor/users").then(({ data }) => setUsers(data));
  useEffect(() => { load(); }, []);

  const createUser = async () => {
    try {
      await api.post("/supervisor/users", form);
      toast({ title: "User created" });
      setOpen(false);
      setForm({ username: "", password: "", role: "operations_staff", name: "", assigned_machines: [] });
      load();
    } catch (e) {
      toast({ title: "Failed to create user", description: formatApiError(e), variant: "destructive" });
    }
  };

  const toggleLock = async (u) => {
    await api.post(`/supervisor/users/${u.id}/${u.locked ? "unlock" : "lock"}`);
    toast({ title: u.locked ? `${u.username} unlocked` : `${u.username} locked` });
    load();
  };

  const toggleMachine = (m) => {
    setForm((f) => ({ ...f, assigned_machines: f.assigned_machines.includes(m) ? f.assigned_machines.filter((x) => x !== m) : [...f.assigned_machines, m] }));
  };

  return (
    <div data-testid="user-access-management-page">
      <PageHeader
        title="User & Access Management"
        description="Manage accounts, roles, and unlock locked accounts"
        actions={<Button onClick={() => setOpen(true)} data-testid="create-user-btn" className="bg-beet hover:bg-beet-hover text-bone"><UserPlus className="h-4 w-4 mr-2" /> New User</Button>}
      />
      <DataTable
        testId="users-table"
        columns={[
          { key: "username", label: "User ID", mono: true }, { key: "name", label: "Name" }, { key: "role_label", label: "Role" },
          { key: "assigned_machines", label: "Assigned Machines", render: (r) => (r.assigned_machines || []).join(", ") || "\u2014" },
          { key: "locked", label: "Status", render: (r) => <StatusBadge status={r.locked ? "Locked" : "Active"} className={r.locked ? "bg-red-100 text-red-800 border-red-300" : "bg-green-100 text-green-800 border-green-300"} /> },
          { key: "actions", label: "Actions", render: (r) => (
            <Button size="sm" variant="outline" onClick={() => toggleLock(r)} data-testid={`toggle-lock-btn-${r.id}`}>
              {r.locked ? <><Unlock className="h-3 w-3 mr-1" /> Unlock</> : <><Lock className="h-3 w-3 mr-1" /> Lock</>}
            </Button>
          ) },
        ]}
        rows={users}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-bone" data-testid="create-user-dialog">
          <DialogHeader><DialogTitle>Create New User</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="User ID" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="bg-bone" data-testid="new-user-username" />
            <Input placeholder="Full Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-bone" data-testid="new-user-name" />
            <Input placeholder="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="bg-bone" data-testid="new-user-password" />
            <SearchableSelect options={ROLE_OPTIONS} value={form.role} onChange={(v) => setForm({ ...form, role: v })} testId="new-user-role-select" />
            {form.role === "operations_staff" && (
              <div className="flex flex-wrap gap-2">
                {MACHINE_OPTIONS.map((m) => (
                  <button key={m} type="button" onClick={() => toggleMachine(m)} data-testid={`new-user-machine-${m}`}
                    className={`text-xs px-2 py-1 rounded-full border ${form.assigned_machines.includes(m) ? "bg-beet text-bone border-beet" : "bg-bone border-clay/40"}`}>
                    {m}
                  </button>
                ))}
              </div>
            )}
            <Button onClick={createUser} data-testid="new-user-submit-btn" className="w-full bg-beet hover:bg-beet-hover text-bone">Create User</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
