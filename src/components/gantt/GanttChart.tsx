
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

const DAY_CELL_WIDTH = 30; 
const ROW_HEIGHT = 48; // Increased slightly for better text fit in left panel
const SIDEBAR_WIDTH = 450; // Increased width to accommodate new columns in left panel
const HEADER_HEIGHT = 60; 
const TASK_BAR_VERTICAL_PADDING = 8; 

const getTaskBarColor = (status?: TaskStatus, isMilestone?: boolean): string => {
  if (isMilestone) return 'bg-purple-500 hover:bg-purple-600'; 
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
    dependencies: Array.isArray(task.dependencies) ? task.dependencies : [],
  }));

  if (validTasks.length === 0) {
    return <div className="p-4 text-center text-muted-foreground">No tasks with valid start and end dates to display.</div>;
  }

  const overallStartDate = min(validTasks.map(t => t.startDate));
  const overallEndDate = max(validTasks.map(t => t.dueDate));
  
  const chartStartDate = addDays(overallStartDate, -2); 
  const chartEndDate = addDays(overallEndDate, 14); 

  const totalDaysInChart = differenceInDays(chartEndDate, chartStartDate) + 1;
  if (totalDaysInChart <= 0) {
     return <div className="p-4 text-center text-muted-foreground">Invalid date range for chart.</div>;
  }


  const weeksInChart = eachWeekOfInterval(
    { start: chartStartDate, end: chartEndDate },
    { weekStartsOn: 1 } 
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
    <div className="gantt-chart-container text-xs select-none" style={{ minWidth: SIDEBAR_WIDTH + (totalDaysInChart * DAY_CELL_WIDTH * 0.3) }}>
      {/* Headers */}
      <div className="sticky top-0 z-20 bg-card grid" style={{ gridTemplateColumns: `${SIDEBAR_WIDTH}px 1fr`}}>
        {/* Left Panel Header */}
        <div className="h-[60px] border-b border-r border-border flex items-center p-2 font-semibold text-sm">
          <div className="grid grid-cols-[40px_1fr_70px_70px_60px] w-full items-center gap-2">
            <span className="text-center text-muted-foreground text-[10px] uppercase">WBS</span>
            <span className="text-muted-foreground text-[10px] uppercase">Task Name</span>
            <span className="text-center text-muted-foreground text-[10px] uppercase">Start</span>
            <span className="text-center text-muted-foreground text-[10px] uppercase">End</span>
            <span className="text-center text-muted-foreground text-[10px] uppercase">Prog.</span>
          </div>
        </div>
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
      <div className="relative">
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
          const taskDurationDays = Math.max(1, differenceInDays(task.dueDate, task.startDate) + 1);
          const barWidthPercent = (taskDurationDays / totalDaysInChart) * 100;
          
          const taskBarHeight = ROW_HEIGHT - TASK_BAR_VERTICAL_PADDING - 4; // Adjusted for padding within row
          const taskBarTop = (ROW_HEIGHT - taskBarHeight) / 2;

          let tooltipText = `${task.title}: ${task.progress}% (${format(task.startDate, 'P')} - ${format(task.dueDate, 'P')})`;
          if (task.dependencies && task.dependencies.length > 0) {
            tooltipText += ` | Depends on: ${task.dependencies.join(', ')}`;
          }

          return (
            <div
              key={task.id}
              className="grid border-b border-border hover:bg-muted/10 relative"
              style={{ 
                gridTemplateColumns: `${SIDEBAR_WIDTH}px 1fr`,
                height: `${ROW_HEIGHT}px`
              }}
            >
              {/* Task Details Pane (Left Panel Row) */}
              <div className="grid grid-cols-[40px_1fr_70px_70px_60px] w-full items-center gap-2 p-2 border-r border-border">
                <span className="text-center text-muted-foreground">{taskIndex + 1}</span>
                <span className="font-medium truncate text-xs" title={task.title}>{task.title}</span>
                <span className="text-center text-[10px]">{format(task.startDate, 'ddMMMyy')}</span>
                <span className="text-center text-[10px]">{format(task.dueDate, 'ddMMMyy')}</span>
                <span className="text-center text-[10px] font-semibold">{task.progress}%</span>
              </div>

              {/* Task Bar Pane */}
              <div className="relative border-r border-border overflow-hidden">
                {barWidthPercent > 0 && (
                  <div
                    title={tooltipText}
                    className={cn(
                      "absolute rounded-sm transition-all duration-150 ease-in-out group cursor-pointer",
                      getTaskBarColor(task.status, task.isMilestone)
                    )}
                    style={{
                      left: `${barLeftPercent}%`,
                      width: `${barWidthPercent}%`,
                      height: `${taskBarHeight}px`,
                      top: `${taskBarTop}px`,
                      minWidth: task.isMilestone ? '12px' : '5px', 
                    }}
                  >
                    {!task.isMilestone && task.progress !== undefined && task.progress > 0 && (
                       <div 
                          className="absolute top-0 left-0 h-full bg-black/20 rounded-sm"
                          style={{ width: `${task.progress}%`}}
                       />
                    )}
                    {task.isMilestone && (
                       <div className="absolute inset-0 flex items-center justify-center">
                         <svg viewBox="0 0 100 100" className="w-3/4 h-3/4 fill-current text-white/80" preserveAspectRatio="none">
                           <polygon points="50,0 100,50 50,100 0,50" />
                         </svg>
                       </div>
                    )}
                    {!task.isMilestone && barWidthPercent > 3 && (
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
