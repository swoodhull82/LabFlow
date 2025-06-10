"use client";

import React, { type ReactNode, useEffect } from 'react';
import { SidebarProvider, Sidebar, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { SidebarNav } from './SidebarNav';
import { Header } from './Header';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { APP_NAME } from '@/lib/constants';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-lg text-foreground">Loading {APP_NAME}...</p>
      </div>
    );
  }

  if (!user) {
     // Should be redirected by useEffect, but as a fallback:
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="text-lg text-destructive">Access denied. Redirecting to login...</p>
      </div>
    );
  }

  return (
    <SidebarProvider defaultOpen>
      <Sidebar Nav={<SidebarNav />} collapsible="icon" variant="sidebar">
        {/* Sidebar content is managed by Nav prop and internal structure */}
      </Sidebar>
      <SidebarInset>
        <Header />
        <main className="flex-1 p-6 animate-fade-in">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

// This is a helper for the Sidebar component variant="sidebar" when using a Nav prop
// It will be rendered within the Sidebar component if Nav prop is used.
declare module "@/components/ui/sidebar" {
  interface SidebarProps {
    Nav?: React.ReactNode;
  }
}

// Monkey patch or extend Sidebar to accept Nav prop for cleaner AppLayout
const OriginalSidebar = Sidebar;
// @ts-ignore
OriginalSidebar = React.forwardRef<HTMLDivElement, React.ComponentProps<typeof Sidebar> & { Nav?: React.ReactNode }>(
  ({ Nav, children, ...props }, ref) => {
    return (
      <OriginalSidebar ref={ref} {...props}>
        {Nav || children}
      </OriginalSidebar>
    );
  }
);
// @ts-ignore
Sidebar = OriginalSidebar;

