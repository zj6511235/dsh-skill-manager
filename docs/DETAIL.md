# dsh-skill-manager

## 位置

**设置 → 技能商店 / Skill Store**

插件同时注册一个 Host 路由前缀 `/dsh-skill-manager/v1`，供设置页和 CLI 共用；
命令行为 `dsh-skill`。

## 它做什么

把第三方 Skill 与 MCP 服务装进独立目录 `~/.dsh/skills_store/`，然后：

- 解析 `SKILL.md` 或 `manifest.json`，把技能注册进 `ctx.skills`；
- 把清单里的 `mcpServers` 注册进 `ctx.mcpManager`，命名空间为 `skm_<id>_<server>`；
- 支持**连接器市场一键连接**（18 个现成连接器，密钥存 DSH 凭据库）、**单独添加 MCP 连接器**（粘贴配置）与**引用其他 Agent 已配置的 MCP**，同样是启停即生效；
- 启用 / 停用、移除、修复依赖都在当前进程内即时生效，不需要重启 DSH；
- 从 npm、GitHub、SkillHub、`.zip` / `.tar.gz`、本地目录安装；
- 扫描其他 Agent（Claude Code、Codex、Cursor、Windsurf、Gemini、QoderWork、
  WorkBuddy、CodeBuddy、Hermes、共享 `.agents`、DSH）已装的技能并复制进来。

面板分七页：**对话安装技能**、已安装、**引用队列**、**MCP 连接器**、SkillHub 商店、
**引用其他 Agent**、从其他 Agent 导入；默认打开「对话安装技能」。

统计卡把 **已安装**（复制进技能库的副本）与 **引用队列**（只注册引用、待命调用）分开计数：
引用技能不会增加「已安装」，只会增加「引用队列」和「注册技能」。

「引用其他 Agent」进入时自动扫描：先列出本机检测到的平台和各自技能数，再按平台
展开技能列表。**先勾选技能（只是选择，不发请求），再点顶部「引用选中」一次性提交**；
可用平台级/全局的「全选」「清空」配合。批量引用会跳过无效目录并在顶部提示，
不会因单个坏包中断整批。引用只注册、不复制文件、不改原目录，取消时只删除引用。
引用后由助手按当前任务自动识别并调用对应技能。
「从其他 Agent 导入」仍和原来一样，只做复制安装。

「对话安装技能」是一个不调用大模型的关键词助手：把一句话去掉“帮我 / 安装 / 技能”等
口语词后搜索 SkillHub，列出技能卡片和描述，点「安装」即可；也可以回复「安装 2」
选择第几个结果。没有匹配时，它给出可直接复制的开发需求，建议交给 DSH 主对话的
助手开发，本插件不会在面板里自动生成代码。

## MCP 连接器

和技能一样，MCP 连接器也是技能库里的独立条目，可以单独启停、测试、移除。三条入口：

0. **连接器市场（一键连接）**：面板顶部按分类列出 18 个现成连接器（Notion、飞书 / Lark、
   Slack、GitHub、Context7、DeepWiki、Microsoft Learn、Playwright、Puppeteer、本地文件、
   长期记忆、结构化思考、Brave 搜索、PostgreSQL、Google 地图、高德地图、百度地图、官方
   示例）。点「连接」，需要密钥的填一次即可。目录里没有任何密钥：占位符会变成
   `${credential:SKM_<连接器>_<字段>}`，你填的值写进 **DSH 凭据库**，索引里只留引用名；
   移除连接器时一并删除它创建的凭据。profile 没有凭据服务时面板会明确提示，并拒绝把密钥
   落盘，而不是退化成明文保存。
1. **粘贴配置添加**：接受 `{"mcpServers": {...}}`、`{"servers": {...}}`（VS Code 的
   `type: "stdio" | "http"`）或带 `"name"` 的单个服务对象。每个服务生成 `mcp-<server>`
   条目；重复添加同名服务是更新而不是复制。
2. **扫描其他 Agent 引用**：只读已知配置文件，列出名称、传输方式、凭据字段名和打码后的
   目标。勾选后引用，索引里只存 `{name, agent, file, scope}`；`env` / `headers` 每次
   注册时从原文件重新读取，所以对方改了配置或轮换了 token，这里自动跟上，且密钥从不
   进入技能库。

扫描覆盖：Claude Desktop、Claude Code（`~/.claude.json` 根级与 `projects.*.mcpServers`、
项目 `.mcp.json`）、Cursor、Windsurf、Gemini CLI、Codex（`config.toml` 的
`[mcp_servers.*]`）、Cline、VS Code 项目 `.vscode/mcp.json`、QoderWork、WorkBuddy、
CodeBuddy、Hermes、共享 `.agents`、DSH 的 `mcp.json`。文件不存在就跳过。

每行连接器都会显示 DSH 报告的实时状态（connected / failed / waiting-credentials 等）。
「测试连接」调用 `mcpManager.probe()`：解析凭据、连接、列出工具后关闭，不影响正在运行的实例。

基于 `npx` 的连接器在 Windows 上也直接以 `npx …` 启动（MCP 客户端用 cross-spawn 解析
`.cmd` shim）；连接器输入里的引号、换行和制表符会被拒绝而不是转义。

## 使用

1. 在「安装新技能」输入来源，例如 `skillhub:find-skill-skillhub`、
   `https://github.com/owner/repo`、`@scope/pkg@1.2.3`、`C:\path\skill.zip`。
2. 安装完成后列表出现条目，默认启用。
3. 用开关启停；「修复依赖」重跑 npm/pip；「日志」看安装输出。
4. 「从其他 Agent 导入」先扫描，再点「导入」复制到本库。

命令行：

```sh
dsh-skill add <source> [--no-enable] [--force] [--allow-scripts] [--skip-deps]
dsh-skill list | status | scan
dsh-skill search <keyword>
dsh-skill import <path>
dsh-skill enable|disable|repair <id>
dsh-skill remove <id> --yes

dsh-skill mcp-list
dsh-skill mcp-scan
dsh-skill mcp-catalog                    # 列出连接器市场（需在面板里填密钥）
dsh-skill mcp-add <config.json|->        # - 表示从 stdin 读
dsh-skill mcp-link <agent>:<name...>     # 例：cursor:github
```

## 数据与清理

```text
~/.dsh/skills_store/
├─ index.json        安装索引（唯一事实源）
├─ skills/<id>/      解包后的技能
├─ logs/<id>.log     依赖安装日志（敏感值已脱敏）
├─ cache/  trash/  .tmp/
```

移除条目会删掉对应的 `skills/<id>/`；安装失败会恢复上一版本。禁用不会删文件。
MCP 连接器条目不会创建目录：手动添加的只存在 `index.json` 里，引用的只记录来源文件。

## 限制

- **第三方技能会执行代码。** npm 依赖安装默认加 `--ignore-scripts`；勾选
  「允许依赖安装脚本」或传 `--allow-scripts` 才会运行。只安装可信来源。
- MCP 服务通过 `ctx.mcpManager.register()` 在本插件生命周期内注册，不写入
  `cordis.patch.yml`；卸载本插件即全部撤销。需要常驻的 MCP 仍应写进 DSH 配置。
- 引用的 MCP **不复制密钥**：只保存文件位置，连接时重新读取。原配置里的服务被删除或
  改名后，注册会给出「原配置已变化」的警告，条目仍留在列表里等你取消引用。
- 引用的 MCP 只会读取上面列出的已知配置文件；面板提交的是扫描得到的候选 key，
  Host 会再校验一次，因此这条路由不能用来读取任意路径。
- 「测试连接」取决于当前 profile 是否有 `mcpManager.probe()`；没有时按钮禁用并提示。
- 引用的 MCP 没有"包目录"，因此不覆盖 `cwd`：相对路径的 `command` / `args`
  会继承 DSH 进程的工作目录。如果原 Agent 依赖别的工作目录（例如
  `node bridge.mjs`），请用「粘贴配置添加」并显式写 `cwd`。
- 引用没有数量上限：可以一次全选所有平台、所有技能，一次性注册完成，无需按平台分批。
  注册后由助手按当前任务需求自动识别并调用对应技能，不需要手动逐个启用，也不存在「一次最多 N 个」的限制。
- 批量引用是**容错**的：缺 `SKILL.md`、解析失败（如包内技能重名）、与已复制技能重名的目录会被
  跳过并在面板提示，其余目录照常注册；单个坏包不会中断整批全选。
- 直接使用的技能不会复制、不会自动安装依赖，也不会改动原目录；依赖请在原 Agent 中
  维护。原目录被移动或删除后，条目会在状态页给出警告，可从列表移除引用。
- `manifest.json` 的 `mcpServers` 支持 `stdio` 与 `streamable-http`；其他传输方式
  （如旧式 SSE）按 `streamable-http` 处理，可能连接失败。
- Python 依赖优先创建私有 `.venv`；若本机 `venv` / `ensurepip` 不可用，自动退回
  `pip install --target .python-libs`，并在注册 Python MCP 服务时把它加入 `PYTHONPATH`。
  两条路都失败时会回滚本次安装并写明原因。
- 扫描只覆盖已知 Agent 目录的一层，不递归整个磁盘；符号链接按普通路径读取。
- 从 SkillHub 安装依赖其公开 API；网络不可达时商店搜索显示错误，已安装内容不受影响。
- CLI 直接操作同一索引；DSH 运行时通过文件监听同步，通常 1 秒内生效。若文件
  监听被系统限制，点面板「刷新」或重启 DSH。
