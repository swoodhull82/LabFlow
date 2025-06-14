
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

const chemistryKeywords = ["atom molecule", "chemistry flask", "lab beaker", "electron microscope", "dna helix", "science experiment", "chemistry reaction"];

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

  const appUser: User = {
    id: pbUserModel.id,
    email: pbUserModel.email || "",
    name: (pbUserModel as any).name || pbUserModel.email?.split("@")[0] || "User",
    role: userRole,
    avatarUrl: "", 
    avatarPlaceholderKeyword: undefined,
  };

  if ((pbUserModel as any).avatar && (pbUserModel as any).avatar !== "") {
    appUser.avatarUrl = client.files.getUrl(pbUserModel, (pbUserModel as any).avatar, { thumb: "100x100" });
    // Optionally, set a generic hint for real avatars if needed, or leave undefined
    // appUser.avatarPlaceholderKeyword = "profile photo"; 
  } else {
    // Select a keyword deterministically based on user ID
    const keywordIndex = (pbUserModel.id.charCodeAt(pbUserModel.id.length - 1) % chemistryKeywords.length);
    appUser.avatarPlaceholderKeyword = chemistryKeywords[keywordIndex];
    appUser.avatarUrl = `https://placehold.co/100x100.png`; // Generic placeholder URL
  }
  
  return appUser;
};


export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const { toast } = useToast();

  const handleAuthChange = useCallback(() => {
    const model = client.authStore.model;
    const isValid = client.authStore.isValid;

    if (isValid && model) {
      const appUser = createUserFromModel(model);
      setUser(currentUser => {
        if (!appUser) return null;
        // Prevent unnecessary re-renders if user object is deeply equal
        if (currentUser &&
            currentUser.id === appUser.id &&
            currentUser.name === appUser.name &&
            currentUser.email === appUser.email &&
            currentUser.role === appUser.role &&
            currentUser.avatarUrl === appUser.avatarUrl &&
            currentUser.avatarPlaceholderKeyword === appUser.avatarPlaceholderKeyword) {
          return currentUser;
        }
        return appUser;
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
    setLoading(false);
  }, []);

  useEffect(() => {
    const unsubscribe = client.authStore.onChange(handleAuthChange, true);
    return () => {
      unsubscribe();
    };
  }, [handleAuthChange]);


  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      await client.collection('users').authWithPassword(email, password);
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
      setLoading(false);
    }
  }, [router, toast]);

  const logout = useCallback(() => {
    setLoading(true);
    client.authStore.clear();
    router.push("/");
    toast({ title: "Logged Out", description: "You have been successfully logged out." });
  }, [router, toast]);

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

