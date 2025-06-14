
"use client";

import React, { useState, useEffect } from "react"; // Ensured React is imported
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/context/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTheme } from "next-themes";
import { useToast } from "@/hooks/use-toast";
import { Save } from "lucide-react";

const LOCAL_STORAGE_KEYS = {
  emailNotifications: "labflow-emailNotificationsEnabled",
  pushNotifications: "labflow-pushNotificationsEnabled",
};

export default function SettingsPage() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme(); // removed resolvedTheme as it wasn't used
  const { toast } = useToast();

  const [mounted, setMounted] = useState(false);
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState(true);
  const [pushNotificationsEnabled, setPushNotificationsEnabled] = useState(false);

  useEffect(() => {
    setMounted(true);
    const storedEmailPref = localStorage.getItem(LOCAL_STORAGE_KEYS.emailNotifications);
    if (storedEmailPref !== null) {
      setEmailNotificationsEnabled(JSON.parse(storedEmailPref));
    }
    const storedPushPref = localStorage.getItem(LOCAL_STORAGE_KEYS.pushNotifications);
    if (storedPushPref !== null) {
      setPushNotificationsEnabled(JSON.parse(storedPushPref));
    }
  }, []);

  const handleSavePreferences = () => {
    localStorage.setItem(LOCAL_STORAGE_KEYS.emailNotifications, JSON.stringify(emailNotificationsEnabled));
    localStorage.setItem(LOCAL_STORAGE_KEYS.pushNotifications, JSON.stringify(pushNotificationsEnabled));
    toast({
      title: "Preferences Saved",
      description: "Your notification and theme preferences have been updated.",
    });
  };
  
  if (!mounted) {
    return null; 
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl md:text-3xl font-headline font-semibold">Settings</h1>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-1 space-y-6">
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle className="text-xl md:text-2xl font-headline">Profile</CardTitle>
              <CardDescription>Update your personal information.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col items-center space-y-2">
                {user && (
                  <>
                  <Avatar 
                    className="h-24 w-24"
                  >
                    {user.lucideIconComponent ? (
                      React.createElement(user.lucideIconComponent, { className: "h-full w-full p-4 text-muted-foreground" }) // Adjusted padding for larger avatar
                    ) : user.avatarUrl ? (
                      <AvatarImage src={user.avatarUrl} alt={user.name || user.email} />
                    ) : null}
                    <AvatarFallback className="text-3xl">{user.name ? user.name.split(' ').map(n=>n[0]).join('').substring(0,2) : user.email[0].toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <Button variant="outline" size="sm" disabled>Change Photo</Button>
                  </>
                )}
              </div>
              <div>
                <Label htmlFor="name">Name</Label>
                <Input id="name" defaultValue={user?.name || ""} disabled />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" defaultValue={user?.email || ""} readOnly disabled />
              </div>
              <Button className="w-full" disabled>Save Profile</Button>
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-2 space-y-6">
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle className="text-xl md:text-2xl font-headline">Preferences</CardTitle>
              <CardDescription>Customize your LabFlow experience.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="theme-select" className="font-medium">Interface Theme</Label>
                 <p className="text-sm text-muted-foreground">Choose your preferred interface theme.</p>
                <Select value={theme} onValueChange={setTheme}>
                  <SelectTrigger id="theme-select" className="w-[180px]">
                    <SelectValue placeholder="Select theme" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="notifications-email" className="font-medium">Email Notifications</Label>
                  <p className="text-sm text-muted-foreground">Receive updates via email.</p>
                </div>
                <Switch 
                  id="notifications-email" 
                  checked={emailNotificationsEnabled}
                  onCheckedChange={setEmailNotificationsEnabled}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="notifications-push" className="font-medium">Push Notifications</Label>
                  <p className="text-sm text-muted-foreground">Get real-time alerts in the app.</p>
                </div>
                <Switch 
                  id="notifications-push"
                  checked={pushNotificationsEnabled}
                  onCheckedChange={setPushNotificationsEnabled}
                />
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSavePreferences}>
                  <Save className="mr-2 h-4 w-4" />
                  Save Preferences
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
