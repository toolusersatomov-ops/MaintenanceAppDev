import React, { useEffect, useState } from "react";
import { ClipboardList, Wrench, PackageSearch, CheckCircle2 } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import KPICard from "@/components/shared/KPICard";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";

export default function TechDashboard() {
  const { user } = useAuth();
  const [wos, setWos] = useState([]);
  const [parts, setParts] = useState([]);

  useEffect(() => {
    api.get(`/maintenance/work-orders?technician=${user.username}`).then(({ data }) => setWos(data));
    api.get(`/maintenance/spare-parts-requests?technician=${user.username}`).then(({ data }) => setParts(data));
  }, [user.username]);

  return (
    <div data-testid="technician-dashboard-page">
      <PageHeader title="Technician Dashboard" description={`Welcome, ${user.name}`} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Assigned Work Orders" value={wos.length} icon={ClipboardList} />
        <KPICard label="Active Repairs" value={wos.filter((w) => !["Closed"].includes(w.status)).length} icon={Wrench} accent />
        <KPICard label="Spare Part Requests" value={parts.length} icon={PackageSearch} />
        <KPICard label="Closed Work Orders" value={wos.filter((w) => w.status === "Closed").length} icon={CheckCircle2} />
      </div>
    </div>
  );
}
