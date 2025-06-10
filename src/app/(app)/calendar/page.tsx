
"use client";

import { Calendar as ShadcnCalendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState, useMemo, useEffect } from "react";
import { format } from "date-fns";
import type { CalendarEvent } from "@/lib/types"; // Updated type
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { getCalendarEvents } from "@/services/calendarEventService"; // Updated service
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export default function CalendarPage() {
  const { pbClient } = useAuth();
  const { toast } = useToast();
  const [allEvents, setAllEvents] = useState<CalendarEvent[]>([]); // Renamed state
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState<Date | undefined>(new Date());

  const fetchEvents = async () => { // Renamed function
    if (!pbClient) return;
    setIsLoading(true);
    setError(null);
    try {
      const fetchedEvents = await getCalendarEvents(pbClient); // Using new service
      setAllEvents(fetchedEvents);
    } catch (err) {
      console.error("Error fetching calendar events:", err);
      setError("Failed to load calendar events.");
      toast({ title: "Error", description: "Failed to load calendar events.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [pbClient]);

  const eventsForSelectedDate = useMemo(() => { // Renamed
    if (!date) return [];
    return allEvents.filter(event => 
      event.eventDate && format(new Date(event.eventDate), "yyyy-MM-dd") === format(date, "yyyy-MM-dd")
    );
  }, [date, allEvents]);

  const eventDates = useMemo(() => { // Renamed
    return allEvents.map(event => event.eventDate ? new Date(event.eventDate) : null).filter(Boolean) as Date[];
  }, [allEvents]);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-headline font-semibold">Event Calendar</h1>
      {isLoading && (
        <div className="flex justify-center items-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2">Loading calendar events...</p>
        </div>
      )}
      {error && !isLoading && (
        <div className="text-center py-10 text-destructive">
          <p>{error}</p>
          <Button onClick={fetchEvents} className="mt-4">Try Again</Button>
        </div>
      )}
      {!isLoading && !error && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 shadow-md">
            <CardContent className="p-0">
              <ShadcnCalendar
                mode="single"
                selected={date}
                onSelect={setDate}
                className="rounded-md"
                modifiers={{ eventDay: eventDates }} // Use a different modifier name if needed
                modifiersClassNames={{ eventDay: "bg-accent/30 rounded-full !text-accent-foreground" }} // Adjusted style for events
              />
            </CardContent>
          </Card>
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle className="font-headline">
                Events for {date ? format(date, "PPP") : "selected date"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {eventsForSelectedDate.length > 0 ? (
                <ul className="space-y-3">
                  {eventsForSelectedDate.map(event => (
                    <li key={event.id} className="p-3 rounded-md border hover:bg-muted transition-colors">
                      <h3 className="font-semibold">{event.title}</h3>
                      {event.description && <p className="text-sm text-muted-foreground mt-1">{event.description}</p>}
                      {/* You can add more event details here, like time, color coded badges etc. */}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">No events scheduled for this day.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
