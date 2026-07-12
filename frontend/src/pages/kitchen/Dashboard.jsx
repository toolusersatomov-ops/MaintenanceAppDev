import React, { useEffect, useState } from "react";
import { ClipboardList, ChefHat, PackageCheck, Sparkles } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import KPICard from "@/components/shared/KPICard";
import api from "@/lib/api";

export default function KitchenDashboard() {
  const [stats, setStats] = useState({ pending: 0, inProgress: 0, ready: 0, cleaning: 0 });

  useEffect(() => {
    const load = async () => {
      const [reqs, cleaning] = await Promise.all([
        api.get("/kitchen/preparation-requests"),
        api.get("/kitchen/cleaning-bins"),
      ]);
      setStats({
        pending: reqs.data.filter((r) => r.status === "Pending").length,
        inProgress: reqs.data.filter((r) => r.status === "In Progress").length,
        ready: reqs.data.filter((r) => r.status === "Saved / Ready for Pickup").length,
        cleaning: (cleaning.data.items || cleaning.data).length,
      });
    };
    load();
  }, []);

  return (
    <div data-testid="kitchen-dashboard-page">
      <PageHeader title="Kitchen Dashboard" description="Preparation tickets received from Supervisor" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Pending Requests" value={stats.pending} icon={ClipboardList} to="/kitchen/preparation-requests" />
        <KPICard label="In Progress" value={stats.inProgress} icon={ChefHat} accent to="/kitchen/bin-filling" />
        <KPICard label="Saved / Ready for Pickup" value={stats.ready} icon={PackageCheck} to="/kitchen/bin-storage" />
        <KPICard label="Bins in Cleaning" value={stats.cleaning} icon={Sparkles} to="/kitchen/cleaning-bins" />
      </div>
    </div>
  );
}
