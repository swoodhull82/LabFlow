
"use client";

import type { Task, TaskStatus } from '@/lib/types';
import { 
  addDays, 
  differenceInDays, 
  eachWeekOfInterval, 
  format, 
  getISOWeek, 
  startOfDay, 
  isSameDay,
  isWithinInterval,
  max,
  min
} from 'date-fns';
import React from 'react';
import { cn } from '@/lib/utils';

interface GanttChartProps {
  tasks: Task[];
}

const DAY_CELL_WIDTH = 30; // Width of a single day cell in pixels
const ROW_HEIGHT = 44; // Increased height for better progress display
const SIDEBAR_WIDTH = 300; // Width of the task details sidebar
const HEADER_HEIGHT = 60; // Combined height of month and week headers
const TASK_BAR_VERTICAL_PADDING = 8; // Total vertical padding around the task bar (top+bottom)

const getTaskBarColor = (status?: TaskStatus, isMilestone?: boolean): string => {
  if (isMilestone) return 'bg-purple-500 hover:bg-purple-600'; // Distinct color for milestones
  if (!status) return 'bg-primary hover:bg-primary/90';
  switch (status.toLowerCase()) {
    case 'done':
      return 'bg-green-500 hover:bg-green-600';
    case 'in progress':
      return 'bg-blue-500 hover:bg-blue-600';
    case 'overdue':
      return 'bg-red-500 hover:bg-red-600';
    case 'blocked':
      return 'bg-orange-500 hover:bg-orange-600';
    case 'to do':
      return 'bg-gray-400 hover:bg-gray-500';
    default:
      return 'bg-primary hover:bg-primary/90';
  }
};

const GanttChart: React.FC<GanttChartProps> = ({ tasks }) => {
  
  const validTasks = tasks.filter(task => task.startDate && task.dueDate).map(task => ({
    ...task,
    startDate: startOfDay(new Date(task.startDate!)),
    dueDate: startOfDay(new Date(task.dueDate!)),
    progress: typeof task.progress === 'number' && task.progress >= 0 && task.progress <= 100 ? task.progress : 0,
    isMilestone: task.isMilestone === true || (task.isMilestone !== false && isSameDay(new Date(task.startDate!), new Date(task.dueDate!))),
  }));

  if (validTasks.length === 0) {
    return <div className="p-4 text-center text-muted-foreground">No tasks with valid start and end dates to display.</div>;
  }

  const overallStartDate = min(validTasks.map(t => t.startDate));
  const overallEndDate = max(validTasks.map(t => t.dueDate));
  
  const chartStartDate = addDays(overallStartDate, -2); 
  const chartEndDate = addDays(overallEndDate, 14); // Extend further for better "Today Line" visibility

  const totalDaysInChart = differenceInDays(chartEndDate, chartStartDate) + 1;
  if (totalDaysInChart <= 0) {
     return <div className="p-4 text-center text-muted-foreground">Invalid date range for chart.</div>;
  }


  const weeksInChart = eachWeekOfInterval(
    { start: chartStartDate, end: chartEndDate },
    { weekStartsOn: 1 } // Monday
  );

  const getMonthYear = (date: Date) => format(date, 'MMM yyyy');
  const monthHeaders: { name: string; span: number }[] = [];
  
  weeksInChart.forEach(weekStart => {
    const monthYear = getMonthYear(weekStart);
    const lastMonthHeader = monthHeaders[monthHeaders.length - 1];
    if (lastMonthHeader && lastMonthHeader.name === monthYear) {
      lastMonthHeader.span += 1;
    } else {
      monthHeaders.push({ name: monthYear, span: 1 });
    }
  });

  const today = startOfDay(new Date());
  const showTodayLine = isWithinInterval(today, { start: chartStartDate, end: chartEndDate });
  let todayPositionPercent = 0;
  if (showTodayLine) {
    const daysFromChartStartToToday = differenceInDays(today, chartStartDate);
    todayPositionPercent = (daysFromChartStartToToday / totalDaysInChart) * 100;
  }

  return (
    <div className="gantt-chart-container text-xs select-none" style={{ minWidth: SIDEBAR_WIDTH + (totalDaysInChart * DAY_CELL_WIDTH * 0.3) }}> {/* Adjusted minWidth */}
      {/* Headers */}
      <div className="sticky top-0 z-20 bg-card grid" style={{ gridTemplateColumns: `${SIDEBAR_WIDTH}px 1fr`}}>
        {/* Top-left empty cell / Controls */}
        <div className="h-[60px] border-b border-r border-border flex items-center p-2 font-semibold text-sm">Task Details</div>
        {/* Month and Week Headers */}
        <div className="overflow-hidden">
          {/* Month Headers */}
          <div className="grid h-[30px] border-b border-border" style={{ gridTemplateColumns: `repeat(${weeksInChart.length}, minmax(${DAY_CELL_WIDTH}px, 1fr))`}}>
            {monthHeaders.map((month, index) => (
              <div
                key={index}
                className="flex items-center justify-center border-r border-border font-semibold text-xs"
                style={{ gridColumn: `span ${month.span}` }}
              >
                {month.name}
              </div>
            ))}
          </div>
          {/* Week Headers */}
          <div className="grid h-[30px] border-b border-border" style={{ gridTemplateColumns: `repeat(${weeksInChart.length}, minmax(${DAY_CELL_WIDTH}px, 1fr))`}}>
            {weeksInChart.map((weekStart, index) => (
              <div key={index} className="flex items-center justify-center border-r border-border text-muted-foreground text-[10px]">
                W{getISOWeek(weekStart)}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Task Rows and Timeline Grid */}
      <div className="relative"> {/* Container for tasks and grid lines */}
        {/* Vertical Grid Lines for each day (subtle) - OPTIONAL, can be intensive for many days */}
        {/* Background Grid (less performant for many lines, consider SVG for complex grids) */}
        {/*
        <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${totalDaysInChart}, ${DAY_CELL_WIDTH}px)` }}>
          {Array.from({ length: totalDaysInChart }).map((_, i) => (
            <div key={`v-grid-${i}`} className="border-r border-border/30 h-full"></div>
          ))}
        </div>
        */}

        {/* "Today" Line */}
        {showTodayLine && (
          <div 
            className="absolute top-0 bottom-0 w-[2px] bg-red-500/70 z-10"
            style={{ left: `${todayPositionPercent}%` }}
            title={`Today: ${format(today, 'PPP')}`}
          >
            <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[8px] px-0.5 rounded-sm">TODAY</div>
          </div>
        )}

        {validTasks.map((task, taskIndex) => {
          const taskStartDayIndex = differenceInDays(task.startDate, chartStartDate);
          const taskEndDayIndex = differenceInDays(task.dueDate, chartStartDate);
          
          const barLeftPercent = Math.max(0, (taskStartDayIndex / totalDaysInChart) * 100);
          // Ensure duration is at least 1 day for visibility, even for milestones on the same day
          const taskDurationDays = Math.max(1, differenceInDays(task.dueDate, task.startDate) + 1);
          const barWidthPercent = (taskDurationDays / totalDaysInChart) * 100;
          
          const taskBarHeight = ROW_HEIGHT - TASK_BAR_VERTICAL_PADDING;
          const taskBarTop = TASK_BAR_VERTICAL_PADDING / 2;

          return (
            <div
              key={task.id}
              className="grid border-b border-border hover:bg-muted/10 relative" // Added relative for stacking context if needed
              style={{ 
                gridTemplateColumns: `${SIDEBAR_WIDTH}px 1fr`,
                height: `${ROW_HEIGHT}px`
              }}
            >
              {/* Task Details Pane */}
              <div className="flex flex-col justify-center p-2 border-r border-border truncate">
                <span className="font-medium truncate text-xs" title={task.title}>{task.title}</span>
                <div className="text-muted-foreground text-[10px] flex justify-between">
                  <span>
                    {format(task.startDate, 'dd MMM')} - {format(task.dueDate, 'dd MMM yy')}
                  </span>
                  {task.progress !== undefined && <span className="font-semibold">{task.progress}%</span>}
                </div>
              </div>

              {/* Task Bar Pane */}
              <div className="relative border-r border-border overflow-hidden"> {/* Grid lines could be added via background */}
                {barWidthPercent > 0 && ( /* Only render if width is positive */
                  <div
                    title={`${task.title}: ${task.progress}% (${format(task.startDate, 'P')} - ${format(task.dueDate, 'P')})`}
                    className={cn(
                      "absolute rounded-sm transition-all duration-150 ease-in-out group cursor-pointer",
                      getTaskBarColor(task.status, task.isMilestone)
                    )}
                    style={{
                      left: `${barLeftPercent}%`,
                      width: `${barWidthPercent}%`,
                      height: `${taskBarHeight}px`,
                      top: `${taskBarTop}px`,
                      minWidth: task.isMilestone ? '12px' : '5px', // Ensure milestone is visible
                    }}
                  >
                    {/* Progress Fill */}
                    {!task.isMilestone && task.progress !== undefined && task.progress > 0 && (
                       <div 
                          className="absolute top-0 left-0 h-full bg-black/20 rounded-sm"
                          style={{ width: `${task.progress}%`}}
                       />
                    )}
                    {/* Milestone Shape (simple for now) */}
                    {task.isMilestone && (
                       <div className="absolute inset-0 flex items-center justify-center">
                         <svg viewBox="0 0 100 100" className="w-3/4 h-3/4 fill-current text-white/80" preserveAspectRatio="none">
                           <polygon points="50,0 100,50 50,100 0,50" />
                         </svg>
                       </div>
                    )}
                    {/* Task Title on Bar (if space permits and not milestone) */}
                    {!task.isMilestone && barWidthPercent > 3 && ( /* Threshold for showing title */
                      <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] text-white/90 font-medium whitespace-nowrap overflow-hidden pr-1">
                        {task.title}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default GanttChart;
