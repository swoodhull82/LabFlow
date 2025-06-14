
'use client';
import type { Employee } from "@/lib/types";
import type PocketBase from 'pocketbase';
import { withRetry } from '@/lib/retry';

const COLLECTION_NAME = "employees";

interface PocketBaseRequestOptions {
  signal?: AbortSignal;
  onRetry?: (attempt: number, maxAttempts: number, error: any) => void; 
  [key: string]: any;
}

// Helper to convert PocketBase record to Employee type
const pbRecordToEmployee = (record: any): Employee => {
  return {
    id: record.id,
    name: record.name,
    email: record.email,
    role: record.role, 
    reportsTo_text: record.reportsTo_text,
    department_text: record.department_text,
    userId: record.userId, 
    created: record.created ? new Date(record.created) : undefined,
    updated: record.updated ? new Date(record.updated) : undefined,
    collectionId: record.collectionId,
    collectionName: record.collectionName,
    expand: record.expand,
  };
};

const DEFAULT_EMPLOYEE_FIELDS = 'id,name,email,role,department_text,reportsTo_text,userId,created,updated';

export const getEmployees = async (pb: PocketBase, options?: PocketBaseRequestOptions): Promise<Employee[]> => {
  try {
    const { onRetry, signal, ...otherOptions } = options || {}; 
    const requestParams = {
      sort: 'name',
      fields: DEFAULT_EMPLOYEE_FIELDS,
      ...otherOptions, 
    };
    const records = await withRetry(() => 
      pb.collection(COLLECTION_NAME).getFullList(requestParams, { signal }),
      {
        signal, // Pass signal for retry logic
        context: "fetching employees list",
        onRetry 
      }
    );
    return records.map(pbRecordToEmployee);
  } catch (error) {
    throw error;
  }
};

export const createEmployee = async (pb: PocketBase, employeeData: Partial<Omit<Employee, 'id' | 'created' | 'updated'>> | FormData, options?: PocketBaseRequestOptions): Promise<Employee> => {
  try {
    const record = await pb.collection(COLLECTION_NAME).create(employeeData, { signal: options?.signal });
    return pbRecordToEmployee(record);
  } catch (error) {
    console.error("Failed to create employee:", error);
    throw error;
  }
};

export const updateEmployee = async (pb: PocketBase, id: string, employeeData: Partial<Employee> | FormData, options?: PocketBaseRequestOptions): Promise<Employee> => {
  try {
    const { signal } = options || {};
    const record = await withRetry(() =>
      pb.collection(COLLECTION_NAME).update(id, employeeData, { signal }),
      { context: `updating employee ${id}`, signal }
    );
    return pbRecordToEmployee(record);
  } catch (error) {
    console.error(`Failed to update employee ${id}:`, error);
    throw error;
  }
};

export const deleteEmployee = async (pb: PocketBase, id: string, options?: PocketBaseRequestOptions): Promise<void> => {
  try {
    const { signal } = options || {};
    await withRetry(() =>
      pb.collection(COLLECTION_NAME).delete(id, { signal }),
      { context: `deleting employee ${id}`, signal }
    );
  } catch (error) {
    console.error(`Failed to delete employee ${id}:`, error);
    throw error;
  }
};

export const getEmployeeById = async (pb: PocketBase, id: string, options?: PocketBaseRequestOptions): Promise<Employee | null> => {
  try {
    const { onRetry, signal, ...otherOptions } = options || {}; 
    const requestParams = {
      fields: DEFAULT_EMPLOYEE_FIELDS,
      ...otherOptions,
    };
    const record = await withRetry(() => pb.collection(COLLECTION_NAME).getOne(id, requestParams, { signal }),
    {
      signal,
      context: `fetching employee by ID ${id}`,
      onRetry 
    });
    return pbRecordToEmployee(record);
  } catch (error) {
     if ((error as any).status === 404) {
        return null;
    }
    throw error;
  }
};

