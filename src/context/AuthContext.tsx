
"use client";

import type { User, UserRole } from "@/lib/types";
import { useRouter } from "next/navigation";
import React, { createContext, useContext, useState, useEffect, type ReactNode, useCallback, useMemo } from "react";
import PocketBase from 'pocketbase';
import { useToast } from "@/hooks/use-toast";

const POCKETBASE_URL = 'https://swoodhu.pockethost.io/';
const client = new PocketBase(POCKETBASE_URL);

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
  pbClient: PocketBase;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const VALID_ROLES: UserRole[] = ["Supervisor", "Team Lead", "Chem I", "Chem II"];

// Helper function to create User object from PocketBase model
const createUserFromModel = (pbUserModel: any): User | null => {
  if (!pbUserModel) return null;

  let userRole: UserRole = (pbUserModel as any).role as UserRole;

  if (userRole === "Analyst" as any) {
    userRole = "Chem I";
  }

  if (!VALID_ROLES.includes(userRole)) {
    console.warn(
      `User ${pbUserModel.email || 'Unknown'} has an invalid role ('${(pbUserModel as any).role}') from PocketBase. Defaulting to 'Chem I'. Consider updating the role in PocketBase.`
    );
    userRole = "Chem I";
  }

  return {
    id: pbUserModel.id,
    email: pbUserModel.email || "",
    name: (pbUserModel as any).name || pbUserModel.email?.split("@")[0] || "User",
    role: userRole,
    avatarUrl: (pbUserModel as any).avatar
      ? client.files.getUrl(pbUserModel, (pbUserModel as any).avatar, { thumb: "100x100" })
      : `https://placehold.co/100x100.png?text=${((pbUserModel as any).name || pbUserModel.email || "U")[0].toUpperCase()}`,
  };
};


export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true); // Start as true, initial auth check will set it
  const router = useRouter();
  const { toast } = useToast();

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true); // Indicate login process has started
    try {
      await client.collection('users').authWithPassword(email, password);
      // On success, authStore.onChange (via handleAuthChange) will set user and setLoading(false).
      // We can get immediate model for toast/navigation.
      const model = client.authStore.model;
      if (model) {
        const appUser = createUserFromModel(model);
        if (appUser) {
          toast({ title: "Login Successful", description: `Welcome back, ${appUser.name}!` });
          router.push("/dashboard");
        }
      }
    } catch (error: any) {
      console.error("Login failed (raw error object):", error);
      let errorMessage = "An unexpected error occurred during login. Please try again.";
      if (error && typeof error === 'object') {
        if ('status' in error && error.status === 0) {
          errorMessage = "Failed to connect to the LabFlow server. Please check your internet connection or try again later if the server is temporarily unavailable.";
        } else if ('status' in error && (error.status === 400 || error.status === 401 || error.status === 403)) {
          if (error.data?.data && Object.keys(error.data.data).length > 0) {
            const fieldErrors = Object.values(error.data.data).map((err: any) => err.message).join(" ");
            errorMessage = `Login failed: ${fieldErrors}`;
          } else if (error.data?.message) {
            errorMessage = error.data.message;
          } else {
            errorMessage = "Invalid email or password. Please try again.";
          }
        } else if (error.data?.data && Object.keys(error.data.data).length > 0) {
           const fieldErrors = Object.values(error.data.data).map((err: any) => err.message).join(" ");
           errorMessage = `Login error: ${fieldErrors}`;
        } else if (error.message && typeof error.message === 'string' && !error.message.startsWith("PocketBase_ClientResponseError")) {
          errorMessage = error.message;
        } else if (error.originalError?.message && typeof error.originalError.message === 'string') {
          errorMessage = error.originalError.message;
        } else if (error.message && typeof error.message === 'string') {
             errorMessage = `Login failed: ${error.message}. Please ensure the server is reachable.`;
        }
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      console.error("Login failed (processed errorMessage):", errorMessage);
      toast({ title: "Login Failed", description: errorMessage, variant: "destructive" });
      setLoading(false); // Ensure loading is false if login itself throws an error
    }
  }, [router, toast]);

  const logout = useCallback(() => {
    setLoading(true); // Indicate logout process has started
    client.authStore.clear(); // This will trigger authStore.onChange, which calls setLoading(false)
    router.push("/");
    toast({ title: "Logged Out", description: "You have been successfully logged out." });
  }, [router, toast]);

  useEffect(() => {
    const handleAuthChange = () => {
      const model = client.authStore.model;
      const isValid = client.authStore.isValid;

      if (isValid && model) {
        const appUser = createUserFromModel(model);
        setUser(currentUser => {
          if (!appUser) return null; // If createUserFromModel returns null
          if (currentUser &&
              currentUser.id === appUser.id &&
              currentUser.name === appUser.name &&
              currentUser.email === appUser.email &&
              currentUser.role === appUser.role &&
              currentUser.avatarUrl === appUser.avatarUrl) {
            return currentUser; // Data is the same, don't trigger re-render from setUser
          }
          return appUser; // Data is different or currentUser is null, update user state
        });

        if (appUser) {
          localStorage.setItem("labflowUserRole", appUser.role);
        } else {
          localStorage.removeItem("labflowUserRole");
        }
      } else {
        setUser(null);
        localStorage.removeItem("labflowUserRole");
      }
      setLoading(false); // Auth state determined, set loading to false.
    };

    // The `true` flag ensures handleAuthChange is called immediately with current auth state,
    // then on any subsequent changes.
    const unsubscribe = client.authStore.onChange(handleAuthChange, true);

    return () => {
      unsubscribe();
    };
  }, []); // Empty dependency array ensures this effect runs once on mount and cleans up on unmount.

  const contextValue = useMemo(() => ({
    user,
    login,
    logout,
    loading,
    pbClient: client
  }), [user, login, logout, loading]);

  return (
    <AuthContext.Provider value={contextValue}>
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
