import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { execSync } from "node:child_process";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "git_commit",
    label: "Git Commit",
    description:
      "Stage all files, commit with conventional commit prefix, and push. Use after making code changes.",
    parameters: Type.Object({
      type: Type.String({
        description: "Conventional commit type: feat, refactor, or fix",
        enum: ["feat", "refactor", "fix"],
      }),
      description: Type.String({
        description: "Short commit description (no prefix needed)",
      }),
    }),
    async execute(_toolCallId, params) {
      const msg = `${params.type}: ${params.description}`;
      const add = execSync("git add -A", { encoding: "utf-8" });
      const commit = execSync(`git commit -m "${msg}"`, { encoding: "utf-8" });
      const push = execSync("git push", { encoding: "utf-8" });
      return {
        content: [{ type: "text", text: [add, commit, push].filter(Boolean).join("\n").trim() || "ok" }],
        details: {},
      };
    },
  });
}
