import React, { useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import WorkOrderCard from "@/components/technician/WorkOrderCard";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";

export default function TechWorkOrders() {
  const { user } = useAuth();
  const [wos, setWos] = useState([]);

  const load = useCallback(() => {
    api.get(`/maintenance/work-orders?technician=${user.username}`).then(({ data }) => setWos(data.filter((w) => w.status !== "Closed")));
  }, [user.username]);
  useEffect(() => { load(); }, [load]);

  return (
    <div data-testid="tech-work-orders-page">
      <PageHeader title="Assigned Work Orders" description="Work orders assigned to you by the Maintenance Supervisor" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {wos.map((wo) => <WorkOrderCard key={wo.id} wo={wo} onRefresh={load} />)}
        {wos.length === 0 && <p className="text-sm text-ink/60" data-testid="tech-work-orders-empty">No active work orders assigned to you.</p>}
      </div>
    </div>
  );
}
