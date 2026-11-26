# 开发者指南 · dsh-skill-manager

本指南说明如何编译、测试，并把它作为 DeepSeek Harness（DSH）插件加载。

---

## 1. 目录结构

```text
dsh-skill-manager/
├─ src/                    TypeScript 源码（唯一要改的地方）
│  ├─ index.ts             Host 入口：路由、生命周期、服务注入
│  ├─ host-api.ts          REST 路由与错误映射
│  ├─ client.ts            Web 设置页（classic script，无 import）
│  └─ lib/
│     ├─ store.ts          安装引擎、索引、锁、依赖安装
│     ├─ manifest.ts       SKILL.md / manifest.json 解析
│     ├─ zip.ts / tar.ts   带安全边界的解包器
│     ├─ source.ts         安装源分类（npm/GitHub/SkillHub/zip/本地）
│     ├─ skillhub.ts       SkillHub 公开 API 客户端
│     ├─ external.ts       其他 Agent 技能目录扫描
│     ├─ registry.ts       ctx.skills / ctx.mcpManager 注册
│     ├─ process.ts        受限子进程、超时、日志脱敏
│     ├─ frontmatter.ts    YAML frontmatter 子集解析
│     └─ safe-path.ts      路径/名称校验
├─ bin/dsh-skill.mjs       CLI（复用 lib/store.js）
├─ test/                   node:test 测试与夹具
├─ index.js                ← 编译产物（已提交）
├─ client.js               ← 编译产物（已提交）
├─ host-api.js             ← 编译产物（已提交）
├─ lib/*.js                ← 编译产物（已提交）
├─ cordis.patch.yml        bundle 补丁
├─ locale/zh.json, en.json 插件页标题/描述
├─ docs/DETAIL.md          用户可见行为与限制
└─ package.json
```

`src/` 是 TypeScript 源，根目录的 `index.js` / `client.js` / `host-api.js` / `lib/`
是编译产物并提交进仓库，所以别人 clone 后不装依赖也能被 DSH 直接加载。

---

## 2. 环境要求

- Node.js **22.19+**（本项目在 24.20 上验证）
- 本机已安装 DSH Web
- 可选：`git`（GitHub 源）、Python（Python 依赖）

---

## 3. 安装依赖并编译

```sh
cd dsh-skill-manager

# 只装构建期依赖（typescript、@types/node）
npm install

# 编译：src/ → index.js + client.js + host-api.js + lib/
npm run build

# 类型检查（不产出文件）
npm run typecheck
```

`npm run build` 做了三件事：

1. `tsc -p tsconfig.json` 输出到 `dist/`；
2. 把 `dist/index.js`、`dist/client.js`、`dist/host-api.js`、`dist/lib/` 复制到根目录；
3. 检查 `client.js` 里没有顶层 `import/export`，并去掉 TypeScript 为脚本加上的
   `export {};`。DSH 会把 `client.js` 当 **classic combo script** 拼接执行，
   一旦出现 ESM 语法整页会挂。

如果 `npm` 因沙箱禁止写全局缓存而报 `EPERM`，把缓存指到仓库内：

```sh
npm install --cache .npm-cache
```

---

## 4. 测试

```sh
npm test
# 等价于：node --test --test-isolation=none test/*.test.mjs
```

为什么加 `--test-isolation=none`：Node 默认让测试运行器用管道派生子进程；
在某些 Windows 沙箱里管道创建被拒绝（`spawn EPERM`）。单进程模式绕开这一点。
CI 或普通机器上想去掉也可以，测试本身不依赖它。

覆盖内容：

- frontmatter、manifest、MCP 校验；
- ZIP / tar.gz 解包、路径穿越、符号链接、大小边界；
- 安装源分类（npm、GitHub、SkillHub、URL、本地目录）；
- store 端到端：ZIP 安装、启停、移除、跨 Agent 导入、失败回滚；
- 注册控制器：`ctx.skills.register` / `ctx.mcpManager.register`、卸载释放；
- Host 路由：状态、安装、启停、移除、错误码、405/404；
- `apply()`：路由前缀、`requestRejection` 失败关闭；
- `client.js`：只调用一次 `__ModuleLoader__.load`，注册 `settings.section`。

真实网络的 SkillHub 安装属于「未在自动测试里覆盖」的部分，可用 CLI 手动验证：

```sh
node bin/dsh-skill.mjs --store .test-store add skillhub:find-skill-skillhub --skip-deps
node bin/dsh-skill.mjs --store .test-store list
```

---

## 5. 加载到 DSH

### 方式 A：设置页添加本地插件（推荐）

1. 打开 DSH Web → **设置 → 插件**；
2. 选择「添加插件 / 本地目录」，指向 `dsh-skill-manager` 目录；
3. 按提示重启 DSH Web；
4. 打开 **设置 → 技能商店**。

### 方式 B：命令行装进 profile

```sh
# profile 名称用你正在用的，例如 web 或 desktop
dsh plugin --profile web add link:C:\Users\you\Desktop\agent\dsh-skill-manager
```

`dsh plugin` 接受 pnpm 参数；`link:` 指向源码目录，改完 `npm run build` 后重启即可。
也可以把目录打包成 tarball 后用 `file:` 安装。

### 方式 C：手动链接（开发调试）

把插件目录加入 `~/.dsh/profiles/<profile>/package.json` 的依赖与
`dsh.profile.bundles`，再在 profile 目录执行 `pnpm install`。不清楚 profile
结构时优先用方式 A/B。

加载后可以在 DSH 的 Cordis 检查工具里确认：

- Host 路由 `/dsh-skill-manager/v1/status` 能返回 JSON；
- `settings.section` 下出现 id 为 `skill-manager` 的项。

---

## 6. Host 半：注册与生命周期

`src/index.ts` 的 `apply(ctx, config)`：

- `inject = ['webServer', 'connection']`：只声明必需服务；
- 路由在 `ctx.effect(() => webServer.register(...))` 内注册，卸载时自动移除；
- 每个请求先调用 `ctx.connection.requestRejection(req)`，拒绝即返回；
  取不到该服务时 **fail-closed 403**；
- `skills` 与 `mcpManager` 通过 `ctx.inject` 懒加载：服务不存在时插件照常启动，
  只是不注册对应能力（状态页会显示不可用）；
- `store` 目录变化由 `fs.watch` 监听，CLI 改完索引后自动刷新注册；
- 启动 3 秒后后台重跑缺失的依赖安装（`config.autoRepair !== false`）。

### REST 路由

前缀 `/dsh-skill-manager/v1`，JSON，请求体上限 4 MiB（便于一次全选引用大量技能）。

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/status` | 存储统计、服务可用性、注册警告 |
| GET | `/skills` | 已安装列表 |
| POST | `/install` | `{source, enable?, force?, allowScripts?, ref?, skipDependencies?}` |
| POST | `/remove` | `{id}` |
| POST | `/enable` | `{id, enabled}` |
| POST | `/repair` | `{id}` |
| POST | `/refresh` | 重建注册 |
| GET | `/log?id=` | 安装日志（已脱敏） |
| GET | `/scan` | 其他 Agent 技能候选与已检测平台（`candidates`, `platforms`） |
| POST | `/link` | `{paths: string[], enable?, force?}`（或单个 `path`），批量直接使用外部目录，不复制 |
| POST | `/import` | `{path, enable?, force?}`，复制进本库 |
| GET | `/search?q=&page=` | SkillHub 搜索 |
| GET | `/skillhub?slug=` | SkillHub 详情 |

错误统一为 `{ error, code }`；`code` 取值见 `src/lib/errors.ts`。

### 存储与锁

- 根目录：`~/.dsh/skills_store`（`storeDir` 配置或 `DSH_SKILL_STORE` 覆盖）；
- `index.json` 用「临时文件 + rename」原子替换；
- 所有写操作抢 `.lock`，30 秒等不到返回 `busy`，15 分钟视为陈旧锁；
- 覆盖安装失败时恢复旧目录与旧索引项；
- 依赖安装日志写在 `logs/<id>.log`，写入前经过 `redactSecrets()`。

### 技能与 MCP 注册

```ts
ctx.skills.register({
  name, description, whenToUse,
  source: 'custom', provider: 'skill-manager',
  path: '<store>/skills/<id>/SKILL.md',
  content: '<去掉 frontmatter 的正文>',
  resourceBase: { kind: 'directory', path: '<store>/skills/<id>' },
})
```

```ts
ctx.mcpManager.register('skm_<id>_<server>', {
  transport: 'stdio',
  command, args, env, cwd,
})
```

MCP 名被限制在 32 字符内，超长时截断并附哈希后缀。`${credential:NAME}` 原样交给
MCP 管理器，由 DSH 在运行时解析，插件不读取、不落盘。

**直接使用（external）** 条目在 index 里带 `origin: "external"` 与绝对
`externalPath`。注册时 `resourceBase` 和 MCP 的 `cwd` 都指向原目录；不写
`skill.json`、不装依赖、不复制。移除时只删 index 条目，绝不删除原目录。`repair`
对这类条目直接报错，避免把依赖写进别的 Agent 的目录。

设置页的「直接使用其他 Agent」把 `/scan` 的候选按 `agentLabel` 分组；勾选后调用
`/link {paths}`，`linkMany()` 在写索引前统一校验，整批要么全部生效要么完全不改。
「从其他 Agent 导入」只调用 `/import`，保持复制安装的旧行为。

「对话安装技能」不调用模型：`searchKeywords()` 去掉“帮我 / 安装 / 技能”等口语词后调用
`/search`，把结果作为卡片消息返回；`安装 N` 或直接回复序号会调用 `/install`。
没有结果时只生成一段可复制的开发需求，真正的 Skill 开发交给 DSH 主对话的助手。
如果以后要接模型，可在 Host 里通过 `ctx.llm` 增加一个受控的 `/assistant` 路由，
而不是在 Client 里直接调用模型。

---

## 7. Client 半：设置页

`src/client.ts` 是单文件、无 import 的 classic script：

```js
window.__ModuleLoader__.load({
  id: 'dsh-skill-manager',
  factory(require) {
    const React = require('react')
    // ...
    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('settings.section', () =>
          ctx.slots.register({ name: 'settings.section', id: 'skill-manager', order: 13, label }, Page))
      },
    }
  },
})
```

约束：

- 只扩展 `settings.section`，不改根节点、不 append 到 `document.body`；
- 样式只用 `--dsw-alias-*` / `--dsw-radius-*` token，深色/浅色都跟随主题；
- 文案在文件内的 `COPY.zh` / `COPY.en` 字典里，按 `ctx.locale` 或浏览器语言选择；
- 所有网络请求走 `/dsh-skill-manager/v1`，浏览器不直接碰文件系统；
- 页面卸载时 `alive` 标记阻止迟到的 `setState`。

---

## 8. CLI

`bin/dsh-skill.mjs` 与 Host 共用 `lib/store.js`，所以 DSH 没启动也能安装/卸载。
DSH 启动后通过索引文件监听同步。

```sh
dsh-skill add <source> [--no-enable] [--force] [--allow-scripts] [--skip-deps] [--ref <ref>]
dsh-skill list [--json]
dsh-skill status
dsh-skill search <keyword>
dsh-skill scan [--json]
dsh-skill link <path> [--no-enable] [--force]   # 直接使用，不复制
dsh-skill import <path> [--force]               # 复制安装
dsh-skill enable|disable <id>
dsh-skill repair <id>
dsh-skill remove <id> --yes
```

`--store <dir>` 可指向隔离目录，便于测试：

```sh
node bin/dsh-skill.mjs --store ./.test-store add ./fixtures/demo.zip
```

> DSH 启动器目前只内置 `dsh plugin`，没有给普通插件注册 `dsh <子命令>` 的扩展点，
> 所以命令名是 `dsh-skill`。如果习惯 `dsh skill …`，可以在 shell 里加一个转发函数：
>
> PowerShell：`function dsh { if ($args[0] -eq 'skill') { dsh-skill @($args[1..($args.Count-1)]) } else { & dsh.exe @args } }`
>
> bash/zsh：`dsh() { if [ "$1" = skill ]; then shift; dsh-skill "$@"; else command dsh "$@"; fi; }`

---

## 9. 安装源格式

| 来源 | 示例 | 实现 |
|---|---|---|
| npm | `@scope/pkg@1.2.3`、`npm:pkg` | `npm pack --json`，解 tar.gz |
| GitHub / git | `https://github.com/o/r`、`github:o/r#dev`、`o/r` | `git clone --depth 1`，可带子目录 |
| SkillHub | `skillhub:slug`、`https://skillhub.cn/skills/<slug>` | 公开 API 下载 ZIP |
| 压缩包 | `./skill.zip`、`https://.../x.zip` | 下载后按魔数解 ZIP/tar.gz |
| 本地目录 | `C:\skills\demo` | 复制（跳过 node_modules/.git/.venv） |

---

## 10. 常见问题

| 现象 | 原因 / 处理 |
|---|---|
| 设置页没有「技能商店」 | 插件未加载或未重启；看 DSH 插件页与日志 |
| `spawn EPERM` | Windows 沙箱禁止带管道的子进程；本项目已改为「文件捕获」，若仍出现请检查杀软/策略 |
| `npm 下载失败` | 网络、代理或 npm 缓存权限；先手动 `npm pack <pkg>` 验证 |
| `git clone 失败` | 本机 Git 的 schannel 凭据/代理问题；改用 ZIP 或先在终端确认 `git clone` 可用 |
| MCP 未出现 | 状态页看 `capabilities.mcp`；若为 false，说明当前 profile 没有 `mcpManager` 服务 |
| 技能名冲突 | 同名技能已注册时会跳过并在状态页给警告；改名或停用旧条目 |
| 商店搜索 502 | SkillHub 不可达；已安装技能不受影响 |

---

## 11. 发布前检查

```sh
node --check index.js
node --check host-api.js
node --check client.js
for f in lib/*.js bin/*.mjs scripts/*.mjs; do node --check "$f"; done

node ../../tools/check-plugin.cjs .
```

在工作区里 `check-plugin.cjs` 必须退出 `0`（0 错误、0 警告）才能发布。发布新版本前
先升 `package.json` 的 `version`。
