import React, { useState } from "react";
import { Undo2, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export default function RecentScanPanel({ scan, onConfirm, onUndo }) {
  const [comment, setComment] = useState("");
  const [showUndo, setShowUndo] = useState(false);

  if (!scan) return null;

  return (
    <Card className="bg-oat border-beet/40" data-testid="recent-scan-action-panel">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-beet" /> Recent Scan Action</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="grid grid-cols-2 gap-2 font-mono text-xs">
          <div><span className="text-ink/60">Scanned QR:</span> {scan.qr_code_id}</div>
          <div><span className="text-ink/60">Affected Record:</span> {scan.affected_record_type}</div>
          <div><span className="text-ink/60">Status Updated:</span> {scan.status_before} &rarr; {scan.status_after}</div>
          <div><span className="text-ink/60">Scanned By:</span> {scan.scanned_by}</div>
          <div className="col-span-2"><span className="text-ink/60">Date/Time:</span> {new Date(scan.scanned_at).toLocaleString()}</div>
        </div>
        {!showUndo ? (
          <div className="flex gap-2 pt-2">
            <Button size="sm" data-testid="recent-scan-confirm-btn" className="bg-beet hover:bg-beet-hover text-bone" onClick={() => onConfirm(scan.id)}>
              Confirm Scan
            </Button>
            <Button size="sm" variant="outline" data-testid="recent-scan-undo-btn" onClick={() => setShowUndo(true)}>
              <Undo2 className="h-4 w-4 mr-1" /> Undo / Wrong Scan
            </Button>
          </div>
        ) : (
          <div className="space-y-2 pt-2">
            <Textarea
              placeholder="Add correction comment..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              data-testid="recent-scan-correction-comment"
              className="bg-bone"
            />
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" data-testid="recent-scan-undo-confirm-btn" onClick={() => onUndo(scan.id, comment)}>
                Confirm Undo
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowUndo(false)} data-testid="recent-scan-undo-cancel-btn">
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
