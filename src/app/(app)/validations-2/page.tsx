"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { GanttChart } from "@/components/ui/gantt-chart";

export default function ValidationsV2Page() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-headline font-semibold">Validation Projects 2.0</h1>
      </div>
      <p className="text-muted-foreground">
        This is the new validations page using the standardized shadcn/ui Gantt Chart component.
      </p>

      <Card className="shadow-md">
        <CardHeader>
           <CardTitle className="font-headline">Project Schedule</CardTitle>
          <CardDescription>Visualize validation project schedules and milestones. Drag bars to reschedule or link them to create dependencies.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0 md:p-6">
          <GanttChart filterTaskType="VALIDATION_PROJECT" displayHeaderControls="addValidationButton" />
        </CardContent>
      </Card>
    </div>
  );
}
