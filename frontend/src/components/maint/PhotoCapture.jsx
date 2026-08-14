import React from "react";
import { Camera, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// Simulated photo capture (mock upload, same pattern as the rest of the app).
export default function PhotoCapture({ label = "Capture Photo", value, onCapture, testId, slug = "photo" }) {
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-testid={testId || `photo-capture-${slug}`}
        onClick={() => onCapture(`mock://${slug}-${Date.now()}.jpg`)}
        className="gap-2"
      >
        <Camera className="h-4 w-4" /> {value ? "Retake" : label}
      </Button>
      {value && (
        <span className="inline-flex items-center gap-1 text-xs text-green-700 font-mono" data-testid={`${testId || slug}-captured`}>
          <CheckCircle2 className="h-3.5 w-3.5" /> photo attached
        </span>
      )}
    </div>
  );
}
