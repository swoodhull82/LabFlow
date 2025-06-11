
"use client";

import type { User, UserRole } from "@/lib/types";
import { useRouter } from "next/navigation";
import React, { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import PocketBase from 'pocketbase';
import { useToast } from "@/hooks/use-toast";

const POCKETBASE_URL = 'https://swoodhu.pockethost.io/';
const client = new PocketBase(POCKETBASE_URL);

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string, roleFromForm: UserRole) => Promise<void>;
  logout: () => void;
  loading: boolean;
  pbClient: PocketBase;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    setLoading(true);
    const restoreSession = async () => {
      if (client.authStore.isValid && client.authStore.model) {
        const pbUser = client.authStore.model;
        // PocketBase SDK automatically refreshes the token if needed
        // For role, prioritize PB record, then localStorage, then default
        let userRole: UserRole = (pbUser as any).role as UserRole; // Type assertion
        if (!userRole || (userRole !== "Supervisor" && userRole !== "Analyst")) {
          const storedRole = localStorage.getItem("labflowUserRole") as UserRole | null;
          userRole = storedRole || "Analyst"; // Default to Analyst
        }
        
        const currentUser: User = {
          id: pbUser.id,
          email: pbUser.email || "",
          name: (pbUser as any).name || pbUser.email?.split("@")[0] || "User",
          role: userRole,
          avatarUrl: (pbUser as any).avatar
            ? client.files.getUrl(pbUser, (pbUser as any).avatar, { thumb: "100x100" })
            : `https://placehold.co/100x100.png?text=${((pbUser as any).name || pbUser.email || "U")[0].toUpperCase()}`,
        };
        setUser(currentUser);
        // Persist the role if it was determined from localStorage or default, to keep it consistent
        if (userRole && userRole !== (pbUser as any).role) {
            localStorage.setItem("labflowUserRole", userRole);
        }
      }
    };
    
    restoreSession().finally(() => setLoading(false));

  }, []);

  const login = async (email: string, password: string, roleFromForm: UserRole) => {
    setLoading(true);
    try {
      await client.collection('users').authWithPassword(email, password);
      if (client.authStore.model) {
        const pbUser = client.authStore.model;
        
        let determinedRole: UserRole = (pbUser as any).role as UserRole;
        if (!determinedRole || (determinedRole !== "Supervisor" && determinedRole !== "Analyst")) {
          determinedRole = roleFromForm;
        }
        if (!determinedRole) {
            determinedRole = "Analyst"; // Fallback if somehow still not set
        }

        const currentUser: User = {
          id: pbUser.id,
          email: pbUser.email || "",
          name: (pbUser as any).name || pbUser.email?.split("@")[0] || "User",
          role: determinedRole,
          avatarUrl: (pbUser as any).avatar
            ? client.files.getUrl(pbUser, (pbUser as any).avatar, { thumb: "100x100" })
            : `https://placehold.co/100x100.png?text=${((pbUser as any).name || pbUser.email || "U")[0].toUpperCase()}`,
        };
        setUser(currentUser);
        localStorage.setItem("labflowUserRole", currentUser.role); // Persist determined role
        
        toast({ title: "Login Successful", description: `Welcome back, ${currentUser.name}!` });
        router.push("/dashboard");
      } else {
        throw new Error("Authentication successful but no user model found.");
      }
    } catch (error: any) {
      console.error("Login failed:", error);
      let errorMessage = "Login failed. Please check your credentials.";
      if (error.data && error.data.data) {
        const fieldErrors = Object.values(error.data.data).map((err: any) => err.message).join(", ");
        if (fieldErrors) errorMessage = fieldErrors;
      } else if (error.message) {
        errorMessage = error.message;
      }
      toast({ title: "Login Failed", description: errorMessage, variant: "destructive" });
      setUser(null); // Ensure user is cleared on failed login
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    client.authStore.clear();
    setUser(null);
    localStorage.removeItem("labflowUserRole");
    router.push("/");
    toast({ title: "Logged Out", description: "You have been successfully logged out." });
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, pbClient: client }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
