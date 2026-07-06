import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/shared/StatusBadge";
import SearchableSelect from "@/components/shared/SearchableSelect";
import { useToast } from "@/hooks/use-toast";
import api, { formatApiError } from "@/lib/api";

const FIELD_LABELS = [
  ["id", "Alert ID"], ["alert_type", "Alert Type"], ["machine_label", "Machine"], ["slot_id", "Slot ID"],
  ["slot_type", "Slot Type"], ["ingredient_name", "Ingredient / Item Name"], ["current_quantity", "Current Quantity"],
  ["unit", "Unit"], ["current_level_pct", "Current Level %"], ["full_capacity", "Full Capacity"],
  ["expiry_date", "Expiry Date"], ["replacement_due_date", "Replacement Due Date"], ["current_bin_id", "Current Bin ID"],
  ["current_bin_qr_code_id", "Current Bin QR Code ID"], ["priority", "Priority"], ["created_at", "Alert Created Time"],
];

export default function AlertDetailModal({ alert, open, onOpenChange, operationsStaffOptions = [], onChanged }) {
  const [staff, setStaff] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  if (!alert) return null;

  const fmt = (key, val) => {
    if (val == null || val === "") return "\u2014";
    if (key === "created_at" || key.includes("date")) {
      const d = new Date(val);
      return isNaN(d.getTime()) ? val : d.toLocaleString();
    }
    if (key === "current_level_pct") return `${val}%`;
    return String(val);
  };

  const act = async (fn, successMsg) => {
    setLoading(true);
    try {
      await fn();
      toast({ title: successMsg });
      onChanged && onChanged();
    } catch (e) {
      toast({ title: "Action failed", description: formatApiError(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const assignStaffOnly = () => act(() => api.post(`/alerts/${alert.id}/assign-staff-only`, { operations_staff: staff }), "Operations Staff assigned");
  const createKitchenTicketOnly = () => act(() => api.post(`/alerts/${alert.id}/create-kitchen-ticket-only`), "Kitchen Fill Ticket created");
  const assignAndCreate = () => act(() => api.post(`/alerts/${alert.id}/assign`, { operations_staff: staff, create_kitchen_ticket: true }), "Task assigned and Kitchen ticket created");

  const isOpen = alert.status === "Open";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-bone max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="alert-detail-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Alert Detail <StatusBadge status={alert.status} />
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          {FIELD_LABELS.map(([key, label]) => (
            <div key={key} data-testid={`alert-detail-field-${key}`}>
              <p className="text-xs text-ink/60">{label}</p>
              <p className="font-mono text-ink font-medium">{fmt(key, alert[key])}</p>
            </div>
          ))}
        </div>

        <div>
          <p className="text-xs text-ink/60 mb-1">Recipes Affected</p>
          <div className="flex flex-wrap gap-1">
            {(alert.recipes_affected || []).map((r) => (
              <span key={r} className="text-xs bg-oat border border-clay/40 rounded-full px-2 py-0.5">{r}</span>
            ))}
            {(!alert.recipes_affected || alert.recipes_affected.length === 0) && <span className="text-xs text-ink/50">None</span>}
          </div>
        </div>

        <div>
          <p className="text-xs text-ink/60 mb-1">Suggested Action</p>
          <p className="text-sm bg-oat border border-clay/40 rounded-md p-2" data-testid="alert-detail-suggested-action">{alert.suggested_action}</p>
        </div>

        {isOpen && (
          <div className="space-y-2 border-t border-stone pt-3">
            <p className="text-xs text-ink/60">Select Operations Staff</p>
            <SearchableSelect
              options={operationsStaffOptions}
              value={staff}
              onChange={setStaff}
              placeholder="Choose Operations Staff"
              testId="alert-detail-staff-select"
            />
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2 border-t border-stone">
          <Button disabled={!isOpen || !staff || loading} onClick={assignStaffOnly} data-testid="alert-detail-assign-staff-btn" variant="outline">
            Assign Operations Staff
          </Button>
          <Button disabled={!isOpen || loading} onClick={createKitchenTicketOnly} data-testid="alert-detail-create-ticket-btn" variant="outline">
            Create Kitchen Fill Ticket
          </Button>
          <Button disabled={!isOpen || !staff || loading} onClick={assignAndCreate} data-testid="alert-detail-assign-and-create-btn" className="bg-beet hover:bg-beet-hover text-bone">
            Assign and Create Kitchen Ticket
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)} data-testid="alert-detail-close-btn">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
