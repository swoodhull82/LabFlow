
"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import GanttChart from "@/components/gantt/GanttChart";

export default function ValidationsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-headline font-semibold">Validation Projects</h1>
      </div>
      <p className="text-muted-foreground">
        Visualize validation project schedules, milestones, and dependencies.
        <span className="text-xs block mt-1">Note: Drag-and-drop rescheduling and dependency linking are supported for Validation Projects.</span>
      </p>

      <Card className="shadow-md">
        <CardHeader>
          {/* Button moved into GanttChart header */}
        </CardHeader>
        <CardContent className="overflow-x-auto p-0 md:p-6">
          <GanttChart filterTaskType="VALIDATION_PROJECT" displayHeaderControls="addValidationButton" />
        </CardContent>
      </Card>
    </div>
  );
}
