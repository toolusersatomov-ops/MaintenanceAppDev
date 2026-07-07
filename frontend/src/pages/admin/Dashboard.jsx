import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/shared/PageHeader";
import { useToast } from "@/hooks/use-toast";
import api, { formatApiError } from "@/lib/api";
import { RefreshCw, Database, Sparkles } from "lucide-react";

const KEY_COLLECTIONS = [
  ["users", "Users"], ["machines", "Machines"], ["machine_slots", "Machine Slots"],
  ["ingredient_master", "Ingredients"], ["recipe_master", "Recipes"], ["alerts", "Alerts"],
  ["bin_replacement_tasks", "Replacement Tasks"], ["pickup_tasks", "Pickup Tasks"],
  ["kitchen_preparation_requests", "Kitchen Requests"], ["bulk_replacement_orders", "Bulk Orders"],
  ["dirty_bin_returns", "Dirty Bin Returns"], ["cleaning_tasks", "Cleaning Tasks"],
  ["sales_orders", "Sales Orders"], ["activity_logs", "Activity Logs"],
];

export default function AdminDashboard() {
  const [counts, setCounts] = useState({});
  const [resetting, setResetting] = useState(false);
  const { toast } = useToast();

  const loadStatus = () => api.get("/admin/mock-data/status").then(({ data }) => setCounts(data)).catch(() => {});
  useEffect(() => { loadStatus(); }, []);

  const demoReset = async () => {
    if (!window.confirm("Reset all workflow data and restore the full demo state? This wipes tasks, alerts, bins and sales, then reseeds everything including the demo scenarios.")) return;
    setResetting(true);
    try {
      await api.post("/admin/mock-data/reset");
      toast({ title: "Demo state restored", description: "All demo scenarios reseeded. Every role dashboard is presentation-ready." });
      await loadStatus();
    } catch (e) {
      toast({ title: "Reset failed", description: formatApiError(e), variant: "destructive" });
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="admin-dashboard">
      <PageHeader title="Admin Dashboard" description="System data management and demo controls" />

      <Card className="border-beet/40" data-testid="demo-reset-card">
        <CardContent className="p-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-4 w-4 text-beet" />
              <h2 className="font-display font-bold text-ink">Demo Reset</h2>
            </div>
            <p className="text-sm text-ink/60">
              One click restores the exact demo state: bulk pre-schedule order on M004, mid-flow Coconut Milk task,
              a completed Strawberry replacement with full timeline, bins in the cleaning lifecycle, an in-progress
              machine cleaning, an open change request and fresh alerts. Use right before a live presentation.
            </p>
          </div>
          <Button onClick={demoReset} disabled={resetting} data-testid="demo-reset-btn" className="shrink-0">
            <RefreshCw className={`h-4 w-4 mr-2 ${resetting ? "animate-spin" : ""}`} />
            {resetting ? "Restoring…" : "Reset Demo Data"}
          </Button>
        </CardContent>
      </Card>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <Database className="h-4 w-4 text-ink/60" />
          <h2 className="font-display font-bold text-ink">Data Status</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" data-testid="data-status-grid">
          {KEY_COLLECTIONS.map(([key, label]) => (
            <Card key={key}>
              <CardContent className="p-4">
                <p className="text-2xl font-bold text-ink" data-testid={`count-${key}`}>{counts[key] ?? "–"}</p>
                <p className="text-xs text-ink/60 mt-1">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
