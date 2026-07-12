import React, { useEffect, useState } from "react";
import { Cog, Activity, AlertTriangle, Clock, ChefHat, Truck, ListChecks, CheckCircle2, Recycle, Sparkles, DollarSign, Coffee, Trophy, Star } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import KPICard from "@/components/shared/KPICard";
import api from "@/lib/api";

export default function SupDashboard() {
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/supervisor/dashboard").then(({ data }) => setD(data)); }, []);
  if (!d) return null;

  const cards = [
    ["Total Machines", d.total_machines, Cog, "/supervisor/machine-control-center"],
    ["Active Machines", d.active_machines, Activity, "/supervisor/machine-control-center"],
    ["Machines with Low Stock", d.machines_low_stock, AlertTriangle, "/supervisor/alerts?type=Low Stock"],
    ["Near Expiry Alerts", d.near_expiry_alerts, Clock, "/supervisor/alerts?type=Near Expiry"],
    ["Pending Kitchen Preparation", d.pending_kitchen_preparation, ChefHat, "/supervisor/kitchen-preparation-status?status=Pending"],
    ["Pending Operations Tasks", d.pending_operations_tasks, Truck, "/supervisor/operations-staff-tasks"],
    ["Tasks In Progress", d.tasks_in_progress, ListChecks, "/supervisor/live-task-progress"],
    ["Completed Today", d.completed_today, CheckCircle2, "/supervisor/live-task-progress?status=Completed"],
    ["Dirty Bins Pending Return", d.dirty_bins_pending_return, Recycle, "/supervisor/operations-staff-tasks"],
    ["Cleaning Pending", d.cleaning_pending, Sparkles, "/supervisor/cleaning-tracking"],
    ["Today Sales", `\u20b9${d.today_sales}`, DollarSign, "/supervisor/reports?tab=sales"],
    ["Cups Sold Today", d.cups_sold_today, Coffee, "/supervisor/reports?tab=sales"],
    ["Top Selling Machine", d.top_selling_machine, Trophy, "/supervisor/reports?tab=sales"],
    ["Top Selling Drink", d.top_selling_drink, Star, "/supervisor/reports?tab=sales"],
  ];

  return (
    <div data-testid="supervisor-dashboard-page">
      <PageHeader title="Operations Supervisor Dashboard" description="Full operational overview across kitchen, field, and machines" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(([label, value, icon, to]) => <KPICard key={label} label={label} value={value} icon={icon} to={to} />)}
      </div>
    </div>
  );
}
