import React, { useEffect, useState } from "react";
import {
  Boxes, ClipboardList, ShieldCheck, ShieldAlert, Settings, Siren, Wrench, PackageSearch,
  CheckCircle2, Package, Bell,
} from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import KPICard from "@/components/shared/KPICard";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";

export default function TechDashboard() {
  const { user } = useAuth();
  const [d, setD] = useState(null);

  useEffect(() => { api.get("/maintenance/dashboard").then(({ data }) => setD(data)); }, []);
  const v = (key) => (d ? d[key] : "\u2014");

  return (
    <div data-testid="technician-dashboard-page">
      <PageHeader title="Technician Dashboard" description={`Welcome, ${user?.name} \u00b7 technical work assigned to you`} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Assigned Machines" value={v("assigned_machines")} icon={Boxes} to="/technician/my-machines" testId="kpi-assigned-machines" />
        <KPICard label="Open Work Orders" value={v("open_work_orders")} icon={ClipboardList} accent to="/technician/work-orders?active=1" testId="kpi-open-work-orders" />
        <KPICard label="PM Due" value={v("pm_due")} icon={ShieldCheck} to="/technician/preventive-maintenance?status=Due" testId="kpi-pm-due" />
        <KPICard label="PM Overdue" value={v("pm_overdue")} icon={ShieldAlert} accent to="/technician/preventive-maintenance?status=Overdue" testId="kpi-pm-overdue" />
        <KPICard label="Calibration Due" value={v("calibration_due")} icon={Settings} to="/technician/calibration-testing?result=FAIL" testId="kpi-calibration-due" />
        <KPICard label="Critical Technical Alerts" value={v("critical_alerts")} icon={Siren} accent to="/technician/my-machines?severity=Critical" testId="kpi-critical-alerts" />
        <KPICard label="Breakdown Repairs" value={v("breakdown_repairs")} icon={Wrench} to="/technician/breakdown-repair" testId="kpi-breakdown-repairs" />
        <KPICard label="Waiting for Parts" value={v("waiting_for_parts")} icon={PackageSearch} to="/technician/work-orders?status=Waiting%20for%20Parts" testId="kpi-waiting-for-parts" />
        <KPICard label="Completed Today" value={v("completed_today")} icon={CheckCircle2} to="/technician/service-history" testId="kpi-completed-today" />
        <KPICard label="Spare Parts On Hand" value={v("spare_parts_on_hand")} icon={Package} to="/technician/spare-parts" testId="kpi-spare-parts-on-hand" />
        <KPICard label="Notifications" value={v("notifications")} icon={Bell} to="/technician/notifications" testId="kpi-notifications" />
      </div>
    </div>
  );
}
