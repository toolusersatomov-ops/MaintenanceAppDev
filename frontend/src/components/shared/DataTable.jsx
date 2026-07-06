import React from "react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

// Generic ERP-style data table. columns: [{key, label, render?}]
export default function DataTable({ columns, rows, testId, emptyText = "No records found." }) {
  return (
    <div className="w-full overflow-x-auto rounded-md border border-stone bg-oat" data-testid={testId || "data-table"}>
      <Table>
        <TableHeader>
          <TableRow className="border-stone hover:bg-transparent">
            {columns.map((c) => (
              <TableHead key={c.key} className="text-ink font-semibold whitespace-nowrap">{c.label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={columns.length} className="text-center text-ink/60 py-6" data-testid={`${testId || "data-table"}-empty`}>
                {emptyText}
              </TableCell>
            </TableRow>
          )}
          {rows.map((row, idx) => (
            <TableRow key={row.id || idx} className="border-stone hover:bg-bone/60" data-testid={`${testId || "data-table"}-row-${idx}`}>
              {columns.map((c) => (
                <TableCell key={c.key} className={c.mono ? "font-mono text-sm" : "text-sm"}>
                  {c.render ? c.render(row) : row[c.key]}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
