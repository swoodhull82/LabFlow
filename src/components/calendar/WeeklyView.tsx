
'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { add, format, startOfWeek, eachDayOfInterval, isToday, getHours, getMinutes, differenceInMinutes, isValid, set } from 'date-fns';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card';
import type { CalendarEvent } from '@/lib/types';
import { cn } from '@/lib/utils';

// Constants for the view
const START_HOUR = 6; // 6 AM
const END_HOUR = 18; // Ends at 6 PM (18:00)
const HOUR_HEIGHT_PX = 60; // Height of one hour slot in pixels

const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => {
    const hour = i + START_HOUR;
    if (hour === 12) return '12 PM';
    if (hour > 12) return `${hour - 12} PM`;
    return `${hour} AM`;
});

const getEventColorClass = (event: CalendarEvent): string => {
    if (event.eventType === 'Out of Office') {
        return "border-green-500 bg-green-50 text-green-900 dark:bg-green-900/20 dark:border-green-500/70 dark:text-green-100";
    }
    // Fallback to priority-based coloring for other events ('Busy' or undefined)
    const priority = event.priority;
    if (!priority) return "border-gray-400 bg-gray-100 text-gray-800 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200";
    const lowerPriority = priority.toLowerCase();
    switch (lowerPriority) {
        case "urgent": return "border-red-500 bg-red-50 text-red-900 dark:bg-red-900/20 dark:border-red-500/70 dark:text-red-100";
        case "high": return "border-orange-500 bg-orange-50 text-orange-900 dark:bg-orange-900/20 dark:border-orange-500/70 dark:text-orange-100";
        case "medium": return "border-blue-500 bg-blue-50 text-blue-900 dark:bg-blue-900/20 dark:border-blue-500/70 dark:text-blue-100";
        case "low": return "border-slate-500 bg-slate-50 text-slate-900 dark:bg-slate-900/20 dark:border-slate-500/70 dark:text-slate-100";
        default: return "border-gray-400 bg-gray-100 text-gray-800 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200";
    }
};

const NowIndicator = ({ dayColumns }: { dayColumns: Date[] }) => {
    const [now, setNow] = useState(new Date());
    const todayColumnIndex = dayColumns.findIndex(day => isToday(day));

    useEffect(() => {
        const timer = setInterval(() => {
            setNow(new Date());
        }, 60 * 1000); // Update every minute
        return () => clearInterval(timer);
    }, []);

    if (todayColumnIndex === -1) return null;
    
    const hoursFromStart = getHours(now) + getMinutes(now) / 60 - START_HOUR;
    if (hoursFromStart < 0 || hoursFromStart > (END_HOUR - START_HOUR)) return null;

    const topPosition = hoursFromStart * HOUR_HEIGHT_PX;

    return (
        <div 
          className="absolute z-10 pointer-events-none" 
          style={{ 
            left: `calc(${todayColumnIndex * 20}%)`, // 20% width for each of 5 columns
            width: '20%',
            top: `${topPosition}px`,
          }}
        >
            <div className="relative h-px bg-destructive w-full">
                <div className="absolute -left-1.5 -top-1.5 h-3 w-3 rounded-full bg-destructive border-2 border-background"></div>
            </div>
        </div>
    );
};


interface WeeklyViewProps {
    events: CalendarEvent[];
    onHourSlotClick: (date: Date) => void;
    onEventClick: (event: CalendarEvent) => void;
}

export default function WeeklyView({ events, onHourSlotClick, onEventClick }: WeeklyViewProps) {
    const [currentDate, setCurrentDate] = useState(new Date());
    const containerRef = useRef<HTMLDivElement>(null);
    const headerRef = useRef<HTMLDivElement>(null);
    const timeGutterRef = useRef<HTMLDivElement>(null);

    // Scroll to 8 AM on initial load
    useEffect(() => {
        if (containerRef.current) {
            const scrollToPosition = (8 - START_HOUR) * HOUR_HEIGHT_PX;
            containerRef.current.scrollTop = scrollToPosition;
        }
    }, []);

    // Sync vertical scroll between time gutter and main grid
    useEffect(() => {
        const mainEl = containerRef.current;
        const gutterEl = timeGutterRef.current;
        if (!mainEl || !gutterEl) return;

        const handleScroll = () => {
            gutterEl.scrollTop = mainEl.scrollTop;
        };

        mainEl.addEventListener('scroll', handleScroll);
        return () => mainEl.removeEventListener('scroll', handleScroll);
    }, []);

    const startOfCurrentWeek = startOfWeek(currentDate, { weekStartsOn: 1 }); // Monday
    const daysInWeek = eachDayOfInterval({
        start: startOfCurrentWeek,
        end: add(startOfCurrentWeek, { days: 4 }), // Monday to Friday
    });

    const eventsByDay = useMemo(() => {
        const map = new Map<string, CalendarEvent[]>();
        daysInWeek.forEach(day => {
            map.set(format(day, 'yyyy-MM-dd'), []);
        });
        events.forEach(event => {
            if (event.startDate) {
                const eventDate = new Date(event.startDate);
                if (!isValid(eventDate)) return;
                const eventDayStr = format(eventDate, 'yyyy-MM-dd');
                if(map.has(eventDayStr)) {
                    map.get(eventDayStr)?.push(event);
                }
            }
        });
        map.forEach((dayEvents) => {
            dayEvents.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
        });
        return map;
    }, [events, daysInWeek]);

    const handlePrevWeek = () => setCurrentDate(current => add(current, { weeks: -1 }));
    const handleNextWeek = () => setCurrentDate(current => add(current, { weeks: 1 }));
    const handleToday = () => setCurrentDate(new Date());

    return (
        <Card className="shadow-md overflow-hidden flex flex-col h-[calc(100vh-200px)]">
            <CardHeader className="flex flex-row items-center justify-between gap-4 border-b p-3 flex-shrink-0">
                 <div className="flex items-center gap-4">
                    <span className="text-lg font-semibold">{format(startOfCurrentWeek, 'MMMM yyyy')}</span>
                    <Button variant="outline" size="sm" onClick={handleToday}>Today</Button>
                 </div>
                 <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={handlePrevWeek}><ChevronLeft className="h-5 w-5" /></Button>
                    <Button variant="ghost" size="icon" onClick={handleNextWeek}><ChevronRight className="h-5 w-5" /></Button>
                </div>
            </CardHeader>
            <div className="flex flex-grow min-h-0">
                {/* Time Gutter */}
                <div className="w-20 text-sm text-right flex-shrink-0">
                     <div ref={headerRef} className="h-20" /> {/* Spacer for header */}
                     <div ref={timeGutterRef} className="overflow-hidden" style={{ height: `calc(100% - 5rem)` }}>
                        {hours.map((hour, index) => (
                            <div key={hour} className="relative pr-2" style={{height: `${HOUR_HEIGHT_PX}px`}}>
                                <span className={cn(
                                    "absolute right-2 text-muted-foreground",
                                    index === 0 ? "top-0" : "-top-2.5"
                                )}>
                                    {hour}
                                </span>
                            </div>
                         ))}
                    </div>
                </div>

                {/* Main Calendar Grid */}
                <div className="flex-grow overflow-hidden relative" >
                    {/* Sticky Day Header */}
                    <div className="grid grid-cols-5 sticky top-0 bg-card z-20 border-b">
                        {daysInWeek.map(day => (
                            <div key={day.toString()} className="h-20 flex flex-col items-center justify-center border-l py-2">
                                <p className="text-sm font-medium text-muted-foreground">{format(day, 'EEE')}</p>
                                <div className={cn(
                                    "mt-1 w-8 h-8 flex items-center justify-center rounded-full text-lg font-semibold",
                                    isToday(day) && 'bg-primary text-primary-foreground'
                                )}>
                                  {format(day, 'd')}
                                </div>
                            </div>
                        ))}
                    </div>
                    {/* Scrollable grid content */}
                    <div ref={containerRef} className="overflow-y-auto h-full">
                        <div className="grid grid-cols-5 relative min-h-full">
                            {/* Background grid lines and clickable slots */}
                            {daysInWeek.map((day, dayIndex) => (
                                <div key={`col-${day.toString()}`} className="relative border-l">
                                    {Array.from({ length: END_HOUR - START_HOUR }).map((_, hourIndex) => {
                                        const hour = START_HOUR + hourIndex;
                                        const slotDate = set(day, { hours: hour, minutes: 0, seconds: 0, milliseconds: 0});
                                        return (
                                            <div
                                                key={`${dayIndex}-${hourIndex}`}
                                                onClick={() => onHourSlotClick(slotDate)}
                                                className="border-b border-border/70 hover:bg-accent transition-colors cursor-pointer"
                                                style={{height: `${HOUR_HEIGHT_PX}px`}}
                                            />
                                        );
                                    })}
                                </div>
                            ))}
                            
                            {/* Render events */}
                            {Array.from(eventsByDay.entries()).map(([dayString, dayEvents], dayIndex) => {
                                return dayEvents.map(event => {
                                    const startDate = new Date(event.startDate);
                                    const endDate = new Date(event.endDate);

                                    if (!isValid(startDate) || !isValid(endDate)) return null;

                                    const startMinutes = getHours(startDate) * 60 + getMinutes(startDate);
                                    const endMinutes = getHours(endDate) * 60 + getMinutes(endDate);

                                    if (endMinutes < START_HOUR * 60 || startMinutes >= END_HOUR * 60) return null;

                                    const topOffsetMinutes = Math.max(0, startMinutes - (START_HOUR * 60));
                                    const top = (topOffsetMinutes / 60) * HOUR_HEIGHT_PX;

                                    const durationMinutes = Math.max(15, differenceInMinutes(endDate, startDate));
                                    const height = (durationMinutes / 60) * HOUR_HEIGHT_PX - 2;

                                    return (
                                        <div 
                                            key={event.id}
                                            onClick={() => onEventClick(event)}
                                            className={cn(
                                                "absolute p-2 rounded-md cursor-pointer transition-all shadow-sm hover:shadow-md overflow-hidden z-[5] border-l-4",
                                                getEventColorClass(event),
                                                event.isAllDay && "opacity-90"
                                            )}
                                            style={{ 
                                              top: `${top}px`, 
                                              height: `${height}px`,
                                              left: `calc(${dayIndex * 20}% + 4px)`, // 20% width per column
                                              width: 'calc(20% - 8px)',
                                            }}
                                            title={`${event.title}${event.isAllDay ? ' (All-day)' : ` - ${format(startDate, 'h:mm a')}`}`}
                                        >
                                            <p className="font-semibold text-xs truncate">{event.title}</p>
                                            {!event.isAllDay && <p className="text-[10px] opacity-80">{format(startDate, 'h:mm a')} - {format(endDate, 'h:mm a')}</p>}
                                        </div>
                                    )
                                })
                            })}

                            {/* Now indicator overlay */}
                             <NowIndicator dayColumns={daysInWeek} />
                        </div>
                    </div>
                </div>
            </div>
        </Card>
    );
}
