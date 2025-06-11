
'use client';
import type { Employee } from "@/lib/types";
import type PocketBase from 'pocketbase';

const COLLECTION_NAME = "employees";

// Helper to convert PocketBase record to Employee type
const pbRecordToEmployee = (record: any, pb: PocketBase): Employee => {
  let avatarUrl;
  if (record.avatar) {
    avatarUrl = pb.files.getUrl(record, record.avatar, { thumb: '100x100' });
  } else {
    // Fallback placeholder if no avatar, using first letter of name or 'E'
    const nameInitial = record.name ? record.name[0].toUpperCase() : 'E';
    avatarUrl = `https://placehold.co/100x100.png?text=${nameInitial}`;
  }

  return {
    ...record,
    hireDate: new Date(record.hireDate), // Ensure hireDate is a Date object
    avatar: avatarUrl, // Store the full URL or placeholder
    created: record.created ? new Date(record.created) : undefined,
    updated: record.updated ? new Date(record.updated) : undefined,
  } as Employee;
};

export const getEmployees = async (pb: PocketBase): Promise<Employee[]> => {
  try {
    const records = await pb.collection(COLLECTION_NAME).getFullList({
      sort: 'name', // Sort by name or any other preferred field
    });
    return records.map(record => pbRecordToEmployee(record, pb));
  } catch (error) {
    console.error("Failed to fetch employees:", error);
    throw error;
  }
};

export const createEmployee = async (pb: PocketBase, employeeData: FormData | Partial<Omit<Employee, 'id' | 'created' | 'updated'>>): Promise<Employee> => {
  try {
    const record = await pb.collection(COLLECTION_NAME).create(employeeData);
    return pbRecordToEmployee(record, pb);
  } catch (error) {
    console.error("Failed to create employee:", error);
    throw error;
  }
};

export const updateEmployee = async (pb: PocketBase, id: string, employeeData: FormData | Partial<Employee>): Promise<Employee> => {
  try {
    const record = await pb.collection(COLLECTION_NAME).update(id, employeeData);
    return pbRecordToEmployee(record, pb);
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
    return pbRecordToEmployee(record, pb);
  } catch (error) {
    console.error(`Failed to fetch employee ${id}:`, error);
     if ((error as any).status === 404) {
        return null;
    }
    throw error;
  }
};
