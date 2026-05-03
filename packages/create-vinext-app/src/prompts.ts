import * as p from "@clack/prompts";

export type PromptDefaults = {
  projectName?: string;
  template?: "app" | "pages";
};

export type PromptAnswers = {
  projectName: string;
  template: "app" | "pages";
};

export async function runPrompts(defaults: PromptDefaults): Promise<PromptAnswers | null> {
  p.intro("create-vinext-app");

  try {
    const answers = await p.group({
      projectName: () =>
        defaults.projectName
          ? Promise.resolve(defaults.projectName)
          : p.text({
              message: "Project name:",
              placeholder: "my-vinext-app",
              validate: (value: string | undefined) => {
                if (!value?.trim()) return "Project name is required";
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
    });

    if (p.isCancel(answers)) {
      p.cancel("Cancelled.");
      return null;
    }

    return answers as PromptAnswers;
  } catch {
    p.cancel("Cancelled.");
    return null;
  }
}
