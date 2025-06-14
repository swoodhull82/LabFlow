
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/context/AuthContext";
import {
  LayoutDashboard,
  CalendarDays,
  ClipboardList,
  Users,
  Settings,
  LogOut,
  ChevronsLeft,
  ChevronsRight,
  History,
  ListChecks, 
} from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  supervisorOnly?: boolean; 
}

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/tasks", label: "Tasks", icon: ClipboardList },
  { href: "/validations", label: "Validations", icon: ListChecks },
  { href: "/employees", label: "Employees", icon: Users, supervisorOnly: true }, 
  { href: "/activity-log", label: "Activity Log", icon: History, supervisorOnly: true }, 
  { href: "/settings", label: "Settings", icon: Settings },
];

export function SidebarNav() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { toggleSidebar, state } = useSidebar();

  const filteredNavItems = navItems.filter(item => {
    if (item.href === "/activity-log" || item.href === "/employees") {
      return user && user.role === "Supervisor";
    }
    if (item.supervisorOnly) { 
      return user && (user.role === "Supervisor" || user.role === "Team Lead");
    }
    return true;
  }).sort((a, b) => { 
    if (a.label === "Settings") return 1;
    if (b.label === "Settings") return -1;
    return 0;
  });

  return (
    <>
      <SidebarHeader className="flex items-center justify-between p-4 border-b border-sidebar-border">
        <Logo />
        <Button variant="ghost" size="icon" onClick={toggleSidebar} className="md:hidden">
           {state === 'expanded' ? <ChevronsLeft /> : <ChevronsRight />}
        </Button>
      </SidebarHeader>
      <SidebarContent className="p-2">
        <SidebarMenu>
          {filteredNavItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <Link href={item.href}>
                <SidebarMenuButton
                  isActive={pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href))}
                  tooltip={{ children: item.label, side: "right", align: "center" }}
                >
                  <item.icon />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="p-4 border-t border-sidebar-border">
        <Button variant="ghost" className="w-full justify-start" onClick={logout}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>Logout</span>
        </Button>
      </SidebarFooter>
    </>
  );
}
