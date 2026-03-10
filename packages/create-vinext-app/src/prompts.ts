import * as p from "@clack/prompts";

export interface PromptAnswers {
  projectName: string;
  template: "app" | "pages";
}

/**
 * Run interactive prompts. Returns null if the user cancels (Ctrl+C).
 */
export async function runPrompts(defaults: {
  projectName?: string;
  template?: "app" | "pages";
}): Promise<PromptAnswers | null> {
  p.intro("create-vinext-app");

  const answers = await p.group(
    {
      projectName: () =>
        defaults.projectName
          ? Promise.resolve(defaults.projectName)
          : p.text({
              message: "Project name:",
              placeholder: "my-vinext-app",
              validate: (value) => {
                if (!value.trim()) return "Project name is required";
                // Basic validation inline — full validation happens after prompts
              },
            }),
      template: () =>
        defaults.template
          ? Promise.resolve(defaults.template)
          : p.select({
              message: "Which router?",
              options: [
                { value: "app" as const, label: "App Router", hint: "recommended" },
                { value: "pages" as const, label: "Pages Router" },
              ],
            }),
    },
    {
      onCancel: () => {
        p.cancel("Cancelled.");
        process.exit(0);
      },
    },
  );

  return answers as PromptAnswers;
}
