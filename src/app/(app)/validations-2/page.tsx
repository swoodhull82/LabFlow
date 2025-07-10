
"use client";

import React from "react";
import GoGanttChart from "@/components/gantt/GoGanttChart";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function ValidationsV2Page() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-headline font-semibold">Validation Projects 2.0 (GoJS)</h1>
      </div>
      <p className="text-muted-foreground">
        This page uses a custom GoJS-based Gantt chart implementation.
      </p>

      <Card className="shadow-md">
        <CardHeader>
           <CardTitle className="font-headline">Project Schedule</CardTitle>
          <CardDescription>Visualize project schedules and milestones using GoJS.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0 md:p-6">
          <GoGanttChart />
        </CardContent>
      </Card>
    </div>
  );
}
