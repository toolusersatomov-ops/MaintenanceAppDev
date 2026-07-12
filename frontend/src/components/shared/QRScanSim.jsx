import React, { useState } from "react";
import { QrCode, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

// Simulated QR scan: opens a dialog listing valid QR codes to "tap to scan".
// options: [{qr_code_id, label, sublabel}]
export default function QRScanSim({ options = [], onScan, triggerLabel = "Open Camera / Scan QR", disabled, testId, large = true, emptyText = "No items available to scan right now.", demoNote = "Demo Mode: Select a QR from the list to simulate scanning. In the real machine flow, the camera will scan the physical bin QR and automatically update the matching item." }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        data-testid={testId || "qr-scan-trigger"}
        className={large ? "w-full py-4 text-base font-bold min-h-[56px] flex items-center justify-center gap-2 bg-beet hover:bg-beet-hover text-bone" : "bg-beet hover:bg-beet-hover text-bone"}
      >
        <QrCode className="h-5 w-5" /> {triggerLabel}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-bone max-h-[80vh] overflow-y-auto" data-testid={`${testId || "qr-scan"}-dialog`}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ScanLine className="h-5 w-5 text-beet" /> Simulated QR Scanner</DialogTitle>
            <DialogDescription>Tap a QR code below to simulate scanning it with the camera.</DialogDescription>
          </DialogHeader>
          {demoNote && (
            <p className="text-xs text-ink/70 bg-stone/40 border border-stone rounded-md p-2" data-testid="qr-scan-demo-note">{demoNote}</p>
          )}
          <div className="space-y-2">
            {options.length === 0 && <p className="text-sm text-ink/60 py-4 text-center" data-testid="qr-scan-empty">{emptyText}</p>}
            {options.map((opt) => (
              <button
                key={opt.qr_code_id}
                data-testid={`qr-option-${opt.qr_code_id}`}
                onClick={() => {
                  onScan(opt.qr_code_id);
                  setOpen(false);
                }}
                className="w-full text-left p-3 rounded-md border border-clay/40 bg-oat hover:bg-stone/40 transition-colors flex items-center justify-between gap-2"
              >
                <div>
                  <p className="text-sm font-semibold text-ink">{opt.label}</p>
                  {opt.sublabel && <p className="text-xs text-ink/60 font-mono">{opt.sublabel}</p>}
                </div>
                <span className="text-xs font-mono text-beet">{opt.qr_code_id}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
