
"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import GanttChart from "@/components/gantt/GanttChart";
import { PlusCircle } from "lucide-react";

export default function ValidationsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-headline font-semibold">Validations</h1>
        <Link href="/tasks/new?defaultType=Validation" passHref>
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" /> Add Validation Task
            </Button>
          </Link>
      </div>
      <p className="text-muted-foreground">
        Visualize validation task schedules, milestones, and dependencies.
        <span className="text-xs block mt-1">Note: Drag-and-drop rescheduling and dependency linking are supported for Validation tasks.</span>
      </p>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="font-headline">Validation Schedule</CardTitle>
          <CardDescription>Overview of validation task timelines and their relationships.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0 md:p-6">
          <GanttChart filterTaskType="Validation" />
        </CardContent>
      </Card>
    </div>
  );
}
