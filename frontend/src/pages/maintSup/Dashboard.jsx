import React, { useEffect, useState } from "react";
import {
  Boxes, HeartPulse, AlertTriangle, ShieldAlert, PowerOff, Wrench, ClipboardList, ShieldCheck,
  CalendarClock, Settings, XCircle, PackageSearch, Activity, CheckCircle2, ClipboardCheck, Siren,
} from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import KPICard from "@/components/shared/KPICard";
import api from "@/lib/api";

const MH = "/maintenance-supervisor";

export default function MSDashboard() {
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/maintenance-sup/dashboard").then(({ data }) => setD(data)); }, []);
  const v = (k) => (d ? d[k] : "\u2014");

  return (
    <div data-testid="maintenance-supervisor-dashboard-page">
      <PageHeader title="Maintenance Supervisor Dashboard" description="Fleet technical health, work orders and technician activity" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Total Machines" value={v("total_machines")} icon={Boxes} to={`${MH}/machine-health`} testId="kpi-total-machines" />
        <KPICard label="Healthy Machines" value={v("healthy_machines")} icon={HeartPulse} to={`${MH}/machine-health?health=Healthy`} testId="kpi-healthy-machines" />
        <KPICard label="Warning Machines" value={v("warning_machines")} icon={AlertTriangle} to={`${MH}/machine-health?health=Warning`} testId="kpi-warning-machines" />
        <KPICard label="Critical Machines" value={v("critical_machines")} icon={ShieldAlert} accent to={`${MH}/machine-health?health=Critical`} testId="kpi-critical-machines" />
        <KPICard label="Machines Down" value={v("machines_down")} icon={PowerOff} accent to={`${MH}/machine-health?health=Down`} testId="kpi-machines-down" />
        <KPICard label="Machines Under Maintenance" value={v("machines_under_maintenance")} icon={Wrench} to={`${MH}/machine-health?health=Under%20Maintenance`} testId="kpi-machines-under-maintenance" />
        <KPICard label="Open Work Orders" value={v("open_work_orders")} icon={ClipboardList} to={`${MH}/work-orders?active=1`} testId="kpi-open-work-orders" />
        <KPICard label="PM Due" value={v("pm_due")} icon={ShieldCheck} to={`${MH}/pm-planner?status=Due`} testId="kpi-pm-due" />
        <KPICard label="PM Overdue" value={v("pm_overdue")} icon={CalendarClock} accent to={`${MH}/pm-planner?status=Overdue`} testId="kpi-pm-overdue" />
        <KPICard label="Calibration Due" value={v("calibration_due")} icon={Settings} to={`${MH}/calibration-monitoring?status=Recalibration%20Required`} testId="kpi-calibration-due" />
        <KPICard label="Calibration Failed" value={v("calibration_failed")} icon={XCircle} accent to={`${MH}/calibration-monitoring?result=FAIL`} testId="kpi-calibration-failed" />
        <KPICard label="Waiting for Parts" value={v("waiting_for_parts")} icon={PackageSearch} to={`${MH}/work-orders?status=Waiting%20for%20Parts`} testId="kpi-waiting-for-parts" />
        <KPICard label="Technician Tasks In Progress" value={v("technician_tasks_in_progress")} icon={Activity} to={`${MH}/live-progress`} testId="kpi-tasks-in-progress" />
        <KPICard label="Completed Repairs Today" value={v("completed_repairs_today")} icon={CheckCircle2} to={`${MH}/work-orders?status=Closed`} testId="kpi-completed-today" />
        <KPICard label="Pending Supervisor Review" value={v("pending_supervisor_review")} icon={ClipboardCheck} accent to={`${MH}/work-orders?status=Pending%20Supervisor%20Review`} testId="kpi-pending-review" />
        <KPICard label="Critical Technical Alerts" value={v("critical_technical_alerts")} icon={Siren} accent to={`${MH}/technical-alerts?severity=Critical`} testId="kpi-critical-alerts" />
      </div>
    </div>
  );
}
