import { defineFlow, runFlow } from 'genkit/flow';
import { generate } from 'genkit/ai';
import { ai } from './genkit'; // Assuming ai object is correctly configured here
import * as z from 'zod';

// Define the input schema for the flow
export const ProjectDescriptionSchema = z.object({
  projectDescription: z.string(),
});

// Define the output schema for a single task
export const TaskSchema = z.object({
  title: z.string(),
  description: z.string(),
});

// Define the output schema for the list of tasks
export const TaskListSchema = z.object({
  tasks: z.array(TaskSchema),
});

// Define the Genkit flow
export const suggestTasksFlow = defineFlow(
  {
    name: 'suggestTasksFlow',
    inputSchema: ProjectDescriptionSchema,
    outputSchema: TaskListSchema,
  },
  async (input) => {
    const { projectDescription } = input;

    const prompt = `Based on the following project description, generate a list of 3 relevant tasks.
    Each task should have a title and a brief description.
    Project Description: ${projectDescription}
    Provide the output in JSON format with a root key "tasks" containing an array of task objects, where each task object has "title" and "description" keys.
    Example:
    {
      "tasks": [
        { "title": "Task 1 Title", "description": "Description for task 1" },
        { "title": "Task 2 Title", "description": "Description for task 2" },
        { "title": "Task 3 Title", "description": "Description for task 3" }
      ]
    }`;

    const llmResponse = await generate({
      model: ai.model, // Use the model from genkit.ts
      prompt: prompt,
      config: {
        temperature: 0.7,
      },
      output: {
        format: 'json',
        schema: TaskListSchema,
      },
    });

    const taskList = llmResponse.output();

    if (!taskList) {
      throw new Error('Failed to generate tasks or output is null.');
    }

    // Ensure we return exactly 3 tasks, or handle cases where the model doesn't.
    // For now, we trust the model's output format and count.
    // Add more robust error handling or task count enforcement if needed.
    if (taskList.tasks.length !== 3) {
        console.warn(`Model generated ${taskList.tasks.length} tasks, expected 3.`);
        // Potentially, try to regenerate, or truncate/pad, or throw an error
        // For this example, we'll proceed with what was generated.
    }

    return taskList;
  }
);

// Example of how to run this flow (for testing or direct invocation if needed)
// This part would typically not be in a flow definition file if flows are just imported for side effects.
/*
async function main() {
  const result = await runFlow(suggestTasksFlow, { projectDescription: "Develop a new e-commerce website." });
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main();
}
*/
