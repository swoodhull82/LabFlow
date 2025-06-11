
"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart, CalendarClock, CheckCircle2, ClipboardList, AlertTriangle, Zap, Users, TrendingUp } from "lucide-react";
import { Bar, BarChart as RechartsBarChart, Line, LineChart as RechartsLineChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import { ChartConfig, ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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

const taskStatusChartConfig = {
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

const activeTasksByEmployeeData = [
  { employee: 'Dr. Vance', activeTasks: 5, fill: "hsl(var(--chart-1))" },
  { employee: 'M. Chen', activeTasks: 3, fill: "hsl(var(--chart-2))" },
  { employee: 'A. Khan', activeTasks: 4, fill: "hsl(var(--chart-3))" },
  { employee: 'J. Smith', activeTasks: 2, fill: "hsl(var(--chart-4))" },
  { employee: 'J. Doe', activeTasks: 6, fill: "hsl(var(--chart-5))" },
];

const employeeTasksChartConfig = {
  activeTasks: {
    label: "Active Tasks",
  },
  'Dr. Vance': { color: "hsl(var(--chart-1))" },
  'M. Chen': { color: "hsl(var(--chart-2))" },
  'A. Khan': { color: "hsl(var(--chart-3))" },
  'J. Smith': { color: "hsl(var(--chart-4))" },
  'J. Doe': {  color: "hsl(var(--chart-5))" },
} satisfies ChartConfig;

const monthlyTaskCompletionData = [
  { month: "Jan '24", total: 50, completed: 35, rate: 70 },
  { month: "Feb '24", total: 45, completed: 30, rate: 66.67 },
  { month: "Mar '24", total: 60, completed: 50, rate: 83.33 },
  { month: "Apr '24", total: 55, completed: 40, rate: 72.73 },
  { month: "May '24", total: 65, completed: 58, rate: 89.23 },
  { month: "Jun '24", total: 70, completed: 60, rate: 85.71 },
].map(item => ({ ...item, rate: parseFloat(item.rate.toFixed(1)) })); // Ensure rate is a number

const monthlyCompletionChartConfig = {
  rate: {
    label: "Completion Rate (%)",
    color: "hsl(var(--chart-2))", // Using a different chart color
  },
  completed: { label: "Completed" }, // For tooltip
  total: { label: "Total Due" }, // For tooltip
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
            <ChartContainer config={taskStatusChartConfig} className="h-[300px] w-full">
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
              <Users className="mr-2 h-5 w-5 text-primary" />
              Active Tasks by Employee
            </CardTitle>
            <CardDescription>Breakdown of active tasks per employee.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={employeeTasksChartConfig} className="h-[300px] w-full">
              <RechartsBarChart data={activeTasksByEmployeeData} margin={{top: 5, right: 20, left: 0, bottom: 5}}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="employee" type="category" />
                <YAxis dataKey="activeTasks" type="number" allowDecimals={false} />
                <Tooltip cursor={{fill: 'hsl(var(--muted))'}} content={<ChartTooltipContent />} />
                <Bar dataKey="activeTasks" radius={[4, 4, 0, 0]} />
              </RechartsBarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="shadow-md md:col-span-2">
          <CardHeader>
            <CardTitle className="font-headline flex items-center">
              <TrendingUp className="mr-2 h-5 w-5 text-primary" />
              Monthly Task Completion Rate
            </CardTitle>
            <CardDescription>Trend of task completion based on due dates.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={monthlyCompletionChartConfig} className="h-[300px] w-full">
              <RechartsLineChart data={monthlyTaskCompletionData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" />
                <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload; // Access the full data point
                      return (
                        <div className="p-2 rounded-md border bg-background shadow-lg">
                          <p className="font-medium text-sm">{label}</p>
                          <p className="text-xs text-muted-foreground">
                            Completed: {data.completed} / {data.total}
                          </p>
                          <p className="text-xs" style={{ color: payload[0].color }}>
                            Rate: {data.rate}%
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                  cursor={{fill: 'hsl(var(--muted))'}}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="rate" 
                  stroke="hsl(var(--chart-2))" 
                  strokeWidth={2} 
                  dot={{ r: 4, fill: "hsl(var(--chart-2))" }} 
                  activeDot={{ r: 6, fill: "hsl(var(--chart-2))"}} 
                  name="Completion Rate" 
                />
              </RechartsLineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="shadow-md md:col-span-2"> {/* Updated to md:col-span-2 */}
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
                    <AvatarImage data-ai-hint="person avatar" src={`https://placehold.co/40x40.png?text=${String.fromCharCode(65 + i)}`} />
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

