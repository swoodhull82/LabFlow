
"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart, CalendarClock, CheckCircle2, AlertTriangle, Zap, Users, TrendingUp, Loader2 } from "lucide-react";
import { Bar, BarChart as RechartsBarChart, Line, LineChart as RechartsLineChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import { ChartConfig, ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { getTasks } from "@/services/taskService";
import { getEmployees } from "@/services/employeeService"; // Import employee service
import type { Task, TaskStatus, Employee } from "@/lib/types"; // Import Employee type
import { useToast } from "@/hooks/use-toast";
import { format, isPast, isToday, addDays, startOfDay } from "date-fns";
import type PocketBase from "pocketbase";

interface TaskSummaryItem {
  title: string;
  value: string;
  icon: React.ElementType;
  description: string;
  color: string;
  bgColor: string;
}

interface LiveEmployeeTaskData {
  employee: string;
  activeTasks: number;
  fill?: string; // Optional: if you want to dynamically assign fills later
}

const initialTaskSummaryData: TaskSummaryItem[] = [
  { title: "Active Tasks", value: "0", icon: Zap, description: "Tasks currently in progress or to do.", color: "text-blue-500", bgColor: "bg-blue-50" },
  { title: "Overdue Tasks", value: "0", icon: AlertTriangle, description: "Tasks past their due date.", color: "text-red-500", bgColor: "bg-red-50" },
  { title: "Upcoming Tasks", value: "0", icon: CalendarClock, description: "Tasks due in the next 7 days.", color: "text-yellow-500", bgColor: "bg-yellow-50" },
  { title: "Completed Today", value: "0", icon: CheckCircle2, description: "Tasks marked as done today.", color: "text-green-500", bgColor: "bg-green-50" },
];

const taskStatusChartConfig = {
  count: { label: "Tasks" },
  "To Do": { label: "To Do", color: "hsl(var(--chart-1))" },
  "In Progress": { label: "In Progress", color: "hsl(var(--chart-2))" },
  "Blocked": { label: "Blocked", color: "hsl(var(--chart-3))" },
  "Done": { label: "Done", color: "hsl(var(--chart-4))" },
  "Overdue": { label: "Overdue", color: "hsl(var(--chart-5))" },
} satisfies ChartConfig;

// Simplified config for employee tasks chart, color will be driven by the Bar component's fill or theme
const employeeTasksChartConfig = {
  activeTasks: { label: "Active Tasks", color: "hsl(var(--chart-2))" }, // A single color for all bars
} satisfies ChartConfig;

const monthlyTaskCompletionData = [
  { month: "Jan '24", total: 50, completed: 35, rate: 70 },
  { month: "Feb '24", total: 45, completed: 30, rate: 66.67 },
  { month: "Mar '24", total: 60, completed: 50, rate: 83.33 },
  { month: "Apr '24", total: 55, completed: 40, rate: 72.73 },
  { month: "May '24", total: 65, completed: 58, rate: 89.23 },
  { month: "Jun '24", total: 70, completed: 60, rate: 85.71 },
].map(item => ({ ...item, rate: parseFloat(item.rate.toFixed(1)) }));

const monthlyCompletionChartConfig = {
  rate: { label: "Completion Rate (%)", color: "hsl(var(--chart-2))" },
  completed: { label: "Completed" },
  total: { label: "Total Due" },
} satisfies ChartConfig;

const getDetailedErrorMessage = (error: any, context: string = "dashboard data"): string => {
  let message = `An unexpected error occurred while fetching ${context}.`;
  if (error && typeof error === 'object') {
    if (error.data && typeof error.data === 'object' && error.data.message && typeof error.data.message === 'string') {
      message = error.data.message;
    } else if (error.message && typeof error.message === 'string' && !(error.message.startsWith("PocketBase_ClientResponseError"))) {
      message = error.message;
    } else if (error.originalError && typeof error.originalError.message === 'string') {
        message = error.originalError.message;
    } else if (error.message && typeof error.message === 'string') {
      message = error.message;
    }
    if ('status' in error) {
      const status = error.status;
      const collectionName = context.includes("tasks") ? "tasks" : context.includes("employees") ? "employees" : "data";
      if (status === 404) message = `The '${collectionName}' collection was not found (404). ${message}`;
      else if (status === 403) message = `You do not have permission to view ${collectionName} (403). ${message}`;
    }
  } else if (typeof error === 'string') {
    message = error;
  }
  return message;
};

export default function DashboardPage() {
  const { pbClient } = useAuth();
  const { toast } = useToast();

  const [taskSummaryData, setTaskSummaryData] = useState<TaskSummaryItem[]>(initialTaskSummaryData);
  const [taskDistributionData, setTaskDistributionData] = useState<{ status: string; count: number; fill: string; }[]>([]);
  const [activeTasksByEmployeeData, setActiveTasksByEmployeeData] = useState<LiveEmployeeTaskData[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const chartFills: Record<TaskStatus | string, string> = {
    'To Do': "hsl(var(--chart-1))",
    'In Progress': "hsl(var(--chart-2))",
    'Blocked': "hsl(var(--chart-3))",
    'Done': "hsl(var(--chart-4))",
    'Overdue': "hsl(var(--chart-5))", 
  };
  
  const processData = useCallback((allTasks: Task[], allEmployees: Employee[]) => {
    const today = startOfDay(new Date());
    const nextSevenDays = addDays(today, 7);

    let activeSummaryCount = 0;
    let overdueSummaryCount = 0;
    let upcomingSummaryCount = 0;
    let completedTodaySummaryCount = 0;
    
    const statusCounts: Record<TaskStatus | string, number> = {
      "To Do": 0, "In Progress": 0, "Blocked": 0, "Done": 0, "Overdue": 0,
    };
    const employeeTaskCounts: Record<string, number> = {};

    allTasks.forEach(task => {
      const dueDate = task.dueDate ? startOfDay(new Date(task.dueDate)) : null;
      const taskIsDone = task.status === "Done";
      const taskIsOverdue = dueDate && isPast(dueDate) && !isToday(dueDate) && !taskIsDone;

      // For Status Distribution Chart
      if (taskIsOverdue) {
        statusCounts["Overdue"] = (statusCounts["Overdue"] || 0 ) + 1;
      } else if (task.status && statusCounts.hasOwnProperty(task.status)) {
         statusCounts[task.status]++;
      }

      // For Employee Task Chart (Active Tasks)
      if (!taskIsDone && !taskIsOverdue) { // Active if not done and not overdue
        if (task.assignedTo_text) {
          employeeTaskCounts[task.assignedTo_text] = (employeeTaskCounts[task.assignedTo_text] || 0) + 1;
        } else {
          // Optional: count unassigned active tasks
          // employeeTaskCounts["Unassigned"] = (employeeTaskCounts["Unassigned"] || 0) + 1;
        }
      }

      // For Summary Cards
      if (taskIsDone) {
        const updatedDate = task.updated ? new Date(task.updated) : new Date(task.created);
        if (isToday(updatedDate)) {
          completedTodaySummaryCount++;
        }
      } else { 
        if (taskIsOverdue) {
          overdueSummaryCount++;
        }
        // Count for "Active Tasks" card (To Do, In Progress, Blocked)
        if (task.status === "In Progress" || task.status === "To Do" || task.status === "Blocked") {
          activeSummaryCount++;
        }
        // Count for "Upcoming Tasks" card
        if (dueDate && dueDate >= today && dueDate < nextSevenDays && !taskIsOverdue) { // ensure not overdue also
          upcomingSummaryCount++;
        }
      }
    });
    
    setTaskSummaryData([
      { ...initialTaskSummaryData[0], value: activeSummaryCount.toString() },
      { ...initialTaskSummaryData[1], value: overdueSummaryCount.toString() },
      { ...initialTaskSummaryData[2], value: upcomingSummaryCount.toString() },
      { ...initialTaskSummaryData[3], value: completedTodaySummaryCount.toString() },
    ]);

    const distribution = (Object.keys(statusCounts) as (TaskStatus | string)[]).map(status => ({
      status: status,
      count: statusCounts[status] || 0,
      fill: chartFills[status] || "hsl(var(--muted))",
    })).filter(item => item.count > 0);
    setTaskDistributionData(distribution);

    const employeeDataForChart = Object.entries(employeeTaskCounts)
      .map(([employeeName, count]) => ({
        employee: employeeName,
        activeTasks: count,
      }))
      .sort((a,b) => b.activeTasks - a.activeTasks); // Sort by most tasks
    setActiveTasksByEmployeeData(employeeDataForChart);

  }, [chartFills]);


  const fetchDashboardData = useCallback(async (pb: PocketBase) => {
    setIsLoading(true);
    setError(null);
    try {
      const [fetchedTasks, fetchedEmployees] = await Promise.all([
        getTasks(pb),
        getEmployees(pb) // Fetch employees
      ]);
      processData(fetchedTasks, fetchedEmployees);
    } catch (err: any) {
      const isAutocancel = err?.isAbort === true || err?.status === 0 || (typeof err?.message === 'string' && err.message.toLowerCase().includes("autocancelled"));
      if (isAutocancel) {
        console.warn("Dashboard data fetch request was autocancelled or due to a network issue.", err);
      } else {
        console.error("Error fetching dashboard data:", err);
        // Determine context of error (tasks or employees) if possible, or use general
        const errorContext = err.message?.toLowerCase().includes("employee") ? "employees" : "tasks";
        const detailedError = getDetailedErrorMessage(err, errorContext);
        setError(detailedError);
        toast({ title: "Error Loading Dashboard Data", description: detailedError, variant: "destructive" });
      }
    } finally {
      setIsLoading(false);
    }
  }, [toast, processData]);

  useEffect(() => {
    if (pbClient) {
      fetchDashboardData(pbClient);
    } else {
      setIsLoading(true); 
    }
  }, [pbClient, fetchDashboardData]);

  const refetchData = () => {
    if (pbClient) {
      fetchDashboardData(pbClient);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-10rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Loading dashboard data...</p>
      </div>
    );
  }

  if (error && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-10rem)] text-destructive">
        <AlertTriangle className="h-16 w-16" />
        <p className="mt-4 text-xl font-semibold">Failed to Load Dashboard Data</p>
        <p className="text-md mt-1 text-center max-w-md">{error}</p>
        <Button onClick={refetchData} className="mt-6">
          Try Again
        </Button>
      </div>
    );
  }

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
            {taskDistributionData.length > 0 ? (
              <ChartContainer config={taskStatusChartConfig} className="h-[300px] w-full">
                <RechartsBarChart data={taskDistributionData} layout="vertical" margin={{left:10, right:30}}>
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" dataKey="count" allowDecimals={false} />
                  <YAxis dataKey="status" type="category" tickLine={false} axisLine={false} width={80} />
                  <Tooltip cursor={{fill: 'hsl(var(--muted))'}} content={<ChartTooltipContent hideLabel />} />
                  <Legend />
                  <Bar dataKey="count" radius={4} />
                </RechartsBarChart>
              </ChartContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No task data available for distribution chart.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="font-headline flex items-center">
              <Users className="mr-2 h-5 w-5 text-primary" />
              Active Tasks by Employee
            </CardTitle>
            <CardDescription>Breakdown of active tasks assigned per employee.</CardDescription>
          </CardHeader>
          <CardContent>
            {activeTasksByEmployeeData.length > 0 ? (
              <ChartContainer config={employeeTasksChartConfig} className="h-[300px] w-full">
                <RechartsBarChart data={activeTasksByEmployeeData} margin={{top: 5, right: 20, left: 0, bottom: 5}}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="employee" type="category" />
                  <YAxis dataKey="activeTasks" type="number" allowDecimals={false} />
                  <Tooltip cursor={{fill: 'hsl(var(--muted))'}} content={<ChartTooltipContent />} />
                  <Bar dataKey="activeTasks" fill="var(--color-activeTasks)" radius={[4, 4, 0, 0]} />
                </RechartsBarChart>
              </ChartContainer>
            ) : (
               <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No active tasks assigned to employees or employee data not loaded.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-md md:col-span-2">
          <CardHeader>
            <CardTitle className="font-headline flex items-center">
              <TrendingUp className="mr-2 h-5 w-5 text-primary" />
              Monthly Task Completion Rate (Mock Data)
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
                      const data = payload[0].payload; 
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
      </div>
    </div>
  );
}
    
