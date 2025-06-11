
"use client";

import type { Task } from '@/lib/types';
import { 
  addDays, 
  differenceInDays, 
  eachWeekOfInterval, 
  format, 
  getISOWeek, 
  startOfDay, 
  isSameDay,
  max,
  min
} from 'date-fns';
import React from 'react';

interface GanttChartProps {
  tasks: Task[];
}

const DAY_CELL_WIDTH = 30; // Width of a single day cell in pixels
const ROW_HEIGHT = 40; // Height of a task row
const SIDEBAR_WIDTH = 300; // Width of the task details sidebar

const GanttChart: React.FC<GanttChartProps> = ({ tasks }) => {
  
  const validTasks = tasks.filter(task => task.startDate && task.dueDate).map(task => ({
    ...task,
    startDate: startOfDay(new Date(task.startDate!)),
    dueDate: startOfDay(new Date(task.dueDate!)),
  }));

  if (validTasks.length === 0) {
    return <div className="p-4 text-center text-muted-foreground">No tasks with valid start and end dates to display.</div>;
  }

  const overallStartDate = min(validTasks.map(t => t.startDate));
  const overallEndDate = max(validTasks.map(t => t.dueDate));
  
  const chartStartDate = addDays(overallStartDate, -2); // Add some padding
  const chartEndDate = addDays(overallEndDate, 7);   // Add some padding

  const totalDaysInChart = differenceInDays(chartEndDate, chartStartDate) +1;

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


  return (
    <div className="gantt-chart-container text-xs" style={{ minWidth: SIDEBAR_WIDTH + (weeksInChart.length * (DAY_CELL_WIDTH * 7 / 5))  }}> {/*Approx week width*/}
      {/* Headers */}
      <div className="sticky top-0 z-10 bg-card grid" style={{ gridTemplateColumns: `${SIDEBAR_WIDTH}px 1fr`}}>
        {/* Top-left empty cell / Controls */}
        <div className="h-[60px] border-b border-r flex items-center p-2 font-semibold">Task Details</div>
        {/* Month and Week Headers */}
        <div className="overflow-hidden">
          {/* Month Headers */}
          <div className="grid h-[30px] border-b" style={{ gridTemplateColumns: `repeat(${weeksInChart.length}, minmax(${DAY_CELL_WIDTH * 7 / 5}px, 1fr))`}}>
            {monthHeaders.map((month, index) => (
              <div
                key={index}
                className="flex items-center justify-center border-r font-semibold"
                style={{ gridColumn: `span ${month.span}` }}
              >
                {month.name}
              </div>
            ))}
          </div>
          {/* Week Headers */}
          <div className="grid h-[30px] border-b" style={{ gridTemplateColumns: `repeat(${weeksInChart.length}, minmax(${DAY_CELL_WIDTH * 7 / 5}px, 1fr))`}}>
            {weeksInChart.map((weekStart, index) => (
              <div key={index} className="flex items-center justify-center border-r text-muted-foreground">
                W{getISOWeek(weekStart)}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Task Rows */}
      {validTasks.map((task, taskIndex) => {
        const taskStartDayIndex = differenceInDays(task.startDate, chartStartDate);
        const taskEndDayIndex = differenceInDays(task.dueDate, chartStartDate);
        
        const barLeft = (taskStartDayIndex / totalDaysInChart) * 100;
        const barWidth = ((taskEndDayIndex - taskStartDayIndex + 1) / totalDaysInChart) * 100;

        const isMilestone = isSameDay(task.startDate, task.dueDate);

        return (
          <div
            key={task.id}
            className="grid border-b hover:bg-muted/50"
            style={{ 
              gridTemplateColumns: `${SIDEBAR_WIDTH}px 1fr`,
              height: `${ROW_HEIGHT}px`
            }}
          >
            {/* Task Details Pane */}
            <div className="flex flex-col justify-center p-2 border-r truncate">
              <span className="font-medium truncate" title={task.title}>{task.title}</span>
              <span className="text-muted-foreground text-[10px]">
                {format(task.startDate, 'dd MMM')} - {format(task.dueDate, 'dd MMM yy')}
              </span>
            </div>

            {/* Task Bar Pane */}
            <div className="relative border-r"> {/* Grid lines could be added via background */}
              <div
                title={`${task.title}: ${format(task.startDate, 'P')} - ${format(task.dueDate, 'P')}`}
                className={`absolute h-[60%] top-[20%] rounded ${isMilestone ? 'bg-pink-500 w-3 transform -translate-x-1/2 rotate-45' : 'bg-primary'}`}
                style={{
                  left: isMilestone ? `calc(${barLeft}% + ${DAY_CELL_WIDTH / (totalDaysInChart / (taskStartDayIndex + 0.5)) / 2}px )` : `${barLeft}%`,
                  width: isMilestone ? `10px` : `${barWidth}%`,
                  minWidth: isMilestone ? '10px' : '5px',
                  height: isMilestone ? '10px' : '60%',
                  top: isMilestone ? 'calc(50% - 5px)' : '20%',
                }}
              >
               {!isMilestone && <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-primary-foreground whitespace-nowrap overflow-hidden pr-1">{task.title}</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default GanttChart;
