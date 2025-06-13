
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

  // Map potential old "Analyst" role from PB to "Chem I"
  if (userRole === "Analyst" as any) {
    userRole = "Chem I";
  }

  // Validate the role from PocketBase. If it's not one of the VALID_ROLES,
  // default to "Chem I" and log a warning.
  if (!VALID_ROLES.includes(userRole)) {
    console.warn(
      `User ${pbUserModel.email || 'Unknown'} has an invalid role ('${(pbUserModel as any).role}') from PocketBase. Defaulting to 'Chem I'. Consider updating the role in PocketBase.`
    );
    userRole = "Chem I"; // Default to a safe, non-privileged role
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
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    setLoading(true); 

    const handleAuthChange = () => {
      const model = client.authStore.model;
      if (client.authStore.isValid && model) {
        const appUser = createUserFromModel(model);
        if (appUser) {
          setUser(appUser);
          localStorage.setItem("labflowUserRole", appUser.role);
        } else {
          // This case means createUserFromModel returned null, though model was truthy.
          // This might happen if model is an empty object or somehow invalid for createUserFromModel.
          console.error("AuthStore model was present but failed to create app user object.");
          setUser(null);
          localStorage.removeItem("labflowUserRole");
        }
      } else {
        setUser(null);
        localStorage.removeItem("labflowUserRole");
      }
      setLoading(false); 
    };

    // Subscribe to authStore changes. The `true` flag calls handleAuthChange immediately
    // to set the initial state based on any persisted token.
    const unsubscribe = client.authStore.onChange(handleAuthChange, true);

    return () => {
      unsubscribe(); // Cleanup subscription on unmount
    };
  }, []); // Empty dependency array: set up subscription once


  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      await client.collection('users').authWithPassword(email, password);
      // authStore.onChange will handle setting the user state.
      // We just need to get the user details for the toast and routing.
      const model = client.authStore.model;
      if (model) {
        const appUser = createUserFromModel(model); // Use the helper
        if (appUser) {
          toast({ title: "Login Successful", description: `Welcome back, ${appUser.name}!` });
          router.push("/dashboard");
        } else {
          // This should be rare if authWithPassword succeeded and model is present.
          throw new Error("Authentication successful but failed to process user model.");
        }
      } else {
        throw new Error("Authentication successful but no user model found in authStore.");
      }
    } catch (error: any) {
      console.error("Login failed:", error);
      let errorMessage = "Login failed. Please check your credentials.";
      if (error.data && error.data.data) {
        const fieldErrors = Object.values(error.data.data).map((err: any) => err.message).join(", ");
        if (fieldErrors) errorMessage = fieldErrors;
      } else if (error.message && !error.message.startsWith("PocketBase_ClientResponseError")) { // Avoid generic PB messages if possible
        errorMessage = error.message;
      } else if (error.originalError && error.originalError.message) {
        errorMessage = error.originalError.message;
      } else if (error.status === 0) {
        errorMessage = "Could not connect to the server. Please check your internet connection.";
      } else if (error.status === 400 || error.status === 401 || error.status === 403) {
         errorMessage = "Invalid email or password. Please try again.";
      }
      
      toast({ title: "Login Failed", description: errorMessage, variant: "destructive" });
      // User state will be set to null by the onChange listener if authStore becomes invalid.
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    client.authStore.clear();
    // authStore.onChange will handle setting user to null and removing from localStorage.
    router.push("/"); // Redirect to login page.
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
