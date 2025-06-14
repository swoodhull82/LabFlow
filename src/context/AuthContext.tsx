
"use client";

import type { User, UserRole } from "@/lib/types";
import { useRouter } from "next/navigation";
import React, { createContext, useContext, useState, useEffect, type ReactNode, useCallback, useMemo } from "react";
import PocketBase from 'pocketbase';
import { useToast } from "@/hooks/use-toast";
import { FlaskConical, Beaker, Atom, TestTube, Microscope, Pipette, Biohazard, FlaskRound } from 'lucide-react';

const POCKETBASE_URL = 'https://swoodhu.pockethost.io/';
const client = new PocketBase(POCKETBASE_URL);

export const chemistryIconData: { name: string; component: React.ElementType }[] = [
  { name: "FlaskConical", component: FlaskConical },
  { name: "Beaker", component: Beaker },
  { name: "Atom", component: Atom },
  { name: "TestTube", component: TestTube },
  { name: "Microscope", component: Microscope },
  { name: "Pipette", component: Pipette },
  { name: "Biohazard", component: Biohazard },
  { name: "FlaskRound", component: FlaskRound },
];

const chemistryLucideComponentsOnly = chemistryIconData.map(d => d.component);
const chemistryIconMapByName = new Map(chemistryIconData.map(d => [d.name, d.component]));


interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
  pbClient: PocketBase;
  updateUserAvatar: (avatarFile: File) => Promise<void>;
  updateUserSelectedIcon: (iconName: string) => Promise<void>;
  clearAvatarAndSelection: () => Promise<void>;
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

  const appUser: User = {
    id: pbUserModel.id,
    email: pbUserModel.email || "",
    name: (pbUserModel as any).name || pbUserModel.email?.split("@")[0] || "User",
    role: userRole,
    avatarUrl: null,
    lucideIconComponent: undefined,
    selected_lucide_icon: (pbUserModel as any).selected_lucide_icon || undefined,
  };

  if ((pbUserModel as any).avatar && (pbUserModel as any).avatar !== "") {
    appUser.avatarUrl = client.files.getUrl(pbUserModel, (pbUserModel as any).avatar, { thumb: "100x100" });
    appUser.lucideIconComponent = undefined;
  } else if (appUser.selected_lucide_icon && chemistryIconMapByName.has(appUser.selected_lucide_icon)) {
    appUser.lucideIconComponent = chemistryIconMapByName.get(appUser.selected_lucide_icon);
    appUser.avatarUrl = null;
  } else {
    const iconIndex = (pbUserModel.id.charCodeAt(pbUserModel.id.length - 1) % chemistryLucideComponentsOnly.length);
    appUser.lucideIconComponent = chemistryLucideComponentsOnly[iconIndex];
    appUser.avatarUrl = null;
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
    setLoading(true); 

    if (isValid && model) {
      const appUser = createUserFromModel(model);
      setUser(appUser); // Simplified user state update

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
  }, [toast]); 

  const logout = useCallback(() => {
    setLoading(true);
    client.authStore.clear();
    router.push("/"); 
    toast({ title: "Logged Out", description: "You have been successfully logged out." });
  }, [router, toast]);

  const updateUserAvatar = useCallback(async (avatarFile: File) => {
    if (!user || !client.authStore.model) {
      toast({ title: "Error", description: "User not authenticated.", variant: "destructive" });
      throw new Error("User not authenticated or model not available.");
    }
    try {
      const formData = new FormData();
      formData.append('avatar', avatarFile);
      formData.append('selected_lucide_icon', ''); // Clear selected icon preference

      await client.collection('users').update(user.id, formData);
      toast({ title: "Avatar Updated", description: "Your profile picture has been changed." });
    } catch (error: any) {
      console.error("Failed to update avatar:", error);
      let errorMessage = "Failed to update avatar. Please ensure the file is a valid image and not too large.";
      if (error.data?.data?.avatar?.message) {
          errorMessage = `Avatar update failed: ${error.data.data.avatar.message}`;
      } else if (error.data?.message) {
        errorMessage = error.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
      toast({ title: "Avatar Update Failed", description: errorMessage, variant: "destructive" });
      throw error; 
    }
  }, [user, toast]);

  const updateUserSelectedIcon = useCallback(async (iconName: string) => {
    if (!user || !client.authStore.model) {
      toast({ title: "Error", description: "User not authenticated.", variant: "destructive" });
      throw new Error("User not authenticated or model not available.");
    }
    try {
      const data = {
        avatar: null, // Clear uploaded avatar
        selected_lucide_icon: iconName,
      };
      await client.collection('users').update(user.id, data);
      toast({ title: "Icon Updated", description: "Your profile icon has been changed." });
    } catch (error: any) {
      console.error("Failed to update selected icon:", error);
      toast({ title: "Icon Update Failed", description: "Could not update your icon preference.", variant: "destructive" });
      throw error;
    }
  }, [user, toast]);

  const clearAvatarAndSelection = useCallback(async () => {
    if (!user || !client.authStore.model) {
      toast({ title: "Error", description: "User not authenticated.", variant: "destructive" });
      throw new Error("User not authenticated or model not available.");
    }
    try {
      const data = {
        avatar: null,
        selected_lucide_icon: null,
      };
      await client.collection('users').update(user.id, data);
      toast({ title: "Avatar Reset", description: "Your profile picture has been reset to the default." });
    } catch (error: any) {
      console.error("Failed to clear avatar and selection:", error);
      toast({ title: "Avatar Reset Failed", description: "Could not reset your avatar.", variant: "destructive" });
      throw error;
    }
  }, [user, toast]);


  const contextValue = useMemo(() => ({
    user,
    login,
    logout,
    loading,
    pbClient: client,
    updateUserAvatar,
    updateUserSelectedIcon,
    clearAvatarAndSelection,
  }), [user, login, logout, loading, updateUserAvatar, updateUserSelectedIcon, clearAvatarAndSelection]);

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

