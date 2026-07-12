import React, { useEffect, useState } from "react";
import { ShieldAlert, ClipboardList, PackageSearch, Activity } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import KPICard from "@/components/shared/KPICard";
import api from "@/lib/api";

export default function MSDashboard() {
  const [alerts, setAlerts] = useState([]);
  const [wos, setWos] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [health, setHealth] = useState([]);

  useEffect(() => {
    api.get("/maintenance/technical-alerts?status=Open").then(({ data }) => setAlerts(data));
    api.get("/maintenance/work-orders").then(({ data }) => setWos(data));
    api.get("/maintenance/spare-parts-approvals").then(({ data }) => setApprovals(data));
    api.get("/maintenance/health").then(({ data }) => setHealth(data));
  }, []);

  const avgHealth = health.length ? Math.round(health.reduce((s, h) => s + h.health_score, 0) / health.length) : 0;

  return (
    <div data-testid="maintenance-supervisor-dashboard-page">
      <PageHeader title="Maintenance Supervisor Dashboard" description="Technical alerts, work orders, and machine health overview" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Open Technical Alerts" value={alerts.length} icon={ShieldAlert} accent to="/maintenance-supervisor/technical-alerts" />
        <KPICard label="Open Work Orders" value={wos.filter((w) => w.status !== "Closed").length} icon={ClipboardList} to="/maintenance-supervisor/work-orders" />
        <KPICard label="Pending Spare Part Approvals" value={approvals.length} icon={PackageSearch} to="/maintenance-supervisor/spare-parts-approvals" />
        <KPICard label="Avg Machine Health Score" value={avgHealth} suffix="/100" icon={Activity} to="/maintenance-supervisor/machine-health" />
      </div>
    </div>
  );
}
