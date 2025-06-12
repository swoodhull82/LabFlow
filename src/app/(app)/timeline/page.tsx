
"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import GanttChart from "@/components/gantt/GanttChart";

export default function TimelinePage() {
  // Data fetching logic is now moved to GanttChart.tsx
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-headline font-semibold">Timeline / Gantt Chart</h1>
      <p className="text-muted-foreground">
        Visualize task schedules and progress. 
        <span className="text-xs block mt-1">Note: Advanced features like drag-and-drop rescheduling and dependency linking are planned for future updates.</span>
      </p>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="font-headline">Project Schedule</CardTitle>
          <CardDescription>Overview of task timelines.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0 md:p-6">
          <GanttChart />
        </CardContent>
      </Card>
    </div>
  );
}
