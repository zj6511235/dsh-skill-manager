# dsh-skill-manager

## 位置

**设置 → 技能商店 / Skill Store**

插件同时注册一个 Host 路由前缀 `/dsh-skill-manager/v1`，供设置页和 CLI 共用；
命令行为 `dsh-skill`。

## 它做什么

把第三方 Skill 与 MCP 服务装进独立目录 `~/.dsh/skills_store/`，然后：

- 解析 `SKILL.md` 或 `manifest.json`，把技能注册进 `ctx.skills`；
- 把清单里的 `mcpServers` 注册进 `ctx.mcpManager`，命名空间为 `skm_<id>_<server>`；
- 启用 / 停用、移除、修复依赖都在当前进程内即时生效，不需要重启 DSH；
- 从 npm、GitHub、SkillHub、`.zip` / `.tar.gz`、本地目录安装；
- 扫描其他 Agent（Claude Code、Codex、Cursor、Windsurf、Gemini、QoderWork、
  WorkBuddy、CodeBuddy、Hermes、共享 `.agents`、DSH）已装的技能并复制进来。

面板分六页：**对话安装技能**、已安装、**引用队列**、SkillHub 商店、**引用其他 Agent**、
从其他 Agent 导入；默认打开「对话安装技能」。

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

## 限制

- **第三方技能会执行代码。** npm 依赖安装默认加 `--ignore-scripts`；勾选
  「允许依赖安装脚本」或传 `--allow-scripts` 才会运行。只安装可信来源。
- MCP 服务通过 `ctx.mcpManager.register()` 在本插件生命周期内注册，不写入
  `cordis.patch.yml`；卸载本插件即全部撤销。需要常驻的 MCP 仍应写进 DSH 配置。
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
