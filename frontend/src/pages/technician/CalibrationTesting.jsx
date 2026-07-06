import React, { useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import WorkOrderCard from "@/components/technician/WorkOrderCard";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";

export default function CalibrationTesting() {
  const { user } = useAuth();
  const [wos, setWos] = useState([]);

  const load = useCallback(() => {
    api.get(`/maintenance/work-orders?technician=${user.username}`).then(({ data }) =>
      setWos(data.filter((w) => ["Repair Started", "Testing Completed"].includes(w.stage)))
    );
  }, [user.username]);
  useEffect(() => { load(); }, [load]);

  return (
    <div data-testid="calibration-testing-page">
      <PageHeader title="Calibration & Testing" description="Work orders ready for final calibration and testing before submitting for review" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {wos.map((wo) => <WorkOrderCard key={wo.id} wo={wo} onRefresh={load} />)}
        {wos.length === 0 && <p className="text-sm text-ink/60" data-testid="calibration-testing-empty">No work orders ready for calibration/testing.</p>}
      </div>
    </div>
  );
}
