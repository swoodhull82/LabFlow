
"use client";

import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useAuth, chemistryIconData } from "@/context/AuthContext";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTheme } from "next-themes";
import { useToast } from "@/hooks/use-toast";
import { Save, Loader2, ImageUp, Trash2, UserCheck } from "lucide-react";
import { getUsers } from "@/services/userService";
import type { User } from "@/lib/types";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";


const LOCAL_STORAGE_KEYS = {
  emailNotifications: "labflow-emailNotificationsEnabled",
  pushNotifications: "labflow-pushNotificationsEnabled",
};

export default function SettingsPage() {
  const { user, pbClient, updateUserAvatar, updateUserSelectedIcon, clearAvatarAndSelection } = useAuth();
  const { theme, setTheme } = useTheme(); 
  const { toast } = useToast();

  const [mounted, setMounted] = useState(false);
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState(true);
  const [pushNotificationsEnabled, setPushNotificationsEnabled] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isAvatarDialogOpen, setIsAvatarDialogOpen] = useState(false);

  // State for calendar sharing
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [sharedWithUserIds, setSharedWithUserIds] = useState<Set<string>>(new Set());
  const [isSavingSharing, setIsSavingSharing] = useState(false);


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

    if (pbClient) {
      setIsLoadingUsers(true);
      getUsers(pbClient)
        .then(users => {
          // Filter out the current user from the list of people to share with
          setAllUsers(users.filter(u => u.id !== user?.id));
        })
        .catch(err => {
          console.error("Failed to load users for sharing:", err);
          toast({
            title: "Error Loading Users",
            description: "Could not fetch the list of users for calendar sharing.",
            variant: "destructive",
          });
        })
        .finally(() => {
          setIsLoadingUsers(false);
        });
    }

  }, [pbClient, toast, user?.id]);

  useEffect(() => {
    if (user?.sharesPersonalCalendarWith) {
      setSharedWithUserIds(new Set(user.sharesPersonalCalendarWith));
    }
  }, [user?.sharesPersonalCalendarWith]);


  const handleSavePreferences = () => {
    localStorage.setItem(LOCAL_STORAGE_KEYS.emailNotifications, JSON.stringify(emailNotificationsEnabled));
    localStorage.setItem(LOCAL_STORAGE_KEYS.pushNotifications, JSON.stringify(pushNotificationsEnabled));
    toast({
      title: "Preferences Saved",
      description: "Your notification and theme preferences have been updated.",
    });
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      if (!user || !updateUserAvatar) {
        toast({ title: "Error", description: "User not available for avatar update.", variant: "destructive" });
        return;
      }
      setIsUploading(true);
      setIsAvatarDialogOpen(false); // Close dialog before upload starts
      try {
        await updateUserAvatar(file);
        // Success toast is handled in AuthContext
      } catch (error) {
        // Error toast is handled in AuthContext
        console.error("Avatar upload failed on settings page:", error);
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = ""; // Reset file input
        }
      }
    }
  };

  const handleIconSelect = async (iconName: string) => {
    if (!user || !updateUserSelectedIcon) return;
    setIsUploading(true); // Use same loading state for simplicity
    setIsAvatarDialogOpen(false);
    try {
      await updateUserSelectedIcon(iconName);
    } catch (error) {
      console.error("Icon selection failed:", error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRevertToDefault = async () => {
    if (!user || !clearAvatarAndSelection) return;
    setIsUploading(true);
    setIsAvatarDialogOpen(false);
    try {
      await clearAvatarAndSelection();
    } catch (error) {
      console.error("Revert to default failed:", error);
    } finally {
      setIsUploading(false);
    }
  };
  
  const handleShareUserToggle = (userId: string) => {
    setSharedWithUserIds(prev => {
        const newSet = new Set(prev);
        if (newSet.has(userId)) {
            newSet.delete(userId);
        } else {
            newSet.add(userId);
        }
        return newSet;
    });
  };

  const handleSaveSharing = async () => {
    if (!pbClient || !user) {
        toast({ title: "Error", description: "Not authenticated. Cannot save sharing settings.", variant: "destructive" });
        return;
    }
    setIsSavingSharing(true);
    try {
        await pbClient.collection('users').update(user.id, {
            sharesPersonalCalendarWith: Array.from(sharedWithUserIds)
        });
        toast({ title: "Sharing Settings Saved", description: "Your calendar sharing preferences have been updated." });
    } catch (error: any) {
        console.error("Failed to save sharing settings:", error);
        toast({
            title: "Error Saving Settings",
            description: error.message || "An unexpected error occurred.",
            variant: "destructive"
        });
    } finally {
        setIsSavingSharing(false);
    }
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
                  <Avatar className="h-24 w-24 flex items-center justify-center">
                    {user.lucideIconComponent ? (
                      React.createElement(user.lucideIconComponent, { className: "h-full w-full text-muted-foreground" }) 
                    ) : user.avatarUrl ? (
                      <AvatarImage src={user.avatarUrl} alt={user.name || user.email} />
                    ) : null}
                  </Avatar>
                  
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    style={{ display: 'none' }} 
                    accept="image/png, image/jpeg, image/gif" 
                  />
                  <Dialog open={isAvatarDialogOpen} onOpenChange={setIsAvatarDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" disabled={isUploading}>
                        {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {isUploading ? "Updating..." : "Change Photo"}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Change Profile Photo</DialogTitle>
                        <DialogDescription>
                          Choose a chemistry icon, upload your own photo, or revert to the default.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div>
                          <h3 className="mb-2 text-sm font-medium text-foreground">Select an Icon</h3>
                          <div className="grid grid-cols-4 gap-2">
                            {chemistryIconData.map(icon => (
                              <Button
                                key={icon.name}
                                variant="outline"
                                size="icon"
                                className="h-16 w-16 flex items-center justify-center"
                                onClick={() => handleIconSelect(icon.name)}
                                title={`Select ${icon.name}`}
                              >
                                <icon.component className="h-8 w-8" />
                              </Button>
                            ))}
                          </div>
                        </div>
                        <Separator />
                        <div>
                           <h3 className="mb-2 text-sm font-medium text-foreground">Upload Custom Photo</h3>
                           <Button 
                            variant="outline" 
                            className="w-full"
                            onClick={() => {
                              setIsAvatarDialogOpen(false); // Close dialog first
                              fileInputRef.current?.click();
                            }}
                          >
                            <ImageUp className="mr-2 h-4 w-4" /> Upload Photo
                          </Button>
                        </div>
                         <Separator />
                        <div>
                           <h3 className="mb-2 text-sm font-medium text-foreground">Default</h3>
                           <Button 
                            variant="outline" 
                            className="w-full"
                            onClick={handleRevertToDefault}
                          >
                            <Trash2 className="mr-2 h-4 w-4" /> Use Default Lab Icon
                          </Button>
                        </div>
                      </div>
                      <DialogFooter>
                        <DialogClose asChild>
                            <Button type="button" variant="ghost">Cancel</Button>
                        </DialogClose>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
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

          <Card className="shadow-md">
              <CardHeader>
                  <CardTitle className="text-xl md:text-2xl font-headline">Calendar Sharing</CardTitle>
                  <CardDescription>Select users you want to share your personal calendar with.</CardDescription>
              </CardHeader>
              <CardContent>
                  {isLoadingUsers ? (
                      <div className="flex items-center justify-center h-48">
                          <Loader2 className="h-6 w-6 animate-spin text-primary" />
                          <p className="ml-2 text-muted-foreground">Loading users...</p>
                      </div>
                  ) : (
                      <ScrollArea className="h-48 rounded-md border p-4">
                          <div className="space-y-2">
                            {allUsers.length > 0 ? allUsers.map(u => (
                                <div key={u.id} className="flex items-center space-x-2">
                                    <Checkbox
                                        id={`share-${u.id}`}
                                        checked={sharedWithUserIds.has(u.id)}
                                        onCheckedChange={() => handleShareUserToggle(u.id)}
                                    />
                                    <Label htmlFor={`share-${u.id}`} className="font-normal cursor-pointer">
                                        {u.name} ({u.email})
                                    </Label>
                                </div>
                            )) : (
                               <p className="text-sm text-muted-foreground text-center">No other users available to share with.</p>
                            )}
                          </div>
                      </ScrollArea>
                  )}
              </CardContent>
              <CardFooter className="flex justify-end">
                  <Button onClick={handleSaveSharing} disabled={isSavingSharing || isLoadingUsers}>
                      {isSavingSharing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserCheck className="mr-2 h-4 w-4" />}
                      Save Sharing Settings
                  </Button>
              </CardFooter>
          </Card>

        </div>
      </div>
    </div>
  );
}
