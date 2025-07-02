
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
*   **`sharesPersonalCalendarWith`**: (Relation, `users` collection, Multiple) - A list of user IDs that this user is sharing their personal calendar with.

## PocketBase 'tasks' Collection Schema (Inferred from Frontend)

Based on the application's frontend code, the 'tasks' collection in PocketBase is expected to have the following schema:

*   **`id`**: (Text, System Field) - Unique identifier.
*   **`title`**: (Text, Required) - The custom name or main description of the task/project.
*   **`task_type`**: (Select, Required) - The specific type of task. Options: "MDL", "SOP", "IA", "iDOC", "oDOC", "VALIDATION_PROJECT", "VALIDATION_STEP".
*   **`instrument_subtype`**: (Text, Optional) - Specific instrument for "MDL" tasks (e.g., "nexiON", "agilent 7900") or SOP code for "SOP" tasks.
*   **`method`**: (Text, Optional) - The analytical method associated with the task, particularly for MDL tasks.
*   **`description`**: (Text, Optional) - A longer description of the task.
*   **`status`**: (Text or Select, Required) - Current status (e.g., "To Do", "In Progress", "Done", "Overdue", "Blocked").
*   **`priority`**: (Text or Select, Required) - Priority level (e.g., "Low", "Medium", "High", "Urgent").
*   **`startDate`**: (Date, Optional) - The start date of the task.
*   **`dueDate`**: (Date, Optional) - The due date for the task.
*   **`assignedTo_text`**: (Text, Optional) - Name of the employee the task is assigned to. *(Note: Consider using a Relation field to 'employees' collection for better data integrity).*
*   **`recurrence`**: (Text or Select, Required for non-VALIDATION_PROJECT/VALIDATION_STEP types) - Recurrence pattern (e.g., "None", "Daily", "Weekly"). "None" for "VALIDATION_PROJECT" and "VALIDATION_STEP".
*   **`attachments`**: (File, Optional, Multiple files allowed) - Files attached to the task.
*   **`userId`**: (Relation to 'users', Required) - The ID of the user who created or is primarily associated with the task.
*   **`progress`**: (Number, Optional) - Task completion progress (0-100).
*   **`isMilestone`**: (Boolean, Optional, Default: false) - Indicates if the task is a milestone. Applicable if `task_type` is "VALIDATION_PROJECT". If true, `startDate` and `dueDate` should ideally be the same.
*   **`dependencies`**: (JSON, Optional) - Stores an array of task IDs (strings) that this task depends on.
*   **`created`**: (Date, System Field) - Timestamp of creation.
*   **`updated`**: (Date, System Field) - Timestamp of last update.

## PocketBase 'employees' Collection Schema (Inferred from Frontend)

*   **`id`**: (Text, System Field) - Unique identifier.
*   **`name`**: (Text, Required) - Employee's full name.
*   **`email`**: (Email, Required, Unique) - Employee's email.
*   **`role`**: (Text or Select, Required) - Employee's job title or role (e.g., "Supervisor", "Team Lead", "Chem I").
*   **`department_text`**: (Text, Optional) - Department the employee belongs to.
*   **`reportsTo_text`**: (Text, Optional) - Name of the person this employee reports to.
*   **`userId`**: (Relation to `users`, Optional but Recommended) - Links to the system user account if the employee is also a user.
*   **`created`**: (Date, System Field) - Timestamp of creation.
*   **`updated`**: (Date, System Field) - Timestamp of last update.

## PocketBase 'personal_events' Collection Schema (New)

A new collection is required to store personal calendar events separately from the main tasks.

*   **`id`**: (Text, System Field) - Unique identifier.
*   **`title`**: (Text, Required) - The name or description of the personal event.
*   **`description`**: (Text, Optional) - A longer description for the event.
*   **`startDate`**: (Date, Required) - The start date and time of the event.
*   **`endDate`**: (Date, Required) - The end date and time of the event.
*   **`eventType`**: (Select, Optional, Default: "Available") - The type of event. Options: "Available", "Busy", "Out of Office".
*   **`userId`**: (Relation to 'users', Required) - The ID of the user who owns this event.
*   **`isAllDay`**: (Boolean, Optional, Default: false) - Indicates if the event is for the whole day.
*   **`created`**: (Date, System Field) - Timestamp of creation.
*   **`updated`**: (Date, System Field) - Timestamp of last update.

### Securing Personal Events in PocketBase

For personal calendar events to be private (or shared with specific users), you must set API rules on the `personal_events` collection in your PocketBase Admin UI.

Navigate to your PocketBase admin dashboard, select the `personal_events` collection, and go to the **"API Rules"** tab. In these rules, `@request.auth.id` refers to the currently logged-in user, and `userId` refers to the relation field on the `personal_events` record itself.

-   **List Rule**: `userId = @request.auth.id || userId.sharesPersonalCalendarWith ~ @request.auth.id`
-   **View Rule**: `userId = @request.auth.id || userId.sharesPersonalCalendarWith ~ @request.auth.id`
-   **Create Rule**: `userId = @request.auth.id`
-   **Update Rule**: `userId = @request.auth.id`
-   **Delete Rule**: `userId = @request.auth.id`

These rules ensure that a user can only interact with their own personal events, but can view events from users who have explicitly shared their calendar with them via the `sharesPersonalCalendarWith` field on the event owner's user record.

### Securing the `users` Collection for Sharing

To allow users to find and share their calendars with others, you must adjust the API rules on the `users` collection. By default, users can only see their own records, which will prevent the sharing list from populating.

1.  Navigate to your PocketBase admin dashboard.
2.  Select the `users` collection and go to the **"API Rules"** tab.
3.  Find the **"List Rule"** field. It is likely empty or restricted.
4.  Set the **"List Rule"** to the following:
    ```
    @request.auth.id != ""
    ```

This rule ensures that any authenticated user (`@request.auth.id != ""`) can see the list of other users, which is necessary for the sharing feature to work. The application only requests non-sensitive fields (`id`, `name`, `email`) for this purpose.

## Deployment Troubleshooting (GitHub Pages & PocketBase)

If your application works locally but fails to fetch data (e.g., employees, tasks) when deployed to GitHub Pages, consider these common issues:

### 1. CORS (Cross-Origin Resource Sharing)
This is the most frequent cause. Your PocketBase server (e.g., `https://your-pb-instance.pockethost.io`) needs to explicitly allow requests from your GitHub Pages domain (e.g., `https://yourusername.github.io`).

**Action:**
*   In your PocketBase Admin UI, navigate to **Settings > API Rules & CORS**.
*   In the **Allowed Origins** field, add your GitHub Pages URL (e.g., `https://yourusername.github.io`). You can also use `*` for testing, but this is not recommended for production as it allows requests from any origin.
*   Ensure **Allowed Methods** includes at least `GET`, `POST`, `PATCH`, `DELETE` (or `*`).
*   Ensure **Allowed Headers** includes at least `Content-Type`, `Authorization` (if you use auth tokens), and potentially `X-Requested-With` (or `*`).

### 2. PocketBase Server Status
*   **Accessibility**: Ensure your PocketBase instance is running and publicly accessible from the internet.
*   **Hosting Tiers**: If using free or hobby tiers for PocketBase hosting (like pockethost.io), check for any "sleeping" or inactivity limits that might cause the server to be temporarily unavailable.

### 3. Browser Developer Tools
When the deployed app fails:
*   Open your browser's **Developer Tools** (usually F12).
*   **Console Tab**: Look for errors related to CORS, network failures (`Failed to fetch`), or content security policies.
*   **Network Tab**:
    *   Refresh the page or trigger the failing action.
    *   Find the request to your PocketBase URL.
    *   **Status Code**: 0 often indicates a CORS or network block. 403 could be a permission issue (but usually with a response body). 5xx errors are server-side issues.
    *   **Headers**: Check for `Access-Control-Allow-Origin` in the response headers. If it's missing or doesn't match your GitHub Pages domain, CORS is likely the problem.
    *   **Response**: See if PocketBase returned any specific error message.

### 4. PocketBase Collection API Rules
While less likely to cause "works locally, fails deployed" if the same user is testing, double-check your Collection API rules in PocketBase. Ensure that "List" and "View" permissions are correctly set for the collections (`tasks`, `employees`, `activity_log`, etc.) for authenticated users or the specific roles that need access.

### 5. `POCKETBASE_URL` in Code
Verify that `POCKETBASE_URL` in `src/context/AuthContext.tsx` (currently `https://swoodhu.pockethost.io/`) is correct and publicly accessible.

By systematically checking these points, you can usually identify why data fetching fails on deployment.
