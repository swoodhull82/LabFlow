
'use client';
import type { User } from "@/lib/types";
import PocketBase from 'pocketbase';
import { withRetry } from '@/lib/retry';

const COLLECTION_NAME = "users";

// This is a simplified converter for the purpose of listing users to share with.
// It doesn't include avatar/icon logic as that's handled in AuthContext for the logged-in user.
const pbRecordToUser = (record: any): User => {
  return {
    id: record.id,
    email: record.email,
    name: record.name || record.email.split('@')[0] || 'User',
    role: record.role, // assuming role is always present
    sharesPersonalCalendarWith: record.sharesPersonalCalendarWith || [],
  };
};

export const getUsers = async (pb: PocketBase, options?: { signal?: AbortSignal }): Promise<User[]> => {
  try {
    const records = await withRetry(() =>
      pb.collection(COLLECTION_NAME).getFullList({
          sort: 'name',
          fields: 'id,name,email,role' // Only fetch fields needed for the sharing list
      }, { signal: options?.signal }),
      { ...options, context: "fetching all users" }
    );
    return records.map(pbRecordToUser);
  } catch (error: any) {
    const isCancellation = error?.isAbort === true || (error?.message && (error.message.toLowerCase().includes('aborted') || error.message.toLowerCase().includes('autocancelled')));
    if (isCancellation) {
        // This is an expected cancellation, not a true error. Re-throw it so the component can ignore it.
        throw error;
    }
    // For all other "real" errors, log them.
    console.error("Failed to fetch users:", error);
    throw error;
  }
};
