
'use client';
import type { Employee } from "@/lib/types";
import type PocketBase from 'pocketbase';

const COLLECTION_NAME = "employees";

// Helper to convert PocketBase record to Employee type
const pbRecordToEmployee = (record: any): Employee => {
  return {
    id: record.id,
    name: record.name,
    email: record.email,
    role: record.role, // This is the job title/role within the company
    reportsTo_text: record.reportsTo_text,
    department_text: record.department_text,
    userId: record.userId, // This would link to a User record in PocketBase's 'users' collection
    created: record.created ? new Date(record.created) : undefined,
    updated: record.updated ? new Date(record.updated) : undefined,
    collectionId: record.collectionId,
    collectionName: record.collectionName,
    expand: record.expand,
  };
};

export const getEmployees = async (pb: PocketBase): Promise<Employee[]> => {
  try {
    const records = await pb.collection(COLLECTION_NAME).getFullList({
      sort: 'name', 
    });
    return records.map(pbRecordToEmployee);
  } catch (error) {
    console.error("Failed to fetch employees:", error);
    throw error;
  }
};

// Updated to clarify that employeeData can be an object or FormData
export const createEmployee = async (pb: PocketBase, employeeData: Partial<Omit<Employee, 'id' | 'created' | 'updated'>> | FormData): Promise<Employee> => {
  try {
    const record = await pb.collection(COLLECTION_NAME).create(employeeData);
    return pbRecordToEmployee(record);
  } catch (error) {
    console.error("Failed to create employee:", error);
    throw error;
  }
};

export const updateEmployee = async (pb: PocketBase, id: string, employeeData: Partial<Employee> | FormData): Promise<Employee> => {
  try {
    const record = await pb.collection(COLLECTION_NAME).update(id, employeeData);
    return pbRecordToEmployee(record);
  } catch (error) {
    console.error(`Failed to update employee ${id}:`, error);
    throw error;
  }
};

export const deleteEmployee = async (pb: PocketBase, id: string): Promise<void> => {
  try {
    await pb.collection(COLLECTION_NAME).delete(id);
  } catch (error) {
    console.error(`Failed to delete employee ${id}:`, error);
    throw error;
  }
};

export const getEmployeeById = async (pb: PocketBase, id: string): Promise<Employee | null> => {
  try {
    const record = await pb.collection(COLLECTION_NAME).getOne(id);
    return pbRecordToEmployee(record);
  } catch (error) {
    console.error(`Failed to fetch employee ${id}:`, error);
     if ((error as any).status === 404) {
        return null;
    }
    throw error;
  }
};
