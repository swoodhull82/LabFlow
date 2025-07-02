
"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart, CalendarClock, CheckCircle2, AlertTriangle, Zap, Users, TrendingUp } from "lucide-react";
import { Bar, BarChart as RechartsBarChart, Line, LineChart as RechartsLineChart, ResponsiveContainer, XAxis, YAxis, Tooltip as RechartsTooltip, Legend, CartesianGrid } from 'recharts';
import { ChartConfig, ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/context/AuthContext";
import { getTasks } from "@/services/taskService";
import { getEmployees } from "@/services/employeeService";
import type { Task, TaskStatus, Employee, TaskType } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { format, isPast, isToday, addDays, startOfDay, getQuarter, getYear, addYears } from "date-fns";
import type PocketBase from "pocketbase";
import { Skeleton } from "@/components/ui/skeleton";
import { TASK_TYPES } from "@/lib/constants";
import { useRouter } from "next/navigation";

interface TaskSummaryItem {
  title: string;
  value: string;
  icon: React.ElementType;
  description: string;
  color: string;
  bgColor: string;
  tasks?: Task[];
}

interface LiveEmployeeTaskData {
  employee: string;
  activeTasks: number;
  fill?: string;
}

type AggregatedTaskTypeForChart = 'MDL' | 'SOP' | 'IA' | 'DOC';
const displayTypesForChartPlotting: AggregatedTaskTypeForChart[] = ['MDL', 'SOP', 'IA', 'DOC'];


interface QuarterlyCompletionDataPoint {
  quarter: string; // e.g., "Q1 24"
  rates: {
    [key in AggregatedTaskTypeForChart]?: number;
  };
  totals: {
    [key in AggregatedTaskTypeForChart]?: { total: number; completed: number };
  };
  goalRate: number;
}


const initialTaskSummaryData: TaskSummaryItem[] = [
  { title: "Active Tasks", value: "0", icon: Zap, description: "Tasks currently in progress or to do.", color: "text-blue-500", bgColor: "bg-blue-50", tasks: [] },
  { title: "Overdue Tasks", value: "0", icon: AlertTriangle, description: "Tasks past their due date.", color: "text-red-500", bgColor: "bg-red-50", tasks: [] },
  { title: "Upcoming Tasks", value: "0", icon: CalendarClock, description: "Tasks due in the next 7 days.", color: "text-yellow-500", bgColor: "bg-yellow-50", tasks: [] },
  { title: "Completed Today", value: "0", icon: CheckCircle2, description: "Tasks marked as done today.", color: "text-green-500", bgColor: "bg-green-50", tasks: [] },
];

const taskStatusChartConfig = {
  count: { label: "Tasks" },
  "To Do": { label: "To Do", color: "hsl(var(--chart-1))" },
  "In Progress": { label: "In Progress", color: "hsl(var(--chart-2))" },
  "Blocked": { label: "Blocked", color: "hsl(var(--chart-3))" },
  "Done": { label: "Done", color: "hsl(var(--chart-4))" },
  "Overdue": { label: "Overdue", color: "hsl(var(--chart-5))" },
} satisfies ChartConfig;

const employeeTasksChartConfig = {
  activeTasks: { label: "Active Tasks", color: "hsl(var(--chart-2))" },
} satisfies ChartConfig;

const quarterlyCompletionChartConfigInitial = {
  goalRate: { label: "Goal Rate", color: "hsl(var(--muted-foreground))" },
} as ChartConfig;

const quarterlyCompletionChartConfig = displayTypesForChartPlotting.reduce((acc, type, index) => {
  let label = type.replace(/_/g, ' ');
  if (type === 'IA') label = 'Internal Audit';
  if (type === 'DOC') label = 'DOC';

  acc[type] = { label: `${label} Rate`, color: `hsl(var(--chart-${(index % 5) + 1}))` };
  acc[`${type}_total`] = { label: `${label} Total` }; // Not directly used by Line chart dataKey, but for tooltip consistency
  acc[`${type}_completed`] = { label: `${label} Completed` }; // Not directly used, but for tooltip consistency
  return acc;
}, quarterlyCompletionChartConfigInitial);


const chartFills: Record<TaskStatus | string, string> = {
  'To Do': "hsl(var(--chart-1))",
  'In Progress': "hsl(var(--chart-2))",
  'Blocked': "hsl(var(--chart-3))",
  'Done': "hsl(var(--chart-4))",
  'Overdue': "hsl(var(--chart-5))",
};

const getDetailedErrorMessage = (error: any, context: string = "dashboard data"): string => {
  let message = `An unexpected error occurred while fetching ${context}.`;
  if (error && typeof error === 'object') {
    if ('status' in error && error.status === 0) {
      message = `Failed to communicate with the server while fetching ${context}. Please check your connection and try again.`;
    } else if (error.data && typeof error.data === 'object' && error.data.message && typeof error.data.message === 'string') {
      message = error.data.message;
    } else if (error.message && typeof error.message === 'string' && !(error.message.startsWith("PocketBase_ClientResponseError"))) {
      message = error.message;
    } else if (error.originalError && typeof error.originalError.message === 'string') {
        message = error.originalError.message;
    } else if (error.message && typeof error.message === 'string') {
      message = error.message;
    }
    if ('status' in error && error.status !== 0) {
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

const SkeletonSummaryCard = () => (
  <Card className="shadow-md">
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-5 w-5 rounded-full" />
    </CardHeader>
    <CardContent>
      <Skeleton className="h-7 w-1/3 mb-2" />
      <Skeleton className="h-3 w-full" />
    </CardContent>
  </Card>
);

const SkeletonChartCard = () => (
  <Card className="shadow-md">
    <CardHeader>
      <Skeleton className="h-5 w-1/2 mb-1" />
      <Skeleton className="h-4 w-3/4" />
    </CardHeader>
    <CardContent className="h-[300px]">
      <Skeleton className="h-full w-full" />
    </CardContent>
  </Card>
);


export default function DashboardPage() {
  const { pbClient } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const [taskSummaryData, setTaskSummaryData] = useState<TaskSummaryItem[]>(initialTaskSummaryData);
  const [taskDistributionData, setTaskDistributionData] = useState<{ status: string; count: number; fill: string; }[]>([]);
  const [activeTasksByEmployeeData, setActiveTasksByEmployeeData] = useState<LiveEmployeeTaskData[]>([]);
  
  const [selectedQuarterlyYear, setSelectedQuarterlyYear] = useState<number>(new Date().getFullYear());
  const [quarterlyTaskCompletionData, setQuarterlyTaskCompletionData] = useState<QuarterlyCompletionDataPoint[]>([]);
  const [allFetchedTasks, setAllFetchedTasks] = useState<Task[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const processData = useCallback((tasksToProcess: Task[], yearForQuarterlyChart: number) => {
    const today = startOfDay(new Date());
    const nextSevenDays = addDays(today, 7);

    let activeSummaryCount = 0;
    let overdueSummaryCount = 0;
    let upcomingSummaryCount = 0;
    let completedTodaySummaryCount = 0;
    
    const activeTasksList: Task[] = [];
    const overdueTasksList: Task[] = [];
    const upcomingTasksList: Task[] = [];
    const completedTodayTasksList: Task[] = [];

    const statusCounts: Record<TaskStatus | string, number> = {
      "To Do": 0, "In Progress": 0, "Blocked": 0, "Done": 0, "Overdue": 0,
    };
    const employeeTaskCounts: Record<string, number> = {};

    tasksToProcess.forEach(task => {
      const dueDate = task.dueDate ? startOfDay(new Date(task.dueDate)) : null;
      const isTaskMarkedDone = task.status === "Done";
      
      const isDateBasedOverdue = dueDate && isPast(dueDate) && !isToday(dueDate) && !isTaskMarkedDone;
      const isEffectivelyOverdue = task.status === "Overdue" || isDateBasedOverdue;

      if (task.status === "Overdue") {
        statusCounts["Overdue"]++;
      } else if (isDateBasedOverdue) { 
        statusCounts["Overdue"]++;
      } else if (task.status && statusCounts.hasOwnProperty(task.status)) {
        statusCounts[task.status]++;
      } else {
        statusCounts["To Do"]++;
      }

      if (!isTaskMarkedDone && !isEffectivelyOverdue && task.task_type !== "VALIDATION_PROJECT") {
        if (task.assignedTo_text) {
          employeeTaskCounts[task.assignedTo_text] = (employeeTaskCounts[task.assignedTo_text] || 0) + 1;
        }
      }

      if (isTaskMarkedDone) {
        const updatedDate = task.updated ? new Date(task.updated) : new Date(task.created);
        if (isToday(updatedDate)) {
          completedTodaySummaryCount++;
          completedTodayTasksList.push(task);
        }
      } else { 
        if (isEffectivelyOverdue) {
          overdueSummaryCount++;
          overdueTasksList.push(task);
        }
        if (!isEffectivelyOverdue && (task.status === "In Progress" || task.status === "To Do" || task.status === "Blocked")) {
          activeSummaryCount++;
          activeTasksList.push(task);
        }
        if (!isEffectivelyOverdue && dueDate && dueDate >= today && dueDate < nextSevenDays) {
          upcomingSummaryCount++;
          upcomingTasksList.push(task);
        }
      }
    });
    
    setTaskSummaryData([
      { ...initialTaskSummaryData[0], value: activeSummaryCount.toString(), tasks: activeTasksList },
      { ...initialTaskSummaryData[1], value: overdueSummaryCount.toString(), tasks: overdueTasksList },
      { ...initialTaskSummaryData[2], value: upcomingSummaryCount.toString(), tasks: upcomingTasksList },
      { ...initialTaskSummaryData[3], value: completedTodaySummaryCount.toString(), tasks: completedTodayTasksList },
    ]);

    const distribution = (Object.keys(statusCounts) as (TaskStatus | string)[])
      .map(status => ({
        status: status,
        count: statusCounts[status] || 0,
        fill: chartFills[status as TaskStatus] || "hsl(var(--muted))",
      }))
      .filter(item => item.count > 0);
    setTaskDistributionData(distribution);

    const employeeDataForChart = Object.entries(employeeTaskCounts)
      .map(([employeeName, count]) => ({
        employee: employeeName,
        activeTasks: count,
      }))
      .sort((a,b) => b.activeTasks - a.activeTasks);
    setActiveTasksByEmployeeData(employeeDataForChart);

    // --- Quarterly Completion Rate Logic ---
    const yearlyTotalTasksByType: { [key in AggregatedTaskTypeForChart]?: number } = {};
    const quarterlyCompletedRawCountByType: {
      [quarterKey: string]: { [key in AggregatedTaskTypeForChart]?: number };
    } = { Q1: {}, Q2: {}, Q3: {}, Q4: {} };

    displayTypesForChartPlotting.forEach(type => {
      yearlyTotalTasksByType[type] = 0;
      ['Q1', 'Q2', 'Q3', 'Q4'].forEach(q => {
        if (!quarterlyCompletedRawCountByType[q]) quarterlyCompletedRawCountByType[q] = {};
        quarterlyCompletedRawCountByType[q][type] = 0;
      });
    });

    tasksToProcess.forEach(task => {
      if (task.task_type === "VALIDATION_PROJECT" || task.task_type === "VALIDATION_STEP") return;

      let effectiveChartType: AggregatedTaskTypeForChart | undefined = undefined;
      if (task.task_type === "iDOC" || task.task_type === "oDOC") {
        effectiveChartType = "DOC";
      } else if (displayTypesForChartPlotting.includes(task.task_type as any)) {
        effectiveChartType = task.task_type as AggregatedTaskTypeForChart;
      }

      if (!effectiveChartType) return;

      const taskDueDate = task.dueDate ? startOfDay(new Date(task.dueDate)) : null;
      if (taskDueDate && getYear(taskDueDate) === yearForQuarterlyChart) {
        yearlyTotalTasksByType[effectiveChartType] = (yearlyTotalTasksByType[effectiveChartType] || 0) + 1;
        if (task.status === "Done") {
          const quarterNum = getQuarter(taskDueDate);
          const quarterKey = `Q${quarterNum}`;
          quarterlyCompletedRawCountByType[quarterKey][effectiveChartType] = (quarterlyCompletedRawCountByType[quarterKey][effectiveChartType] || 0) + 1;
        }
      }
    });
    
    const quarterlyChartDataPoints: QuarterlyCompletionDataPoint[] = [];
    const yearShort = format(new Date(yearForQuarterlyChart, 0, 1), "yy");
    const goalRates = [25, 50, 75, 100]; 
    const cumulativeCompletedByType: { [key in AggregatedTaskTypeForChart]?: number } = {};
    displayTypesForChartPlotting.forEach(type => cumulativeCompletedByType[type] = 0);

    for (let i = 1; i <= 4; i++) {
        const quarterKey = `Q${i}`;
        const ratesForQuarter: QuarterlyCompletionDataPoint['rates'] = {};
        const totalsForQuarter: QuarterlyCompletionDataPoint['totals'] = {};

        displayTypesForChartPlotting.forEach(type => {
            const completedInThisQuarterForType = quarterlyCompletedRawCountByType[quarterKey]?.[type] || 0;
            cumulativeCompletedByType[type] = (cumulativeCompletedByType[type] || 0) + completedInThisQuarterForType;
            
            const totalForYearForType = yearlyTotalTasksByType[type] || 0;

            ratesForQuarter[type] =
                totalForYearForType > 0
                ? parseFloat((( (cumulativeCompletedByType[type] || 0) / totalForYearForType) * 100).toFixed(1))
                : 0;
            
            totalsForQuarter[type] = { 
              total: totalForYearForType, 
              completed: cumulativeCompletedByType[type] || 0 
            };
        });

        quarterlyChartDataPoints.push({
            quarter: `Q${i} '${yearShort}`,
            rates: ratesForQuarter,
            totals: totalsForQuarter,
            goalRate: goalRates[i-1],
        });
    }
    setQuarterlyTaskCompletionData(quarterlyChartDataPoints);

  }, []);


  const fetchDashboardData = useCallback(async (pb: PocketBase | null, signal?: AbortSignal) => {
    if (!pb) {
      setIsLoading(true);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const projectionHorizon = addYears(new Date(), 2);
      const [fetchedTasks, _fetchedEmployees] = await Promise.all([
        getTasks(pb, { signal, projectionHorizon }),
        getEmployees(pb, { signal }) 
      ]);
      setAllFetchedTasks(fetchedTasks); 
      processData(fetchedTasks, selectedQuarterlyYear); 
    } catch (err: any) {
      const isAutocancel = err?.isAbort === true || (typeof err?.message === 'string' && err.message.toLowerCase().includes("autocancelled"));
      const isNetworkErrorNotAutocancel = err?.status === 0 && !isAutocancel;

      if (isAutocancel) {
        console.warn(`Dashboard data fetch request was ${err?.isAbort ? 'aborted' : 'autocancelled'}.`, err);
      } else if (isNetworkErrorNotAutocancel) {
        const detailedError = getDetailedErrorMessage(err, "dashboard data");
        setError(detailedError);
        toast({ title: "Error Loading Data", description: detailedError, variant: "destructive" });
        console.warn("Dashboard data fetch (network error):", detailedError, err);
      } else {
        const errorContext = err.message?.toLowerCase().includes("employee") ? "employees" : "tasks";
        const detailedError = getDetailedErrorMessage(err, errorContext);
        setError(detailedError);
        toast({ title: "Error Loading Data", description: detailedError, variant: "destructive" });
        console.warn("Error fetching dashboard data (after retries):", detailedError, err);
      }
    } finally {
      setIsLoading(false);
    }
  }, [toast, processData, selectedQuarterlyYear]);

  useEffect(() => {
    const controller = new AbortController();
    if (pbClient) {
      fetchDashboardData(pbClient, controller.signal);
    } else {
      setIsLoading(true); 
    }
    return () => {
      controller.abort();
    };
  }, [pbClient, fetchDashboardData]);

  useEffect(() => {
    if (allFetchedTasks.length > 0) {
      processData(allFetchedTasks, selectedQuarterlyYear);
    }
  }, [selectedQuarterlyYear, allFetchedTasks, processData]);


  const refetchData = () => {
    if (pbClient) {
      fetchDashboardData(pbClient);
    }
  };

  const currentChartYear = new Date().getFullYear();
  const yearOptions = [
    currentChartYear,
    currentChartYear - 1,
    currentChartYear - 2,
  ];


  return (
    <TooltipProvider>
      <div className="space-y-6">
        <h1 className="text-2xl md:text-3xl font-headline font-semibold">Dashboard</h1>
        
        {error && !isLoading ? (
          <div className="flex flex-col items-center justify-center py-10 text-destructive bg-destructive/10 rounded-lg">
            <AlertTriangle className="h-12 w-12" />
            <p className="mt-4 text-xl font-semibold">Failed to Load Dashboard Data</p>
            <p className="text-md mt-1 text-center max-w-md">{error}</p>
            <Button onClick={refetchData} className="mt-6" variant="destructive">
              Try Again
            </Button>
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {isLoading
                ? Array.from({ length: 4 }).map((_, index) => <SkeletonSummaryCard key={index} />)
                : (!error && taskSummaryData.map((item) => (
                    <Tooltip key={item.title}>
                      <TooltipTrigger asChild>
                        <Card className="shadow-md hover:shadow-lg transition-shadow duration-300">
                          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">{item.title}</CardTitle>
                            <item.icon className={`h-5 w-5 ${item.color}`} />
                          </CardHeader>
                          <CardContent>
                            <div className="text-2xl font-bold">{item.value}</div>
                            <p className="text-xs text-muted-foreground">{item.description}</p>
                          </CardContent>
                        </Card>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs w-auto bg-card border shadow-lg rounded-md p-2" side="bottom" align="center">
                        {item.tasks && item.tasks.length > 0 ? (
                          <div className="text-left">
                            <p className="font-semibold text-sm mb-1 text-card-foreground">{item.title}:</p>
                            <ul className="list-disc list-inside space-y-0.5 max-h-60 overflow-y-auto">
                              {item.tasks.map(task => (
                                <li key={task.id} className="text-xs text-card-foreground truncate" title={task.title}>
                                  {task.title}
                                  {task.dueDate && <span className="text-muted-foreground text-[10px] ml-1"> (Due: {format(new Date(task.dueDate), "MM/dd")})</span>}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">No tasks in this category.</p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  )))}
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              {isLoading ? <SkeletonChartCard /> : (
                !error && (
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
                            <RechartsTooltip cursor={{fill: 'hsl(var(--muted))'}} content={<ChartTooltipContent hideLabel />} />
                            <Legend />
                            <Bar
                              dataKey="count"
                              radius={4}
                              style={{ cursor: 'pointer' }}
                              onClick={(data) => {
                                if (data && data.status) {
                                  router.push(`/tasks?status=${encodeURIComponent(data.status)}`);
                                }
                              }}
                            />
                          </RechartsBarChart>
                        </ChartContainer>
                      ) : (
                        <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                          No task data available for distribution chart.
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              )}

              {isLoading ? <SkeletonChartCard /> : (
                !error && (
                  <Card className="shadow-md">
                    <CardHeader>
                      <CardTitle className="font-headline flex items-center">
                        <Users className="mr-2 h-5 w-5 text-primary" />
                        Active Tasks by Employee
                      </CardTitle>
                      <CardDescription>Breakdown of active non-validation tasks assigned per employee.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {activeTasksByEmployeeData.length > 0 ? (
                        <ChartContainer config={employeeTasksChartConfig} className="h-[300px] w-full">
                          <RechartsBarChart data={activeTasksByEmployeeData} margin={{top: 5, right: 20, left: 0, bottom: 5}}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="employee" type="category" />
                            <YAxis dataKey="activeTasks" type="number" allowDecimals={false} />
                            <RechartsTooltip cursor={{fill: 'hsl(var(--muted))'}} content={<ChartTooltipContent />} />
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
                )
              )}

              {isLoading ? <div className="md:col-span-2"><SkeletonChartCard /></div> : (
                !error && (
                    <Card className="shadow-md md:col-span-2">
                    <CardHeader>
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
                          <div>
                              <CardTitle className="font-headline flex items-center">
                              <TrendingUp className="mr-2 h-5 w-5 text-primary" />
                              Quarterly Task Completion Rate (by Type)
                              </CardTitle>
                              <CardDescription>Cumulative completion vs. yearly totals for non-validation tasks.</CardDescription>
                          </div>
                          <Select
                              value={selectedQuarterlyYear.toString()}
                              onValueChange={(value) => setSelectedQuarterlyYear(parseInt(value))}
                          >
                              <SelectTrigger className="w-full sm:w-[120px] mt-2 sm:mt-0">
                                  <SelectValue placeholder="Select Year" />
                              </SelectTrigger>
                              <SelectContent>
                                  {yearOptions.map(year => (
                                  <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                                  ))}
                              </SelectContent>
                          </Select>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {quarterlyTaskCompletionData.length > 0 ? (
                        <ChartContainer config={quarterlyCompletionChartConfig} className="h-[300px] w-full">
                        <RechartsLineChart data={quarterlyTaskCompletionData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="quarter" />
                            <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                            <RechartsTooltip
                              content={({ active, payload, label }) => {
                                  if (active && payload && payload.length) {
                                  const dataPoint = quarterlyTaskCompletionData.find(d => d.quarter === label);
                                  if (!dataPoint) return null;

                                  return (
                                      <div className="p-2 rounded-md border bg-background shadow-lg text-xs">
                                      <p className="font-medium text-sm mb-1">{label}</p>
                                      {displayTypesForChartPlotting.map(type => {
                                          const rate = dataPoint.rates[type];
                                          const totals = dataPoint.totals[type];
                                          const configEntry = quarterlyCompletionChartConfig[type];
                                          
                                          if (rate === undefined && (!totals || totals.total === 0)) return null; 
                                          
                                          return (
                                          <p key={type} style={{ color: configEntry?.color as string || 'inherit' }}>
                                              {configEntry?.label || type}: {rate !== undefined ? `${rate}%` : 'N/A'}
                                              {totals && totals.total > 0 && ` (${totals.completed}/${totals.total} yearly)`}
                                              {totals && totals.total === 0 && ` (0/0 yearly)`}
                                          </p>
                                          );
                                      })}
                                      <p style={{ color: quarterlyCompletionChartConfig.goalRate.color as string || 'inherit' }} className="mt-1">
                                          Overall Goal: {dataPoint.goalRate}%
                                      </p>
                                      </div>
                                  );
                                  }
                                  return null;
                              }}
                              cursor={{fill: 'hsl(var(--muted))'}}
                            />
                            <Legend />
                            {displayTypesForChartPlotting.map(type => (
                              <Line 
                                  key={type}
                                  type="monotone" 
                                  dataKey={`rates.${type}`}
                                  stroke={`var(--color-${type})`}
                                  strokeWidth={2} 
                                  dot={{ r: 4, fill: `var(--color-${type})` }} 
                                  activeDot={{ r: 6, fill: `var(--color-${type})`}} 
                                  name={quarterlyCompletionChartConfig[type]?.label as string || `${type.replace(/_/g, ' ')} Rate`} 
                                  connectNulls={false} 
                              />
                            ))}
                            <Line 
                              type="monotone" 
                              dataKey="goalRate" 
                              stroke={quarterlyCompletionChartConfig.goalRate.color as string}
                              strokeDasharray="5 5"
                              strokeWidth={2} 
                              dot={{ r: 4, fill: quarterlyCompletionChartConfig.goalRate.color as string }} 
                              activeDot={{ r: 6, fill: quarterlyCompletionChartConfig.goalRate.color as string }} 
                              name="Goal Rate" 
                            />
                        </RechartsLineChart>
                        </ChartContainer>
                      ) : (
                         <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                          No task data available for the selected year.
                        </div>
                      )}
                    </CardContent>
                    </Card>
                )
              )}
            </div>
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
    

    









    



    

