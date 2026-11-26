# dsh-skill-manager

[![validate](https://github.com/zj6511235/dsh-skill-manager/actions/workflows/validate.yml/badge.svg)](https://github.com/zj6511235/dsh-skill-manager/actions/workflows/validate.yml)

A local store for DeepSeek Harness. Install third-party **skills** and **MCP connectors** into one isolated folder, enable or disable them live, and let the plugin register them with DSH for you.

![icon](icon.svg)

## What it does

- **One store, no global pollution.** Everything lives under `~/.dsh/skills_store/` (override with `DSH_SKILL_STORE` or the `storeDir` config).
- **Five install sources**
  - npm packages — `@scope/name@1.2.3`, `npm:pkg`
  - GitHub / any git repository — `https://github.com/owner/repo`, `github:owner/repo#branch`, `owner/repo`
  - [SkillHub](https://skillhub.cn) — `skillhub:<slug>` or a `https://skillhub.cn/skills/<slug>` page URL
  - local or remote archives — `.zip`, `.tar.gz`
  - a local skill folder — `C:\path\to\skill`
- **一个连接器市场 / A connector marketplace.** 18 ready-made connectors — Notion, 飞书, Slack, GitHub, Context7, DeepWiki, Microsoft Learn, Playwright, 本地文件, 长期记忆, Brave 搜索, PostgreSQL, Google 地图, 高德地图, 百度地图 and more — install with one click. A connector that needs a key asks for it once: the value goes into **DSH credentials** (`${credential:REF}`) and the store index keeps only the reference. Removing the connector removes its credentials too.
- **MCP connectors, managed like skills.** Add one by pasting a config (`mcpServers` map, VS Code `servers` map, or a single named server), install one from the marketplace, or **reference the MCP servers other agents on this computer already configured** — Claude Desktop / Claude Code, Cursor, Windsurf, Gemini CLI, Codex (TOML), Cline, VS Code, QoderWork, WorkBuddy, CodeBuddy, Hermes, shared `.agents`, and DSH. Each connector has its own enable switch, live connection status, connection test and remove button.
- **No secret ever enters the store.** Referencing an MCP server stores only `{name, agent, file, scope}`; the command, URL, `env` and `headers` are re-read from the original config whenever DSH connects. Scan results show credential *field names* only.
- **Automatic registration.** `SKILL.md` files are registered through `ctx.skills`; MCP servers (inline or referenced) are registered through `ctx.mcpManager`, namespaced as `skm_<id>_<server>`.
- **Dependency self-heal.** Node packages run `npm install --omit=dev` (install scripts are **off** by default); Python packages get a private `.venv` and `pip install`, with a `pip --target .python-libs` fallback when the host cannot create a venv. Missing dependency installs are retried in the background at startup.
- **Migrate from other agents.** Scan the skill folders of Claude Code, Codex, Cursor, Windsurf, Gemini CLI, QoderWork, WorkBuddy, CodeBuddy, Hermes, shared `.agents`, and DSH itself, then either **copy** a skill into this store or **use it in place** without touching the original folder.
- **SkillHub catalog.** Search the public SkillHub catalogue from the panel or CLI and install by slug.
- **Web panel + CLI.** A Settings page and a `dsh-skill` command share the same engine.

## Install into DSH

Requirements: DSH Web (this plugin has a settings page) and Node.js 22.19+.

The repository ships the built `index.js`, `client.js`, `host-api.js` and `lib/`, so a clone runs without a toolchain.

1. Clone the repository somewhere permanent:

   ```sh
   git clone https://github.com/zj6511235/dsh-skill-manager.git
   ```

2. Install it into a profile — from the CLI, or by pointing **Settings → Plugins** at the cloned folder:

   ```sh
   dsh plugin --profile web add link:/path/to/dsh-skill-manager
   ```

3. Restart DSH Web when the plugin manager asks for it.
4. Open **Settings → 技能商店 / Skill Store**.

If `package.json` fails to parse the plugin shows as **包不可用 / not running** — that is a broken manifest, not a code problem; re-clone rather than editing the file in a Windows editor that writes a UTF-8 BOM.

## Use the panel

- **Installed** — copied skills: enable/disable, repair dependencies, read the install log, remove.
- **引用队列 / Reference queue** — the standby queue: skills referenced in place. They wait here and are called on demand per task; enabling/disabling and dropping a reference happen here too. The overview counts them separately from installed copies.
- **MCP 连接器 / MCP connectors** — the connector marketplace sits at the top: a card per connector, category chips, search, and a **连接 / Connect** button that asks for the key once. Below it are every connector this store contributes, whether installed from the marketplace, added by pasting a config, or referenced from another agent. Each row shows its transport, credential field names, live connection status, and offers an enable switch, **测试连接 / Test connection** (a probe that does not disturb the running instance) and remove. The same tab holds the paste-a-config form and the scan-by-agent list with "reference selected / unreference selected".
- **SkillHub** — search and install public skills.
- **引用其他 Agent / Reference other agents** — automatically detects which agent skill folders exist on this computer (Claude Code, Codex, Cursor, Windsurf, Gemini, WorkBuddy…), shows each platform with its skill count, and lets you expand a platform. **Tick the skills first (selection only, no request), then click "Reference selected" to submit them in one tolerant batch.** Platform-level and global "select all / clear" help; invalid folders are skipped with a notice instead of aborting the batch. There is no count limit. After referencing, the assistant recognizes and calls the right skill per task automatically. Nothing is copied and the original folders stay untouched.
- **Import from agents** — scan and copy a skill into this store as an independent copy.
- **对话安装技能 / Install by chat** — the first tab. Describe the need in one sentence (“make PPT”, “extract PDF text”). It searches SkillHub and shows matching skills with descriptions and an Install button; reply “install 2” to pick by number. When nothing matches, it offers a ready-to-copy request for the main DSH assistant to build one.

Enabling or disabling takes effect immediately while DSH is running.

## MCP connectors

There are three ways to get a connector into the store, and all of them behave like a skill afterwards:

0. **Install from the marketplace (one click).** A curated catalog ships with the plugin.
   Pick a card, fill in the key it asks for, press **连接 / Connect** — the entry is created,
   enabled and registered immediately.
1. **Paste a config.** The MCP tab's textarea accepts
   `{"mcpServers": {...}}` (Claude Desktop / Claude Code / Cursor),
   `{"servers": {...}}` (VS Code, with `type: "stdio" | "http"`), or a single
   server object with a `"name"`. Each server becomes its own entry (`mcp-<server>`)
   so it can be switched off independently.
2. **Reference another agent's server.** Scan reads only the known config files and
   shows name, transport, credential field names and a masked target. Ticking and
   referencing stores `{name, agent, file, scope}` — the entry `mcp-<agent>-<server>`
   (plus the project folder when the scope differs). On every registration the plugin
   re-reads that file, so an edit (or a rotated token) in Claude/Cursor/Codex takes
   effect here without restarting anything.

### How a marketplace connector stores its key

The catalog never contains a value. Its `{{field}}` placeholders become
`${credential:SKM_<CONNECTOR>_<FIELD>}` templates, and the value you type is written to the
**DSH credentials provider** (`ctx.credentials.set`). The store index therefore holds only the
reference name:

```json
{ "name": "notion", "transport": "stdio", "command": "npx",
  "args": ["-y", "@notionhq/notion-mcp-server"],
  "env": { "NOTION_TOKEN": "${credential:SKM_NOTION_TOKEN}" } }
```

Removing the connector unsets the credentials it created. If the profile has no credentials
provider, the panel says so and refuses to store the key rather than writing it to disk.

Catalog entries (all verified to exist on npm or to answer as an MCP endpoint):

| Group | Connectors |
|---|---|
| 效率办公 | Notion, 飞书 / Lark (`@larksuiteoapi/lark-mcp`), Slack |
| 开发工具 | GitHub (remote), Context7, DeepWiki (remote, no key), Microsoft Learn (remote, no key), Playwright, Puppeteer |
| 搜索地图 | Brave 搜索, 高德地图 (remote), 百度地图, Google 地图 |
| 数据与文件 | 本地文件, 长期记忆, PostgreSQL |
| 示例调试 | 结构化思考, 官方示例服务器 |

`npx`-based connectors are launched as `npx …` even on Windows: the MCP client spawns through
`cross-spawn`, which resolves the Windows `.cmd` shim itself. Values containing quotes or
newlines are refused instead of being escaped.

Config files that are scanned (only when they exist):

| Agent | File | Format |
|---|---|---|
| Claude Desktop | `%APPDATA%\Claude\claude_desktop_config.json` (`~/Library/Application Support` on macOS, `$XDG_CONFIG_HOME` on Linux) | JSON `mcpServers` |
| Claude Code | `~/.claude.json` (root `mcpServers` **and** `projects.*.mcpServers`), project `.mcp.json` | JSON |
| Cursor | `~/.cursor/mcp.json`, project `.cursor/mcp.json` | JSON |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | JSON |
| Gemini CLI | `~/.gemini/settings.json` (`httpUrl` is understood) | JSON |
| Codex | `~/.codex/config.toml` (`[mcp_servers.*]`, `*_timeout_sec` converted) | TOML subset |
| Cline | `%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json` | JSON |
| VS Code project | `.vscode/mcp.json` | JSON `servers` |
| QoderWork / WorkBuddy / CodeBuddy / Hermes / shared `.agents` / DSH | `~/.<agent>/mcp.json`, `~/.agents/mcp.json`, `~/.dsh/mcp.json` (+ project `.agents` / `.dsh`) | JSON |

A referenced server can be probed from the panel; the probe resolves credentials, connects,
lists tools and closes without touching the running instance.

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
dsh-skill mcp-list
dsh-skill mcp-scan
dsh-skill mcp-catalog                   # list the marketplace catalog
dsh-skill mcp-add ./mcp.json          # or - to read stdin
dsh-skill mcp-link cursor:github      # agent:name from mcp-scan
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

A package is not required for an MCP connector: a bare config JSON handed to `mcp-add`
(or pasted in the panel) is enough — it is stored as its own `mcp-<server>` entry.

## Data layout

```text
~/.dsh/skills_store/
├─ index.json          installed entries, enable state, MCP references (no secrets)
├─ skills/<id>/        extracted package (with skill.json metadata)
├─ logs/<id>.log       dependency install output (credentials redacted)
├─ cache/  trash/  .tmp/
```

An MCP connector added by config or installed from the marketplace lives only in `index.json`
(its folder `mcp/<id>` is not created). A marketplace connector stores credential *references*
(`${credential:SKM_…}`); the values live in the DSH credentials store. A referenced connector
stores `{name, agent, file, scope}`; the live command/URL/env is never written here.

## Security

- Installing a third-party skill runs code from that source. Install only sources you trust.
- npm install scripts are disabled unless you pass `--allow-scripts` / tick the panel option.
- Archives are extracted with path-traversal, symlink, Zip64 and size guards.
- The Host never returns a token; logs are redacted and scan results show credential *names* only.
- A marketplace key is written to the credentials provider and only its reference reaches `index.json`; removing the connector unsets it. Without a credentials provider the Host refuses the install instead of writing the key to disk.
- Connector input is validated: quotes, newlines, tabs and (on Windows) `%` are refused, so a value can never break out of the command line it is substituted into.
- `/mcp/link` accepts only candidate keys the Host itself discovered, and a reference may only point at one of the known agent config files — the route cannot be used to read an arbitrary path.
- The REST API is fenced by `ctx.connection.requestRejection` and rejects bodies over 64 KiB (4 MiB for a batch reference).

## Development

```sh
npm install
npm run build       # TypeScript src/ → index.js, client.js, host-api.js, lib/
npm test            # node:test (--test-isolation=none)
npm run check       # build + test, what CI runs
```

`src/` is the TypeScript source; `index.js`, `client.js`, `host-api.js` and `lib/` are the committed build output so a clone runs without a toolchain. `client.js` is a classic script (no imports) and must stay that way.

## License

MIT. See [LICENSE](LICENSE).
