import { describe, it, expect, vi } from "vitest";
import path from "node:path";
import {
  DEFAULT_WORKSPACE_ROOT,
  TOOL_DEFINITIONS,
  parseServerOptions,
  getVisibleTools,
  validateWorkspacePath,
  validateTestFilePath,
  executeTool,
  handleJsonRpcRequest,
} from "./devToolsMcpServer.js";

describe("devToolsMcpServer path validation", () => {
  it("accepts valid relative and workspace-contained absolute paths", () => {
    expect(validateWorkspacePath("src/App.jsx", DEFAULT_WORKSPACE_ROOT)).toBe("src/App.jsx");
    expect(
      validateWorkspacePath(
        path.join(DEFAULT_WORKSPACE_ROOT, "src", "App.test.jsx"),
        DEFAULT_WORKSPACE_ROOT,
      ),
    ).toBe("src/App.test.jsx");
  });

  it("rejects path traversal, flag injection, null bytes, .env files, and .git paths", () => {
    expect(() => validateWorkspacePath("../etc/passwd", DEFAULT_WORKSPACE_ROOT)).toThrow(/escapes/);
    expect(() => validateWorkspacePath("/etc/passwd", DEFAULT_WORKSPACE_ROOT)).toThrow(/escapes/);
    expect(() => validateWorkspacePath("--exec=sh", DEFAULT_WORKSPACE_ROOT)).toThrow(/start with "-"/);
    expect(() => validateWorkspacePath("src/App.jsx\0evil", DEFAULT_WORKSPACE_ROOT)).toThrow(/null/);
    expect(() => validateWorkspacePath(".env", DEFAULT_WORKSPACE_ROOT)).toThrow(/forbidden/);
    expect(() => validateWorkspacePath(".env.local", DEFAULT_WORKSPACE_ROOT)).toThrow(/forbidden/);
    expect(() => validateWorkspacePath(".git/HEAD", DEFAULT_WORKSPACE_ROOT)).toThrow(/forbidden/);
    expect(() => validateWorkspacePath("", DEFAULT_WORKSPACE_ROOT)).toThrow();
  });

  it("enforces *.test.{js,jsx} suffix for test paths", () => {
    expect(validateTestFilePath("src/App.test.jsx", DEFAULT_WORKSPACE_ROOT)).toBe("src/App.test.jsx");
    expect(validateTestFilePath("scripts/cleanupAnonymousUsers.test.js", DEFAULT_WORKSPACE_ROOT)).toBe(
      "scripts/cleanupAnonymousUsers.test.js",
    );
    expect(() => validateTestFilePath("src/App.jsx", DEFAULT_WORKSPACE_ROOT)).toThrow(/\.test\.js/);
  });
});

describe("devToolsMcpServer tool scoping", () => {
  it("parses --tools and --git-modes flags and rejects unknown values", () => {
    expect(parseServerOptions([])).toEqual({
      allowedTools: null,
      allowedGitModes: null,
    });
    expect(
      parseServerOptions(["--tools=run_tests,git_hash_object", "--git-modes=status,rev_parse"]),
    ).toEqual({
      allowedTools: ["run_tests", "git_hash_object"],
      allowedGitModes: ["status", "rev_parse"],
    });
    expect(parseServerOptions(["--tools", "run_lint,run_build"])).toEqual({
      allowedTools: ["run_lint", "run_build"],
      allowedGitModes: null,
    });

    expect(() => parseServerOptions(["--tools=bogus_tool"])).toThrow(/Unknown value/);
    expect(() => parseServerOptions(["--git-modes=push"])).toThrow(/Unknown value/);
    expect(() => parseServerOptions(["--tools="])).toThrow(/at least one/);
    expect(() => parseServerOptions(["--unknown"])).toThrow(/Unknown CLI argument/);
  });

  it("filters tools/list and narrows git_status_diff enum when scoped", async () => {
    const options = {
      allowedTools: ["git_hash_object", "git_status_diff"],
      allowedGitModes: ["rev_parse", "status"],
    };

    const visible = getVisibleTools(options);
    expect(visible.map((t) => t.name)).toEqual(["git_hash_object", "git_status_diff"]);
    expect(visible[1].inputSchema.properties.mode.enum).toEqual(["rev_parse", "status"]);

    const listRes = await handleJsonRpcRequest({ jsonrpc: "2.0", id: 10, method: "tools/list" }, options);
    expect(listRes.result.tools.map((t) => t.name)).toEqual(["git_hash_object", "git_status_diff"]);
    expect(listRes.result.tools[1].inputSchema.properties.mode.enum).toEqual(["rev_parse", "status"]);
  });

  it("blocks disallowed tools and disallowed git modes at execution time", async () => {
    const execFn = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
    const options = {
      execFn,
      allowedTools: ["run_tests", "git_status_diff"],
      allowedGitModes: ["status"],
    };

    const blockedTool = await executeTool("run_build", {}, options);
    expect(blockedTool.isError).toBe(true);
    expect(blockedTool.content[0].text).toContain("not permitted");

    const blockedMode = await executeTool("git_status_diff", { mode: "diff" }, options);
    expect(blockedMode.isError).toBe(true);
    expect(blockedMode.content[0].text).toContain("not permitted");

    const allowedCall = await executeTool("git_status_diff", { mode: "status" }, options);
    expect(allowedCall.isError).toBeUndefined();
    expect(execFn).toHaveBeenCalledTimes(1);
    expect(execFn).toHaveBeenCalledWith("git", ["status", "--short"], DEFAULT_WORKSPACE_ROOT);
  });
});

describe("devToolsMcpServer tool execution", () => {
  it("runs full npm test when files are omitted and targeted tests when files are provided", async () => {
    const execFn = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "22 passed", stderr: "" });

    const res1 = await executeTool("run_tests", {}, { execFn });
    expect(execFn).toHaveBeenCalledWith("npm", ["test"], DEFAULT_WORKSPACE_ROOT);
    expect(res1.isError).toBeUndefined();
    expect(res1.content[0].text).toContain("exitCode: 0");

    const res2 = await executeTool("run_tests", { files: ["src/App.test.jsx"] }, { execFn });
    expect(execFn).toHaveBeenCalledWith(
      "npm",
      ["test", "--", "src/App.test.jsx"],
      DEFAULT_WORKSPACE_ROOT,
    );
    expect(res2.content[0].text).toContain("npm test -- src/App.test.jsx");
  });

  it("computes git hash-object for existing validated workspace files and rejects missing or forbidden files", async () => {
    const execFn = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: "abc123\n",
      stderr: "",
    });

    const ok = await executeTool("git_hash_object", { paths: ["package.json"] }, { execFn });
    expect(execFn).toHaveBeenCalledWith("git", ["hash-object", "--", "package.json"], DEFAULT_WORKSPACE_ROOT);
    expect(ok.isError).toBeUndefined();
    expect(ok.content[0].text).toContain("abc123  package.json");

    const envErr = await executeTool("git_hash_object", { paths: [".env"] }, { execFn });
    expect(envErr.isError).toBe(true);

    const missingErr = await executeTool(
      "git_hash_object",
      { paths: ["src/does-not-exist.js"] },
      { execFn },
    );
    expect(missingErr.isError).toBe(true);
    expect(missingErr.content[0].text).toContain("File not found");
  });

  it("runs eslint only on allowlisted targets without --fix", async () => {
    const execFn = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

    await executeTool("run_lint", {}, { execFn });
    expect(execFn).toHaveBeenLastCalledWith("npx", ["eslint", "src", "api"], DEFAULT_WORKSPACE_ROOT);

    await executeTool("run_lint", { target: "scripts" }, { execFn });
    expect(execFn).toHaveBeenLastCalledWith("npx", ["eslint", "scripts"], DEFAULT_WORKSPACE_ROOT);

    const bad = await executeTool("run_lint", { target: "--fix" }, { execFn });
    expect(bad.isError).toBe(true);
  });

  it("runs npm run build", async () => {
    const execFn = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "built", stderr: "" });
    const res = await executeTool("run_build", {}, { execFn });
    expect(execFn).toHaveBeenCalledWith("npm", ["run", "build"], DEFAULT_WORKSPACE_ROOT);
    expect(res.content[0].text).toContain("exitCode: 0");
  });

  it("runs read-only git inspection modes and rejects invalid modes", async () => {
    const execFn = vi
      .fn()
      .mockResolvedValueOnce({ exitCode: 0, stdout: " M src/App.jsx\n", stderr: "" })
      .mockResolvedValueOnce({ exitCode: 0, stdout: " 1 file changed\n", stderr: "" })
      .mockResolvedValueOnce({ exitCode: 0, stdout: "diff --git\n", stderr: "" })
      .mockResolvedValueOnce({ exitCode: 0, stdout: "iphone\n", stderr: "" })
      .mockResolvedValueOnce({ exitCode: 0, stdout: "31d18ac\n", stderr: "" });

    await executeTool("git_status_diff", { mode: "status" }, { execFn });
    expect(execFn).toHaveBeenNthCalledWith(1, "git", ["status", "--short"], DEFAULT_WORKSPACE_ROOT);

    await executeTool("git_status_diff", { mode: "diff_stat" }, { execFn });
    expect(execFn).toHaveBeenNthCalledWith(2, "git", ["diff", "--stat"], DEFAULT_WORKSPACE_ROOT);

    await executeTool("git_status_diff", { mode: "diff", paths: ["src/App.jsx"] }, { execFn });
    expect(execFn).toHaveBeenNthCalledWith(
      3,
      "git",
      ["diff", "--", "src/App.jsx"],
      DEFAULT_WORKSPACE_ROOT,
    );

    const revRes = await executeTool("git_status_diff", { mode: "rev_parse" }, { execFn });
    expect(revRes.content[0].text).toContain("branch: iphone");
    expect(revRes.content[0].text).toContain("commit: 31d18ac");

    const bad = await executeTool("git_status_diff", { mode: "commit" }, { execFn });
    expect(bad.isError).toBe(true);
  });
});

describe("devToolsMcpServer JSON-RPC protocol", () => {
  it("handles initialize, notifications/initialized, ping, tools/list, and tools/call", async () => {
    const init = await handleJsonRpcRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05" },
    });
    expect(init.result.serverInfo.name).toBe("fitgen-dev-tools");
    expect(init.result.capabilities.tools).toEqual({});

    const notif = await handleJsonRpcRequest({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    expect(notif).toBeNull();

    const ping = await handleJsonRpcRequest({ jsonrpc: "2.0", id: 2, method: "ping" });
    expect(ping.result).toEqual({});

    const list = await handleJsonRpcRequest({ jsonrpc: "2.0", id: 3, method: "tools/list" });
    expect(list.result.tools.map((t) => t.name)).toEqual(TOOL_DEFINITIONS.map((t) => t.name));

    const execFn = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
    const call = await handleJsonRpcRequest(
      {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "run_build", arguments: {} },
      },
      { execFn },
    );
    expect(call.result.content[0].text).toContain("exitCode: 0");
  });
});
