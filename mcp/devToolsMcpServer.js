#!/usr/bin/env node
/**
 * Workspace-scoped, least-privilege stdio MCP server for fit-gen-v2 verification tools.
 *
 * Exposes fixed, allowlisted commands via execFile (no shell interpolation):
 *   - run_tests:       npm test (full suite or validated *.test.{js,jsx} files)
 *   - git_hash_object: git hash-object <validated workspace paths>
 *   - run_lint:        npx eslint src api | npx eslint scripts (never --fix)
 *   - run_build:       npm run build
 *   - git_status_diff: read-only git status --short | diff --stat | diff | rev-parse
 *
 * Optional CLI flags for per-subagent least-privilege scoping:
 *   --tools=<comma-separated tool names>
 *   --git-modes=<comma-separated git_status_diff modes>
 */

import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const DEFAULT_WORKSPACE_ROOT = path.resolve(__dirname, "..");

const SERVER_INFO = {
  name: "fitgen-dev-tools",
  version: "1.0.0",
};

const SUPPORTED_PROTOCOL_VERSION = "2024-11-05";
const MAX_OUTPUT_BUFFER = 10 * 1024 * 1024;
const COMMAND_TIMEOUT_MS = 120_000;

export const ALL_GIT_MODES = ["status", "diff_stat", "diff", "rev_parse"];

export const TOOL_DEFINITIONS = [
  {
    name: "run_tests",
    description:
      "Run the Vitest test suite (`npm test`) in the workspace, optionally scoped to specific relative `*.test.{js,jsx}` files.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        files: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional list of workspace-relative test file paths (`*.test.js` or `*.test.jsx`). Omit to run the entire suite.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "git_hash_object",
    description:
      "Compute `git hash-object` SHA-1 hashes for one or more validated workspace-relative file paths.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        paths: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          description: "Non-empty array of workspace-relative file paths to hash.",
        },
      },
      required: ["paths"],
      additionalProperties: false,
    },
  },
  {
    name: "run_lint",
    description:
      "Run read-only ESLint (`npx eslint src api` or `npx eslint scripts`) without `--fix`.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          enum: ["src_api", "scripts"],
          default: "src_api",
          description: "Allowlisted lint target: `src_api` (`src api`) or `scripts` (`scripts`).",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "run_build",
    description: "Run the production Vite build (`npm run build`) in the workspace.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "git_status_diff",
    description:
      "Run read-only git inspection (`status`, `diff_stat`, `diff`, or `rev_parse`) in the workspace.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: [...ALL_GIT_MODES],
          description:
            "`status` (`git status --short`), `diff_stat` (`git diff --stat`), `diff` (`git diff`), or `rev_parse` (current branch and HEAD commit).",
        },
        paths: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional workspace-relative file paths (used only with `diff` or `diff_stat`).",
        },
      },
      required: ["mode"],
      additionalProperties: false,
    },
  },
];

const ALL_TOOL_NAMES = new Set(TOOL_DEFINITIONS.map((t) => t.name));

function parseCsvAllowlist(rawValue, validValues, flagName) {
  const items = rawValue
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (items.length === 0) {
    throw new Error(`${flagName} must specify at least one value.`);
  }

  for (const item of items) {
    if (!validValues.has(item)) {
      throw new Error(`Unknown value "${item}" for ${flagName}.`);
    }
  }

  return [...new Set(items)];
}

/**
 * Parses optional `--tools=<csv>` and `--git-modes=<csv>` CLI flags into allowlists.
 */
export function parseServerOptions(argv = []) {
  let allowedTools = null;
  let allowedGitModes = null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--tools") {
      if (i + 1 >= argv.length) {
        throw new Error("--tools requires a comma-separated value.");
      }
      allowedTools = parseCsvAllowlist(argv[i + 1], ALL_TOOL_NAMES, "--tools");
      i += 1;
    } else if (arg.startsWith("--tools=")) {
      allowedTools = parseCsvAllowlist(arg.slice("--tools=".length), ALL_TOOL_NAMES, "--tools");
    } else if (arg === "--git-modes") {
      if (i + 1 >= argv.length) {
        throw new Error("--git-modes requires a comma-separated value.");
      }
      allowedGitModes = parseCsvAllowlist(argv[i + 1], new Set(ALL_GIT_MODES), "--git-modes");
      i += 1;
    } else if (arg.startsWith("--git-modes=")) {
      allowedGitModes = parseCsvAllowlist(
        arg.slice("--git-modes=".length),
        new Set(ALL_GIT_MODES),
        "--git-modes",
      );
    } else {
      throw new Error(`Unknown CLI argument: ${arg}`);
    }
  }

  return { allowedTools, allowedGitModes };
}

/**
 * Returns the filtered tool definitions visible to the configured server instance.
 */
export function getVisibleTools({ allowedTools = null, allowedGitModes = null } = {}) {
  const toolSet = allowedTools ? new Set(allowedTools) : null;
  const gitModes = allowedGitModes ? [...allowedGitModes] : null;

  return TOOL_DEFINITIONS.filter((tool) => !toolSet || toolSet.has(tool.name)).map((tool) => {
    if (tool.name !== "git_status_diff" || !gitModes) {
      return tool;
    }
    return {
      ...tool,
      inputSchema: {
        ...tool.inputSchema,
        properties: {
          ...tool.inputSchema.properties,
          mode: {
            ...tool.inputSchema.properties.mode,
            enum: gitModes,
          },
        },
      },
    };
  });
}

/**
 * Validates that `inputPath` resolves inside `workspaceRoot`, is not a git/CLI flag,
 * contains no null bytes, and does not reference `.env*` secrets.
 * Returns the normalized workspace-relative POSIX path.
 */
export function validateWorkspacePath(inputPath, workspaceRoot = DEFAULT_WORKSPACE_ROOT) {
  if (typeof inputPath !== "string") {
    throw new Error("Path must be a non-empty string.");
  }

  const trimmed = inputPath.trim();
  if (!trimmed || trimmed.includes("\0")) {
    throw new Error("Path must be a non-empty string without null bytes.");
  }

  if (trimmed.startsWith("-")) {
    throw new Error(`Invalid path "${trimmed}": paths must not start with "-".`);
  }

  const rootResolved = path.resolve(workspaceRoot);
  const candidate = path.isAbsolute(trimmed)
    ? path.resolve(trimmed)
    : path.resolve(rootResolved, trimmed);

  const relative = path.relative(rootResolved, candidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path "${trimmed}" escapes workspace root.`);
  }

  const segments = relative.split(path.sep);
  if (segments.some((segment) => segment === ".env" || segment.startsWith(".env."))) {
    throw new Error(`Access to environment file "${trimmed}" is forbidden.`);
  }

  if (segments.includes(".git")) {
    throw new Error(`Direct access to ".git" path "${trimmed}" is forbidden.`);
  }

  return segments.join("/");
}

/**
 * Validates that `inputPath` is a workspace-relative Vitest test file (`*.test.js` / `*.test.jsx`).
 */
export function validateTestFilePath(inputPath, workspaceRoot = DEFAULT_WORKSPACE_ROOT) {
  const rel = validateWorkspacePath(inputPath, workspaceRoot);
  if (!/\.test\.jsx?$/.test(rel)) {
    throw new Error(`Test path "${rel}" must end with .test.js or .test.jsx.`);
  }
  return rel;
}

/**
 * Executes a fixed binary with argument array (no shell) inside `workspaceRoot`.
 */
export async function runExecFile(command, args, workspaceRoot = DEFAULT_WORKSPACE_ROOT) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: workspaceRoot,
      maxBuffer: MAX_OUTPUT_BUFFER,
      timeout: COMMAND_TIMEOUT_MS,
      windowsHide: true,
    });
    return { exitCode: 0, stdout: stdout ?? "", stderr: stderr ?? "" };
  } catch (err) {
    const exitCode = typeof err.code === "number" ? err.code : 1;
    return {
      exitCode,
      stdout: typeof err.stdout === "string" ? err.stdout : "",
      stderr: typeof err.stderr === "string" ? err.stderr : String(err.message || err),
    };
  }
}

function formatCommandResult(label, result) {
  const parts = [`command: ${label}`, `exitCode: ${result.exitCode}`];
  if (result.stdout.trim()) {
    parts.push(`stdout:\n${result.stdout.trimEnd()}`);
  }
  if (result.stderr.trim()) {
    parts.push(`stderr:\n${result.stderr.trimEnd()}`);
  }
  return parts.join("\n");
}

function toolResult(text, isError = false) {
  return {
    content: [{ type: "text", text }],
    ...(isError ? { isError: true } : {}),
  };
}

export async function executeTool(
  name,
  args = {},
  {
    workspaceRoot = DEFAULT_WORKSPACE_ROOT,
    execFn = runExecFile,
    allowedTools = null,
    allowedGitModes = null,
  } = {},
) {
  if (args === null || typeof args !== "object" || Array.isArray(args)) {
    return toolResult("Tool arguments must be an object.", true);
  }

  if (allowedTools && !allowedTools.includes(name)) {
    return toolResult(`Tool "${name}" is not permitted for this server instance.`, true);
  }

  try {
    switch (name) {
      case "run_tests": {
        const files = args.files ?? [];
        if (!Array.isArray(files)) {
          return toolResult("`files` must be an array of test paths.", true);
        }
        const validated = files.map((f) => validateTestFilePath(f, workspaceRoot));
        const cmdArgs = validated.length > 0 ? ["test", "--", ...validated] : ["test"];
        const result = await execFn("npm", cmdArgs, workspaceRoot);
        const label = validated.length > 0 ? `npm test -- ${validated.join(" ")}` : "npm test";
        return toolResult(formatCommandResult(label, result), false);
      }

      case "git_hash_object": {
        const rawPaths = args.paths;
        if (!Array.isArray(rawPaths) || rawPaths.length === 0) {
          return toolResult("`paths` must be a non-empty array of workspace file paths.", true);
        }
        const validated = rawPaths.map((p) => validateWorkspacePath(p, workspaceRoot));
        for (const rel of validated) {
          const fullPath = path.resolve(workspaceRoot, rel);
          if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
            return toolResult(`File not found: ${rel}`, true);
          }
        }
        const result = await execFn("git", ["hash-object", "--", ...validated], workspaceRoot);
        if (result.exitCode !== 0) {
          return toolResult(formatCommandResult(`git hash-object -- ${validated.join(" ")}`, result), true);
        }
        const hashes = result.stdout
          .trim()
          .split(/\r?\n/)
          .filter(Boolean);
        const lines = validated.map((rel, idx) => `${hashes[idx] ?? "<missing>"}  ${rel}`);
        return toolResult(
          `command: git hash-object -- ${validated.join(" ")}\nexitCode: 0\n${lines.join("\n")}`,
          false,
        );
      }

      case "run_lint": {
        const target = args.target ?? "src_api";
        if (target !== "src_api" && target !== "scripts") {
          return toolResult('`target` must be "src_api" or "scripts".', true);
        }
        const eslintTargets = target === "scripts" ? ["scripts"] : ["src", "api"];
        const result = await execFn("npx", ["eslint", ...eslintTargets], workspaceRoot);
        return toolResult(
          formatCommandResult(`npx eslint ${eslintTargets.join(" ")}`, result),
          false,
        );
      }

      case "run_build": {
        const result = await execFn("npm", ["run", "build"], workspaceRoot);
        return toolResult(formatCommandResult("npm run build", result), false);
      }

      case "git_status_diff": {
        const mode = args.mode;
        if (!ALL_GIT_MODES.includes(mode)) {
          return toolResult(
            '`mode` must be one of "status", "diff_stat", "diff", or "rev_parse".',
            true,
          );
        }

        if (allowedGitModes && !allowedGitModes.includes(mode)) {
          return toolResult(
            `Git mode "${mode}" is not permitted for this server instance.`,
            true,
          );
        }

        if (mode === "status") {
          const result = await execFn("git", ["status", "--short"], workspaceRoot);
          return toolResult(formatCommandResult("git status --short", result), false);
        }

        if (mode === "rev_parse") {
          const branchRes = await execFn(
            "git",
            ["rev-parse", "--abbrev-ref", "HEAD"],
            workspaceRoot,
          );
          const shaRes = await execFn("git", ["rev-parse", "HEAD"], workspaceRoot);
          const exitCode = branchRes.exitCode || shaRes.exitCode;
          const branch = branchRes.stdout.trim();
          const commit = shaRes.stdout.trim();
          const text = [
            "command: git rev-parse --abbrev-ref HEAD && git rev-parse HEAD",
            `exitCode: ${exitCode}`,
            `branch: ${branch}`,
            `commit: ${commit}`,
          ].join("\n");
          return toolResult(text, exitCode !== 0);
        }

        const rawPaths = args.paths ?? [];
        if (!Array.isArray(rawPaths)) {
          return toolResult("`paths` must be an array of workspace paths.", true);
        }
        const validated = rawPaths.map((p) => validateWorkspacePath(p, workspaceRoot));
        const baseArgs = mode === "diff_stat" ? ["diff", "--stat"] : ["diff"];
        const cmdArgs = validated.length > 0 ? [...baseArgs, "--", ...validated] : baseArgs;
        const result = await execFn("git", cmdArgs, workspaceRoot);
        return toolResult(formatCommandResult(`git ${cmdArgs.join(" ")}`, result), false);
      }

      default:
        return toolResult(`Unknown tool: ${name}`, true);
    }
  } catch (err) {
    return toolResult(err instanceof Error ? err.message : String(err), true);
  }
}

export async function handleJsonRpcRequest(message, options = {}) {
  if (!message || typeof message !== "object" || message.jsonrpc !== "2.0") {
    return {
      jsonrpc: "2.0",
      id: message?.id ?? null,
      error: { code: -32600, message: "Invalid Request" },
    };
  }

  const { id, method, params } = message;

  // Notifications have no `id` and expect no response.
  if (id === undefined) {
    return null;
  }

  try {
    switch (method) {
      case "initialize": {
        const requestedVersion =
          typeof params?.protocolVersion === "string"
            ? params.protocolVersion
            : SUPPORTED_PROTOCOL_VERSION;
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: requestedVersion,
            capabilities: {
              tools: {},
            },
            serverInfo: SERVER_INFO,
          },
        };
      }

      case "ping":
        return { jsonrpc: "2.0", id, result: {} };

      case "tools/list":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            tools: getVisibleTools(options),
          },
        };

      case "tools/call": {
        const toolName = params?.name;
        const toolArgs = params?.arguments ?? {};
        if (typeof toolName !== "string" || !toolName) {
          return {
            jsonrpc: "2.0",
            id,
            error: { code: -32602, message: "Invalid params: missing tool name" },
          };
        }
        const result = await executeTool(toolName, toolArgs, options);
        return {
          jsonrpc: "2.0",
          id,
          result,
        };
      }

      default:
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        };
    }
  } catch (err) {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32603,
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

export function startStdioServer(options = {}) {
  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  let pending = 0;
  let closed = false;

  const maybeExit = () => {
    if (closed && pending === 0) {
      process.exit(0);
    }
  };

  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      const errorResponse = {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" },
      };
      process.stdout.write(`${JSON.stringify(errorResponse)}\n`);
      return;
    }

    pending += 1;
    Promise.resolve(handleJsonRpcRequest(parsed, options))
      .then((response) => {
        if (response !== null) {
          process.stdout.write(`${JSON.stringify(response)}\n`);
        }
      })
      .finally(() => {
        pending -= 1;
        maybeExit();
      });
  });

  rl.on("close", () => {
    closed = true;
    maybeExit();
  });
}

const isDirectCli =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectCli) {
  const cliOptions = parseServerOptions(process.argv.slice(2));
  startStdioServer(cliOptions);
}
