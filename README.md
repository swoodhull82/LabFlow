# Firebase Studio

This is a NextJS starter in Firebase Studio.

To get started, take a look at src/app/page.tsx.
<!-- Test comment -->
<!-- No-op: Responding to a query about server-side PocketBase hooks. Troubleshooting pb_hooks involves checking the PocketBase server logs and configuration. -->
<!-- User provided a server-side PocketBase hook (main.pb.js) for CORS. This file needs to be managed directly on the PocketBase server. -->
<!-- Note: net::ERR_ADDRESS_INVALID errors for www.google-analytics.com are external to the LabFlow application and likely due to local network, DNS, or browser extension issues. -->
<!-- No-op: The "autocancelled" warnings on the dashboard are due to the useEffect cleanup aborting fetch requests, likely from React Strict Mode or rapid component remounts. The system correctly handles these as non-critical aborts, logging them for diagnosis but not displaying them as user errors. -->
<!-- Tech stack discussion: Key stacks include Next.js, React, ShadCN UI, Tailwind CSS, TypeScript, PocketBase, React Hook Form, Zod, Recharts, Lucide React, date-fns, and GitHub Pages for deployment. -->

## PocketBase 'users' Collection Schema (Inferred from Frontend)

Based on the application's frontend code, the 'users' collection in PocketBase is expected to have the following schema:

*   **`id`**: (Text, System Field) - Unique identifier.
*   **`email`**: (Email, Required, Unique) - For login and display.
*   **`password`**: (Password) - For authentication.
*   **`name`**: (Text, Optional) - User's display name.
*   **`role`**: (Text or Select, Optional) - User's role (e.g., "Supervisor", "Team Lead", "Chem I", "Chem II").
*   **`avatar`**: (File, Optional, Max 1 file) - For uploaded profile pictures.
*   **`selected_lucide_icon`**: (Text, Optional) - Name of the selected Lucide icon for the profile.

## PocketBase 'tasks' Collection Schema (Inferred from Frontend)

Based on the application's frontend code, the 'tasks' collection in PocketBase is expected to have the following schema:

*   **`id`**: (Text, System Field) - Unique identifier.
*   **`title`**: (Text, Required) - The title of the task.
*   **`description`**: (Text, Optional) - A longer description of the task.
*   **`status`**: (Text or Select, Required) - Current status (e.g., "To Do", "In Progress", "Done", "Overdue", "Blocked").
*   **`priority`**: (Text or Select, Required) - Priority level (e.g., "Low", "Medium", "High", "Urgent").
*   **`startDate`**: (Date, Optional) - The start date of the task.
*   **`dueDate`**: (Date, Optional) - The due date for the task.
*   **`assignedTo_text`**: (Text, Optional) - Name of the employee the task is assigned to. *(Note: Consider using a Relation field to 'employees' collection for better data integrity).*
*   **`recurrence`**: (Text or Select, Required) - Recurrence pattern (e.g., "None", "Daily", "Weekly").
*   **`attachments`**: (File, Optional, Multiple files allowed) - Files attached to the task.
*   **`userId`**: (Relation to 'users', Required) - The ID of the user who created or is primarily associated with the task.
*   **`progress`**: (Number, Optional) - Task completion progress (0-100).
*   **`isMilestone`**: (Boolean, Optional, Default: false) - Indicates if the task is a milestone. If true, `startDate` and `dueDate` should ideally be the same.
*   **`dependencies`**: (JSON, Optional) - Stores an array of task IDs (strings) that this task depends on.
*   **`created`**: (Date, System Field) - Timestamp of creation.
*   **`updated`**: (Date, System Field) - Timestamp of last update.
```