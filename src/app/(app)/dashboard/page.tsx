"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart, CalendarClock, CheckCircle2, ClipboardList, AlertTriangle, Zap } from "lucide-react";
import { Bar, BarChart as RechartsBarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import { ChartConfig, ChartContainer, ChartTooltipContent } from "@/components/ui/chart";

const taskSummaryData = [
  {
    title: "Active Tasks",
    value: "12",
    icon: Zap,
    description: "Tasks currently in progress.",
    color: "text-blue-500",
    bgColor: "bg-blue-50",
  },
  {
    title: "Overdue Tasks",
    value: "3",
    icon: AlertTriangle,
    description: "Tasks past their due date.",
    color: "text-red-500",
    bgColor: "bg-red-50",
  },
  {
    title: "Upcoming Tasks",
    value: "8",
    icon: CalendarClock,
    description: "Tasks due in the next 7 days.",
    color: "text-yellow-500",
    bgColor: "bg-yellow-50",
  },
  {
    title: "Completed Today",
    value: "5",
    icon: CheckCircle2,
    description: "Tasks marked as done today.",
    color: "text-green-500",
    bgColor: "bg-green-50",
  },
];

const taskDistributionData = [
  { status: 'To Do', count: 25, fill: "hsl(var(--chart-1))" },
  { status: 'In Progress', count: 12, fill: "hsl(var(--chart-2))" },
  { status: 'Blocked', count: 5, fill: "hsl(var(--chart-3))" },
  { status: 'Done', count: 58, fill: "hsl(var(--chart-4))" },
];

const chartConfig = {
  count: {
    label: "Tasks",
  },
  "To Do": {
    label: "To Do",
    color: "hsl(var(--chart-1))",
  },
  "In Progress": {
    label: "In Progress",
    color: "hsl(var(--chart-2))",
  },
  "Blocked": {
    label: "Blocked",
    color: "hsl(var(--chart-3))",
  },
  "Done": {
    label: "Done",
    color: "hsl(var(--chart-4))",
  },
} satisfies ChartConfig;


export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-headline font-semibold">Dashboard</h1>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {taskSummaryData.map((item) => (
          <Card key={item.title} className="shadow-md hover:shadow-lg transition-shadow duration-300">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{item.title}</CardTitle>
              <item.icon className={`h-5 w-5 ${item.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{item.value}</div>
              <p className="text-xs text-muted-foreground">{item.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="font-headline flex items-center">
              <BarChart className="mr-2 h-5 w-5 text-primary" />
              Task Status Distribution
            </CardTitle>
            <CardDescription>Overview of tasks by their current status.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <RechartsBarChart data={taskDistributionData} layout="vertical" margin={{left:10, right:30}}>
                <CartesianGrid horizontal={false} />
                <XAxis type="number" dataKey="count" />
                <YAxis dataKey="status" type="category" tickLine={false} axisLine={false} />
                <Tooltip cursor={{fill: 'hsl(var(--muted))'}} content={<ChartTooltipContent hideLabel />} />
                <Legend />
                <Bar dataKey="count" radius={4} />
              </RechartsBarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="font-headline flex items-center">
              <ClipboardList className="mr-2 h-5 w-5 text-primary" />
              Recent Activity
            </CardTitle>
            <CardDescription>Latest updates and task changes.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <li key={i} className="flex items-start space-x-3 p-2 rounded-md hover:bg-muted">
                  <Avatar className="h-8 w-8 mt-1">
                    <AvatarImage src={`https://placehold.co/40x40.png?text=${String.fromCharCode(65 + i)}`} />
                    <AvatarFallback>{String.fromCharCode(65 + i)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">
                      User {String.fromCharCode(65 + i)} completed task "Research new reagent".
                    </p>
                    <p className="text-xs text-muted-foreground">2 hours ago</p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
