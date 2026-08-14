import React, { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import KPICard from "@/components/shared/KPICard";
import DataTable from "@/components/shared/DataTable";
import api, { API } from "@/lib/api";

// Shared report viewer used by Operations Supervisor, Maintenance Supervisor, and Admin Reports Hub.
// reportList: [[key, label], ...]
export default function ReportViewer({ reportList, testId, extraFilters = [] }) {
  const [activeKey, setActiveKey] = useState(reportList?.[0]?.[0] || "");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [machineId, setMachineId] = useState("");
  const [extra, setExtra] = useState({});
  const [report, setReport] = useState(null);

  useEffect(() => {
    if (reportList?.length && !activeKey) setActiveKey(reportList[0][0]);
  }, [reportList, activeKey]);

  const buildParams = () => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    if (machineId) params.set("machine_id", machineId);
    Object.entries(extra).forEach(([k, v]) => v && params.set(k, v));
    return params;
  };

  useEffect(() => {
    if (!activeKey) return;
    api.get(`/reports/${activeKey}?${buildParams().toString()}`).then(({ data }) => setReport(data));
  }, [activeKey, dateFrom, dateTo, machineId, extra]); // eslint-disable-line react-hooks/exhaustive-deps

  const exportUrl = () => `${API}/reports/${activeKey}/export?${buildParams().toString()}`;

  return (
    <div data-testid={testId || "report-viewer"}>
      <Tabs value={activeKey} onValueChange={setActiveKey}>
        <TabsList className="bg-oat flex-wrap h-auto">
          {reportList?.map(([key, label]) => (
            <TabsTrigger key={key} value={key} data-testid={`report-tab-${key}`}>{label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap gap-2 my-4 items-center">
        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="bg-bone w-40" data-testid="report-date-from" />
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="bg-bone w-40" data-testid="report-date-to" />
        <Input placeholder="Machine ID (optional)" value={machineId} onChange={(e) => setMachineId(e.target.value)} className="bg-bone w-48" data-testid="report-machine-filter" />
        {extraFilters.map((f) => (
          <select
            key={f.key}
            value={extra[f.key] || ""}
            onChange={(e) => setExtra({ ...extra, [f.key]: e.target.value })}
            data-testid={`report-filter-${f.key}`}
            className="h-10 rounded-md border border-clay/50 bg-bone px-3 text-sm text-ink"
          >
            <option value="">{f.label}</option>
            {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ))}
        <a href={exportUrl()} download data-testid="report-export-csv-btn">
          <Button variant="outline"><Download className="h-4 w-4 mr-2" /> Export CSV</Button>
        </a>
      </div>

      {report && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
            {report.kpis.map((k) => <KPICard key={k.label} label={k.label} value={k.value} />)}
          </div>
          <DataTable
            columns={report.columns.map((c) => ({ key: c, label: c.replace(/_/g, " ").toUpperCase() }))}
            rows={report.rows}
            testId="report-table"
          />
        </>
      )}
    </div>
  );
}
