
"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import GanttChart from "@/components/gantt/GanttChart";

export default function TimelinePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl md:text-3xl font-headline font-semibold">Timeline / Gantt Chart</h1>
      <p className="text-muted-foreground">
        Visualize task schedules, dependencies, and progress across all non-validation projects.
      </p>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="font-headline">Project Schedule</CardTitle>
          <CardDescription>Overview of standard task timelines. Drag bars to reschedule or link them to create dependencies.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0 md:p-6">
          <GanttChart filterTaskType="ALL_EXCEPT_VALIDATION" />
        </CardContent>
      </Card>
    </div>
  );
}
