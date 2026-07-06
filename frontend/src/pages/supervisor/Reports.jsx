import React, { useEffect, useState } from "react";
import PageHeader from "@/components/shared/PageHeader";
import ReportViewer from "@/components/shared/ReportViewer";
import api from "@/lib/api";

export default function SupReports() {
  const [reportList, setReportList] = useState([]);
  useEffect(() => { api.get("/reports/list").then(({ data }) => setReportList(data.operations_reports)); }, []);

  return (
    <div data-testid="supervisor-reports-page">
      <PageHeader title="Reports" description="Operations reports with filters, KPIs, and CSV export" />
      {reportList.length > 0 && <ReportViewer reportList={reportList} testId="supervisor-report-viewer" />}
    </div>
  );
}
