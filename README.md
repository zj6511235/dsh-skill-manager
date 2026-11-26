# dsh-skill-manager

A local skill store for DeepSeek Harness. Install third-party **skills** and **MCP servers** into one isolated folder, enable or disable them live, and let the plugin register them with DSH for you.

![icon](icon.svg)

## What it does

- **One store, no global pollution.** Everything lives under `~/.dsh/skills_store/` (override with `DSH_SKILL_STORE` or the `storeDir` config).
- **Five install sources**
  - npm packages — `@scope/name@1.2.3`, `npm:pkg`
  - GitHub / any git repository — `https://github.com/owner/repo`, `github:owner/repo#branch`, `owner/repo`
  - [SkillHub](https://skillhub.cn) — `skillhub:<slug>` or a `https://skillhub.cn/skills/<slug>` page URL
  - local or remote archives — `.zip`, `.tar.gz`
  - a local skill folder — `C:\path\to\skill`
- **Automatic registration.** `SKILL.md` files are registered through `ctx.skills`; `manifest.json` `mcpServers` are registered through `ctx.mcpManager`, namespaced as `skm_<id>_<server>`.
- **Dependency self-heal.** Node packages run `npm install --omit=dev` (install scripts are **off** by default); Python packages get a private `.venv` and `pip install`, with a `pip --target .python-libs` fallback when the host cannot create a venv. Missing dependency installs are retried in the background at startup.
- **Migrate from other agents.** Scan the skill folders of Claude Code, Codex, Cursor, Windsurf, Gemini CLI, QoderWork, WorkBuddy, CodeBuddy, Hermes, shared `.agents`, and DSH itself, then either **copy** a skill into this store or **use it in place** without touching the original folder.
- **SkillHub catalog.** Search the public SkillHub catalogue from the panel or CLI and install by slug.
- **Web panel + CLI.** A Settings page and a `dsh-skill` command share the same engine.

## Install into DSH

Requirements: DSH Web (this plugin has a settings page) and Node.js 22.19+.

1. Open DSH → **Settings → Plugins**.
2. Add this directory as a plugin (or use the plugin manager's “add local plugin” entry).
3. Restart DSH Web when the plugin manager asks for it.
4. Open **Settings → 技能商店 / Skill Store**.

CLI install into a profile:

```sh
dsh plugin --profile web add link:C:\path\to\dsh-skill-manager
```

## Use the panel

- **Installed** — copied skills: enable/disable, repair dependencies, read the install log, remove.
- **引用队列 / Reference queue** — the standby queue: skills referenced in place. They wait here and are called on demand per task; enabling/disabling and dropping a reference happen here too. The overview counts them separately from installed copies.
- **SkillHub** — search and install public skills.
- **引用其他 Agent / Reference other agents** — automatically detects which agent skill folders exist on this computer (Claude Code, Codex, Cursor, Windsurf, Gemini, WorkBuddy…), shows each platform with its skill count, and lets you expand a platform. **Tick the skills first (selection only, no request), then click "Reference selected" to submit them in one tolerant batch.** Platform-level and global "select all / clear" help; invalid folders are skipped with a notice instead of aborting the batch. There is no count limit. After referencing, the assistant recognizes and calls the right skill per task automatically. Nothing is copied and the original folders stay untouched.
- **Import from agents** — scan and copy a skill into this store as an independent copy.
- **对话安装技能 / Install by chat** — the first tab. Describe the need in one sentence (“make PPT”, “extract PDF text”). It searches SkillHub and shows matching skills with descriptions and an Install button; reply “install 2” to pick by number. When nothing matches, it offers a ready-to-copy request for the main DSH assistant to build one.

Enabling or disabling takes effect immediately while DSH is running.

## CLI

The plugin installs a `dsh-skill` binary. Run it from the plugin directory or via `npx` after the package is linked.

```sh
dsh-skill add skillhub:find-skill-skillhub
dsh-skill add https://github.com/anthropics/skills --skip-deps
dsh-skill add C:\skills\my-skill.zip
dsh-skill add @scope/pdf-tools@1.2.3
dsh-skill list
dsh-skill search PDF
dsh-skill scan
dsh-skill link C:\Users\me\.claude\skills\writer   # use in place, no copy
dsh-skill import C:\Users\me\.claude\skills\writer # copy into this store
dsh-skill repair pdf-tools
dsh-skill disable pdf-tools
dsh-skill remove pdf-tools --yes
dsh-skill status
```

Options: `--store <dir>`, `--json`, `--force`, `--no-enable`, `--allow-scripts`, `--skip-deps`, `--ref <branch>`.

If DSH is running, it notices the index change through a file watcher and re-registers skills/MCP servers without a restart.

## Supported package shapes

```text
my-skill/
├─ SKILL.md                  # YAML frontmatter: name, description, whenToUse
├─ manifest.json             # optional: name, version, skills[], mcpServers{}, dependencies
├─ package.json              # optional: Node dependencies
├─ requirements.txt          # optional: Python dependencies
└─ ...
```

Minimal `manifest.json`:

```json
{
  "name": "pdf-pack",
  "version": "1.0.0",
  "skills": [{ "path": "SKILL.md" }],
  "mcpServers": {
    "pdf": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "pdf-mcp"],
      "env": { "PDF_TOKEN": "${credential:PDF_TOKEN}" }
    }
  }
}
```

MCP env values may use `${credential:NAME}`; the value is resolved by DSH's MCP manager at runtime and is never written to the store.

## Data layout

```text
~/.dsh/skills_store/
├─ index.json          installed entries and enable state
├─ skills/<id>/        extracted package (with skill.json metadata)
├─ logs/<id>.log       dependency install output (credentials redacted)
├─ cache/  trash/  .tmp/
```

## Security

- Installing a third-party skill runs code from that source. Install only sources you trust.
- npm install scripts are disabled unless you pass `--allow-scripts` / tick the panel option.
- Archives are extracted with path-traversal, symlink, Zip64 and size guards.
- The Host never returns a token; logs are redacted.
- The REST API is fenced by `ctx.connection.requestRejection` and rejects bodies over 64 KiB.

## Development

```sh
npm install
npm run build       # TypeScript src/ → index.js, client.js, host-api.js, lib/
npm test            # node:test (--test-isolation=none)
node ../../tools/check-plugin.cjs .   # workspace publish preflight
```

`src/` is the TypeScript source; `index.js`, `client.js`, `host-api.js` and `lib/` are the committed build output so a clone runs without a toolchain. `client.js` is a classic script (no imports) and must stay that way.

## License

MIT. See [LICENSE](LICENSE).
