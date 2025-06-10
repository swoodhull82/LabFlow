
"use client";

import React, { type ReactNode, useEffect, type FC } from 'react';
import { SidebarProvider, Sidebar, SidebarInset } from '@/components/ui/sidebar';
import { SidebarNav } from './SidebarNav';
import { Header } from './Header';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { APP_NAME } from '@/lib/constants';

interface AppLayoutProps {
  children: ReactNode;
}

export const AppLayout: FC<AppLayoutProps> = ({ children }) => {
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
      <Sidebar collapsible="icon" variant="sidebar">
        <SidebarNav />
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
