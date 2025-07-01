'use client';

import { useState, useMemo } from 'react';
import { add, format, startOfWeek, eachDayOfInterval, isToday } from 'date-fns';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type { CalendarEvent } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

const hours = Array.from({ length: 12 }, (_, i) => {
    const hour = i + 6;
    if (hour === 12) return '12 PM';
    if (hour > 12) return `${hour - 12} PM`;
    return `${hour} AM`;
}); // 6 AM to 5 PM (17:00)

const getPriorityBadgeVariant = (priority?: string) => {
  if (!priority) return "default";
  const lowerPriority = priority.toLowerCase();
  switch (lowerPriority) {
    case "urgent": return "destructive";
    case "high": return "destructive";
    case "medium": return "secondary";
    case "low": return "outline";
    default: return "default";
  }
};


interface WeeklyViewProps {
    events: CalendarEvent[];
}

export default function WeeklyView({ events }: WeeklyViewProps) {
    const [currentDate, setCurrentDate] = useState(new Date());

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
            if (event.eventDate) {
                const eventDayStr = format(new Date(event.eventDate), 'yyyy-MM-dd');
                if(map.has(eventDayStr)) {
                    map.get(eventDayStr)?.push(event);
                }
            }
        });
        // Sort events within each day
        map.forEach((dayEvents) => {
            dayEvents.sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime());
        });
        return map;
    }, [events, daysInWeek]);

    const handlePrevWeek = () => {
        setCurrentDate(current => add(current, { weeks: -1 }));
    };
    
    const handleNextWeek = () => {
        setCurrentDate(current => add(current, { weeks: 1 }));
    };

    const handleToday = () => {
        setCurrentDate(new Date());
    }

    return (
        <Card className="shadow-md">
            <CardHeader className="flex flex-row items-center justify-between gap-4">
                 <h2 className="text-lg font-semibold">{format(startOfCurrentWeek, 'MMMM yyyy')}</h2>
                 <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleToday}>Today</Button>
                    <div className="flex items-center gap-1">
                        <Button variant="outline" size="icon" onClick={handlePrevWeek}><ChevronLeft className="h-4 w-4" /></Button>
                        <Button variant="outline" size="icon" onClick={handleNextWeek}><ChevronRight className="h-4 w-4" /></Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
                <div className="grid grid-cols-[auto,1fr] min-w-[800px]">
                    {/* Time column */}
                    <div className="flex flex-col border-r">
                         <div className="h-16 border-b sticky left-0 bg-card z-10"></div> {/* Empty corner */}
                         {hours.map(hour => (
                            <div key={hour} className="h-24 flex items-center justify-end text-xs text-muted-foreground pr-2 border-b">
                                <span className="relative -top-2.5">{hour}</span>
                            </div>
                         ))}
                    </div>

                    {/* Day columns */}
                    <div className="grid grid-cols-5 flex-grow">
                        {daysInWeek.map(day => (
                            <div key={day.toString()} className="flex flex-col border-r last:border-r-0">
                                <div className="h-16 flex flex-col items-center justify-center border-b sticky top-0 bg-card z-10">
                                    <p className="text-sm text-muted-foreground">{format(day, 'EEE')}</p>
                                    <p className={cn("text-2xl font-semibold", isToday(day) && 'text-primary')}>{format(day, 'd')}</p>
                                </div>
                                <div className="relative flex-grow">
                                    {/* Hour lines */}
                                    {hours.map((_, index) => (
                                        <div key={index} className="h-24 border-b"></div>
                                    ))}
                                    {/* Event rendering */}
                                    <div className="absolute inset-0 p-1 space-y-1 overflow-y-auto">
                                        {(eventsByDay.get(format(day, 'yyyy-MM-dd')) || []).map(event => (
                                            <div key={event.id} className="p-1.5 rounded-md bg-primary/10 border border-primary/20 text-xs cursor-pointer hover:bg-primary/20 transition-colors">
                                                <p className="font-semibold text-primary/90 truncate">{event.title}</p>
                                                <div className="flex justify-between items-center mt-1">
                                                     <Badge variant={getPriorityBadgeVariant(event.priority)} className="text-[10px] px-1.5 py-0">{event.priority || 'N/A'}</Badge>
                                                     <p className="text-muted-foreground">{format(new Date(event.eventDate), 'h:mm a')}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
