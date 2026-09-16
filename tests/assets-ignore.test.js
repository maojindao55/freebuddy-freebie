/**
 * .assetsignore pattern checks.
 *
 * wrangler.toml publishes the repository root as the Workers static-assets directory
 * (`[assets] directory = "."`), so every file .assetsignore does not exclude becomes a public
 * asset. Cloudflare documents that .assetsignore "takes the same format as .gitignore"
 * (https://developers.cloudflare.com/workers/static-assets/binding/#ignoring-assets), so the
 * patterns are evaluated with git's own ignore engine instead of a hand-written matcher: the file
 * is copied into a throwaway repository as `.gitignore` and `git check-ignore` decides.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const ASSETS_IGNORE = new URL("../.assetsignore", import.meta.url);

/** Local artifacts that must never be uploaded as public assets. */
const LOCAL_ONLY = [
  "node_modules/",
  "node_modules/wrangler/templates/no-op-worker.js",
  ".wrangler/",
  ".wrangler/state/v3/d1/miniflare-D1DatabaseObject/db.sqlite",
  ".wrangler/sync-providers.sql",
  ".codebuddy/skills/delegation/SKILL.md",
  "tests/providers-api.test.js",
  "tests/helpers/dom-stub.mjs",
  "tests/sync-providers.test.js",
  "migrations/0001_providers_constraints.sql",
  "migrations/0002_providers_status_disabled.sql",
  "submissions/providers/README.md",
  "submissions/providers/zhipu.json",
  "submissions/providers.schema.json",
  "submissions/examples/approved.example.json",
  "scripts/sync-providers.mjs",
  ".github/workflows/sync-providers.yml",
  "package.json",
  "package-lock.json",
  ".DS_Store",
  "assets/.DS_Store",
  ".git/config",
  ".gitignore",
  ".assetsignore"
];

/** Files the page and the deployment need — these must keep being published. */
const PUBLISHED = [
  "index.html",
  "styles.css",
  "app.js",
  "freebuddy-bridge.js",
  "providers.json",
  "providers.schema.json",
  "worker.js",
  "_headers",
  "wrangler.toml"
];

test(".assetsignore keeps local artifacts out of the published assets and ships the real page", (t) => {
  try {
    execFileSync("git", ["--version"], { stdio: "pipe" });
  } catch {
    t.skip("git is required to evaluate .gitignore-style patterns");
    return;
  }

  const repo = mkdtempSync(join(tmpdir(), "freebuddy-assetsignore-"));
  // An empty global excludes file plus GIT_CONFIG_NOSYSTEM keep the verdict independent of the
  // machine's git configuration: only the rules we are testing may decide.
  const emptyGlobalExcludes = join(repo, "no-global-excludes");
  try {
    writeFileSync(emptyGlobalExcludes, "");
    copyFileSync(ASSETS_IGNORE, join(repo, ".gitignore"));
    execFileSync("git", ["init", "--quiet"], { cwd: repo, stdio: "pipe" });

    const isIgnored = (path) => {
      try {
        execFileSync(
          "git",
          ["-c", `core.excludesFile=${emptyGlobalExcludes}`, "check-ignore", "--quiet", "--no-index", path],
          { cwd: repo, stdio: "pipe", env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1" } }
        );
        return true;
      } catch (error) {
        if (error.status === 1) return false; // git exits 1 for "not ignored"
        throw new Error(`git check-ignore failed for "${path}": ${error.stderr || error.message}`);
      }
    };

    for (const path of LOCAL_ONLY) {
      assert.ok(isIgnored(path), `"${path}" must not be published as a static asset`);
    }
    for (const path of PUBLISHED) {
      assert.ok(!isIgnored(path), `"${path}" must keep being published`);
    }
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
