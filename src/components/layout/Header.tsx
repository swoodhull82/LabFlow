
"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarImage } from "@/components/ui/avatar"; // Removed AvatarFallback
import { Bell, LogOut, Settings, User as UserIcon, Menu } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import React from "react"; // Import React for React.createElement

export function Header() {
  const { user, logout } = useAuth();
  const { toggleSidebar, isMobile } = useSidebar();

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6 shadow-sm">
      { isMobile ? (
          <Button variant="ghost" size="icon" onClick={toggleSidebar} className="md:hidden">
            <Menu />
            <span className="sr-only">Toggle Sidebar</span>
          </Button>
        ) : (
          <SidebarTrigger className="hidden md:flex" />
      )}
      
      <div className="flex w-full items-center justify-end gap-4">
        <Button variant="ghost" size="icon" className="rounded-full">
          <Bell className="h-5 w-5" />
          <span className="sr-only">Notifications</span>
        </Button>
        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                <Avatar 
                  className="h-9 w-9"
                >
                  {user.lucideIconComponent ? (
                    React.createElement(user.lucideIconComponent, { className: "h-full w-full p-1 text-muted-foreground" })
                  ) : user.avatarUrl ? (
                    <AvatarImage src={user.avatarUrl} alt={user.name || user.email} />
                  ) : null}
                  {/* AvatarFallback removed */}
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{user.name || user.email}</p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {user.email} ({user.role})
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push('/settings')}>
                <UserIcon className="mr-2 h-4 w-4" />
                <span>Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push('/settings')}>
                <Settings className="mr-2 h-4 w-4" />
                <span>Settings</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}

// Added import for router if it was missing for navigation
import { useRouter } from 'next/navigation';
