/**
 * dsh-skill-manager — Client half.
 *
 * One Settings page with three panels: installed skills, the public SkillHub
 * catalogue, and skills found in other agents' skill folders. Every action
 * goes through the Host routes; the browser never touches the filesystem.
 * This file is loaded as a classic combo script, so it has no imports/exports,
 * owns its localized copy, and wraps everything in an IIFE so a top-level
 * binding cannot collide with another plugin in the same combo.
 */
;(() => {
  const loader = (globalThis as unknown as {
    __ModuleLoader__?: { load: (options: { id: string; factory: (require: (id: string) => unknown) => unknown }) => void }
  }).__ModuleLoader__

  loader?.load({
  id: 'dsh-skill-manager',
  factory(require) {
    const React = require('react') as {
      createElement: (type: unknown, props?: Record<string, unknown> | null, ...children: unknown[]) => unknown
      useState: <T>(initial: T) => [T, (value: T | ((previous: T) => T)) => void]
      useEffect: (effect: () => void | (() => void), deps?: unknown[]) => void
      useCallback: <T extends (...args: never[]) => unknown>(fn: T, deps: unknown[]) => T
      useRef: <T>(initial: T) => { current: T }
    }
    const h = React.createElement
    const { useCallback, useEffect, useRef, useState } = React

    const ROUTE = '/dsh-skill-manager/v1'
    const SECTION_ID = 'skill-manager'

    // ---------------------------------------------------------------- copy --
    function detectLang(ctx: unknown): 'zh' | 'en' {
      try {
        const context = ctx as { locale?: { getSnapshot?: () => { id?: string; locale?: string; current?: string } } }
        const snapshot = context?.locale?.getSnapshot?.()
        const id = snapshot?.id ?? snapshot?.locale ?? snapshot?.current
        if (typeof id === 'string' && id.toLowerCase().indexOf('zh') === 0) return 'zh'
        if (typeof id === 'string' && id.length > 0) return 'en'
      } catch {
        /* locale service unavailable */
      }
      try {
        const language = String((globalThis as { navigator?: { language?: string } }).navigator?.language ?? '').toLowerCase()
        if (language.indexOf('zh') === 0) return 'zh'
      } catch {
        /* navigator unavailable */
      }
      return 'en'
    }

    const COPY = {
      zh: {
        nav: '技能商店',
        title: '技能商店',
        intro: '把第三方 Skill 和 MCP 服务装进独立技能库，启停即时生效。支持 npm、GitHub、SkillHub 与 .zip 包，也能把其他 Agent 装过的技能一键迁移过来。',
        storeDir: '存储位置',
        installedCount: '已安装',
        enabledCount: '已启用',
        externalCount: '引用队列',
        skillsCount: '注册技能',
        mcpCount: 'MCP 服务',
        statsHint: '「已安装 / 已启用」只统计复制进技能库的技能；从其他 Agent 引用的技能只进入「引用队列」，按任务待命、随用随调。',
        capSkills: '技能服务',
        capMcp: 'MCP 服务',
        capOn: '可用',
        capOff: '不可用',
        tabInstalled: '已安装',
        tabQueue: '引用队列',
        tabStore: 'SkillHub 商店',
        tabDirect: '引用其他 Agent',
        tabImport: '从其他 Agent 导入',
        tabChat: '对话安装技能',
        installTitle: '安装新技能',
        installPlaceholder: 'npm 包名 / GitHub 地址 / skillhub:<slug> / .zip 路径',
        installHint: '例：skillhub:find-skill-skillhub、https://github.com/owner/repo、@scope/pkg@1.2.3、C:\\path\\skill.zip',
        install: '安装',
        installing: '正在安装…',
        installWarnings: '安装完成，但有提醒：',
        emptyInstalled: '还没有安装任何技能。先在上面的输入框里贴一个来源。',
        emptyQueue: '引用队列为空。到「引用其他 Agent」勾选技能，勾上即加入待命队列。',
        noDescription: '没有填写说明',
        sourceNpm: 'npm',
        sourceGit: 'Git',
        sourceSkillhub: 'SkillHub',
        sourceArchive: '压缩包',
        sourceLocal: '本地',
        enabled: '已启用',
        disabled: '已停用',
        enable: '启用',
        disable: '停用',
        repair: '修复依赖',
        repairing: '正在修复…',
        log: '日志',
        remove: '移除',
        unlink: '取消引用',
        confirmRemove: '确认移除',
        directUse: '引用',
        directIntro: '读取本机各 Agent 已安装的 Skill。先勾选要引用的技能，再点「引用选中」一次性提交；勾选只是选择，不会立即发请求。不复制文件、不改原目录，对方更新后这里立即生效。引用后助手会按任务需求自动识别并调用对应技能。',
        scanningPlatforms: '正在识别本机 Agent 平台…',
        platformsTitle: '已识别平台',
        noPlatforms: '没有识别到已安装的 Agent 技能目录。可以点「重新扫描」再试一次。',
        platformCount: '{count} 个技能',
        noSkillsInPlatform: '该平台未发现技能',
        selectAllPlatforms: '全选',
        clearAllPlatforms: '清空',
        expand: '展开',
        collapse: '收起',
        selectedCount: '已选 {count} 个',
        queueTitle: '引用队列',
        queueCount: '{count} 个待命',
        queueEmpty: '还没有引用技能；勾选后立即进入队列待命，对话时按任务自动调用。',
        useSelected: '引用选中（{count}）',
        unuseSelected: '取消引用选中（{count}）',
        selectAll: '全选',
        clearAll: '清空',
        directUsing: '正在引用…',
        directUseHint: '批量引用会跳过无效目录（缺 SKILL.md、解析失败、重名冲突），其余照常注册；引用不安装依赖、不改原目录。引用后由助手按任务自动调用。',
        linkedBadge: '已引用',
        externalBadge: '外部 · 不复制',
        copiedBadge: '已复制',
        noticeLinked: '已引用 {name}',
        noticeUnlinked: '已取消引用 {name}',
        noticeLinkedMany: '已引用 {count} 个技能',
        noticeUnlinkedMany: '已取消 {count} 个引用',
        batchTooLarge: '所选技能较多，正在一次性注册全部，请稍候。',
        cancel: '取消',
        close: '关闭',
        skillsLabel: '技能',
        mcpLabel: 'MCP',
        versionLabel: '版本',
        installedAt: '安装于',
        searchTitle: 'SkillHub 商店',
        searchPlaceholder: '搜索技能，例如：PDF、数据分析、视频剪辑',
        search: '搜索',
        searching: '搜索中…',
        searchEmpty: '没有找到匹配的技能。换个关键词试试。',
        searchHint: '搜索来自 skillhub.cn 的公开技能库，安装时会下载官方 ZIP 包。',
        downloads: '下载',
        publisher: '发布者',
        verified: '认证',
        needsKey: '需要 API Key',
        importTitle: '从其他 Agent 导入',
        importHint: '扫描本机 Claude Code、Codex、Cursor、Windsurf、Gemini 等 Agent 的技能目录，复制进当前技能库。原目录不会被修改。',
        scan: '重新扫描',
        scanning: '正在扫描…',
        import: '导入',
        importing: '正在导入…',
        importEmpty: '没有发现其他 Agent 装过的技能。',
        alreadyInstalled: '已在本库',
        refresh: '刷新',
        noticeInstalled: '已安装 {name}',
        noticeRemoved: '已移除 {name}',
        noticeEnabled: '已启用 {name}',
        noticeDisabled: '已停用 {name}',
        noticeImported: '已导入 {name}',
        noticeRepaired: '依赖已修复：{name}',
        noticeRefreshed: '已刷新注册',
        chatIntro: '用一句话说你想装什么，我会搜索 SkillHub 的技能并给出描述和选项。点「安装」即可，也可以回复「安装 2」选择第 2 个。',
        chatWelcome: '你好，告诉我你想让助手做什么，例如「PPT 制作」「PDF 文字提取」「数据分析」。我会列出匹配的 Skill，你挑一个安装。',
        chatPlaceholder: '例如：帮我安装一个做 PPT 的技能',
        chatSend: '发送',
        chatSearching: '正在搜索…',
        chatFound: '找到 {count} 个与「{query}」相关的技能：',
        chatNoResult: '没有找到合适的现成 Skill。你可以复制下面的需求，交给 DSH 主对话的助手来开发一个。',
        chatCopyPrompt: '复制开发需求',
        chatCopied: '已复制到剪贴板',
        chatInstall: '安装',
        chatInstalling: '安装中…',
        chatInstalled: '已安装 {name}。',
        chatPromptPrefix: '请帮我开发一个 DSH Skill：',
        chatExamples: '试试：PPT 制作 / PDF 提取 / 数据分析 / 视频剪辑',
        chatNeedResult: '请先让我搜索一次，再回复「安装 2」这样的序号。',
        logTitle: '安装日志 · {name}',
        logEmpty: '这个技能没有日志。',
        warningsTitle: '注册提醒',
        permissionHint: '安装第三方技能等于在本机运行它的依赖安装脚本；只安装你信任的来源。',
        allowScripts: '允许依赖安装脚本',
        tabMcp: 'MCP 连接器',
        mcpIntro: '像管理技能一样管理 MCP 连接器：可以自己粘贴配置添加，也可以扫描本机其他 Agent（Claude、Cursor、Codex、Gemini…）已配置的 MCP 并「引用」过来。引用只保存位置，不复制任何密钥；对方的配置改了，这里会自动跟上。',
        mcpEmpty: '还没有 MCP 连接器。可以扫描本机其他 Agent，或在下面粘贴一份配置。',
        mcpAddTitle: '添加 MCP 连接器',
        mcpAddPlaceholder: '{ "mcpServers": { "github": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"], "env": { "GITHUB_TOKEN": "${credential:GITHUB_TOKEN}" } } } }',
        mcpAddHint: '支持 {"mcpServers": {...}}、{"servers": {...}}（VS Code）或带 name 的单个服务对象；env / headers 里的密钥可以用 ${credential:名字} 交给 DSH 凭据管理。',
        mcpAdd: '添加连接器',
        mcpAddBusy: '正在添加…',
        mcpScan: '扫描本机其他 Agent',
        mcpScanning: '正在扫描…',
        mcpPlatformsTitle: '发现 MCP 的 Agent',
        mcpNoCandidates: '没有在本机其他 Agent 的配置里发现 MCP。可以手动粘贴配置添加。',
        mcpSelected: '已选 {count} 个',
        mcpLink: '引用选中（{count}）',
        mcpLinking: '正在引用…',
        mcpUnlinkSelected: '取消引用选中（{count}）',
        mcpBadgeRef: '引用 · 不复制',
        mcpBadgeLocal: '本库',
        mcpStatus: '连接状态',
        mcpProbe: '测试连接',
        mcpProbing: '正在测试…',
        mcpProbeOk: '{name} 连接成功',
        mcpProbeFail: '{name} 连接失败：{error}',
        mcpNoticeAdded: '已添加 MCP 连接器 {name}',
        mcpNoticeLinked: '已引用 MCP {name}',
        mcpNoticeLinkedMany: '已引用 {count} 个 MCP 连接器',
        mcpEnvKeys: '凭据字段',
        mcpSecretsNote: '扫描结果不会显示任何密钥值，只显示字段名；引用后由 DSH 在连接时从原配置读取。',
        mcpInvalid: '无法引用',
        catalogTitle: '连接器市场',
        catalogIntro: '点「连接」就能用的现成连接器。填一次密钥即可，密钥存进 DSH 凭据库，不会写进技能库文件；移除连接器时会一并删除。也可以接入下面「自定义连接器」或引用本机其他 Agent 已配置的 MCP。',
        catalogSearch: '搜索连接器',
        catalogAll: '全部',
        catalogConnect: '连接',
        catalogConnected: '已连接',
        catalogEnabled: '运行中',
        catalogDisabled: '已停用',
        catalogReconfigure: '重新填写密钥',
        catalogInstallBusy: '正在连接…',
        catalogNeedFields: '请先填写：{fields}',
        catalogCredentialMissing: '当前 profile 没有凭据服务，密钥无法安全保存。请在 DSH 设置里启用凭据，或改用「自定义连接器」手动填写。',
        catalogNoticeInstalled: '已连接 {name}',
        catalogNoMatch: '没有匹配的连接器。',
        catalogDocs: '文档',
        catalogSecretNote: '密钥只写入 DSH 凭据库；连接器条目里保存的是引用名。',
        catalogCategoryEfficiency: '效率办公',
        catalogCategoryDeveloper: '开发工具',
        catalogCategorySearch: '搜索地图',
        catalogCategoryData: '数据与文件',
        catalogCategoryChina: '国内服务',
        catalogCategoryDemo: '示例调试',
        mcpCustomTitle: '自定义 MCP 连接器',
        errorPrefix: '操作失败：',
        hostReloadHint: '（若仍看到旧错误，请重启一次 DeepSeek Harness，让新的批量引用逻辑生效）',
      },
      en: {
        nav: 'Skill Store',
        title: 'Skill Store',
        intro: 'Install third-party skills and MCP servers into an isolated store, then enable or disable them live. npm, GitHub, SkillHub and .zip are supported, and skills already installed by other agents can be migrated in one click.',
        storeDir: 'Store',
        installedCount: 'Installed',
        enabledCount: 'Enabled',
        externalCount: 'In queue',
        skillsCount: 'Skills',
        mcpCount: 'MCP servers',
        statsHint: '“Installed / Enabled” count only copied skills; skills referenced from other agents go to the “Reference queue” and wait on standby for on-demand use.',
        capSkills: 'Skills service',
        capMcp: 'MCP service',
        capOn: 'available',
        capOff: 'unavailable',
        tabInstalled: 'Installed',
        tabQueue: 'Reference queue',
        tabStore: 'SkillHub',
        tabDirect: 'Reference other agents',
        tabImport: 'Import from agents',
        tabChat: 'Install by chat',
        installTitle: 'Install a skill',
        installPlaceholder: 'npm name / GitHub URL / skillhub:<slug> / .zip path',
        installHint: 'e.g. skillhub:find-skill-skillhub, https://github.com/owner/repo, @scope/pkg@1.2.3, C:\\path\\skill.zip',
        install: 'Install',
        installing: 'Installing…',
        installWarnings: 'Installed, with warnings:',
        emptyInstalled: 'Nothing installed yet. Paste a source above to begin.',
        emptyQueue: 'The reference queue is empty. Tick skills under “Reference other agents” to put them on standby.',
        noDescription: 'No description',
        sourceNpm: 'npm',
        sourceGit: 'Git',
        sourceSkillhub: 'SkillHub',
        sourceArchive: 'Archive',
        sourceLocal: 'Local',
        enabled: 'Enabled',
        disabled: 'Disabled',
        enable: 'Enable',
        disable: 'Disable',
        repair: 'Repair deps',
        repairing: 'Repairing…',
        log: 'Log',
        remove: 'Remove',
        unlink: 'Drop reference',
        confirmRemove: 'Confirm remove',
        directUse: 'Reference',
        directIntro: 'Read the skills other agents installed on this computer. Tick the skills you want, then click “Reference selected” to submit them in one go — ticking is only a selection and sends no request. Nothing is copied and the original folder is untouched; updates made by that agent apply immediately. Referenced skills are recognized and called per task automatically.',
        scanningPlatforms: 'Detecting agent platforms on this computer…',
        platformsTitle: 'Detected platforms',
        noPlatforms: 'No agent skill folder was found. Try “Scan again”.',
        platformCount: '{count} skills',
        noSkillsInPlatform: 'No skills found in this platform',
        selectAllPlatforms: 'Select all',
        clearAllPlatforms: 'Clear',
        expand: 'Expand',
        collapse: 'Collapse',
        selectedCount: '{count} selected',
        queueTitle: 'Reference queue',
        queueCount: '{count} on standby',
        queueEmpty: 'No skills referenced yet; tick one to put it on standby for on-demand use.',
        useSelected: 'Reference selected ({count})',
        unuseSelected: 'Unreference selected ({count})',
        selectAll: 'Select all',
        clearAll: 'Clear',
        directUsing: 'Referencing…',
        directUseHint: 'A batch skips invalid folders (missing SKILL.md, parse errors, name conflicts) and registers the rest; referencing installs nothing and touches no files. Referenced skills are called per task automatically.',
        linkedBadge: 'Referenced',
        externalBadge: 'External · not copied',
        copiedBadge: 'Copied',
        noticeLinked: 'Referenced {name}',
        noticeUnlinked: 'Dropped reference to {name}',
        noticeLinkedMany: 'Referenced {count} skills',
        noticeUnlinkedMany: 'Dropped {count} references',
        batchTooLarge: 'Linking all selected skills at once; this may take a moment.',
        cancel: 'Cancel',
        close: 'Close',
        skillsLabel: 'Skills',
        mcpLabel: 'MCP',
        versionLabel: 'Version',
        installedAt: 'Installed',
        searchTitle: 'SkillHub',
        searchPlaceholder: 'Search skills, e.g. PDF, data analysis, video',
        search: 'Search',
        searching: 'Searching…',
        searchEmpty: 'No matching skills. Try another keyword.',
        searchHint: 'Public catalogue from skillhub.cn; installing downloads the official ZIP.',
        downloads: 'downloads',
        publisher: 'Publisher',
        verified: 'verified',
        needsKey: 'needs API key',
        importTitle: 'Import from other agents',
        importHint: 'Scan skills installed by Claude Code, Codex, Cursor, Windsurf, Gemini and others, then copy one into this store. The original folder is never modified.',
        scan: 'Scan again',
        scanning: 'Scanning…',
        import: 'Import',
        importing: 'Importing…',
        importEmpty: 'No skills found in other agents.',
        alreadyInstalled: 'already here',
        refresh: 'Refresh',
        noticeInstalled: 'Installed {name}',
        noticeRemoved: 'Removed {name}',
        noticeEnabled: 'Enabled {name}',
        noticeDisabled: 'Disabled {name}',
        noticeImported: 'Imported {name}',
        noticeRepaired: 'Dependencies repaired: {name}',
        noticeRefreshed: 'Registrations refreshed',
        chatIntro: 'Describe what you want to install in one sentence. I search SkillHub and show matching skills with descriptions. Install one, or reply “install 2”.',
        chatWelcome: 'Hi. Tell me what the skill should do — for example “make PPT”, “extract PDF text”, or “analyze data”. I will list matching skills for you to pick.',
        chatPlaceholder: 'e.g. install a skill that makes PPT',
        chatSend: 'Send',
        chatSearching: 'Searching…',
        chatFound: 'Found {count} skills matching “{query}”:',
        chatNoResult: 'No ready-made skill matched. Copy the request below and give it to the main DSH assistant to build one.',
        chatCopyPrompt: 'Copy request',
        chatCopied: 'Copied to clipboard',
        chatInstall: 'Install',
        chatInstalling: 'Installing…',
        chatInstalled: 'Installed {name}.',
        chatPromptPrefix: 'Please build a DSH Skill for me: ',
        chatExamples: 'Try: PPT, PDF extraction, data analysis, video editing',
        chatNeedResult: 'Search first, then reply with a number such as “install 2”.',
        logTitle: 'Install log · {name}',
        logEmpty: 'This skill has no log.',
        warningsTitle: 'Registration warnings',
        permissionHint: 'Installing a third-party skill means running its dependency installer on this machine. Only install sources you trust.',
        allowScripts: 'Allow dependency install scripts',
        tabMcp: 'MCP connectors',
        mcpIntro: 'Manage MCP connectors like skills: paste a config to add one, or scan the MCP servers other agents on this computer already configured (Claude, Cursor, Codex, Gemini…) and reference them. A reference stores only the location — no secret is copied — and follows changes made by that agent.',
        mcpEmpty: 'No MCP connector yet. Scan the other agents on this computer, or paste a config below.',
        mcpAddTitle: 'Add an MCP connector',
        mcpAddPlaceholder: '{ "mcpServers": { "github": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"], "env": { "GITHUB_TOKEN": "${credential:GITHUB_TOKEN}" } } } }',
        mcpAddHint: 'Accepts {"mcpServers": {...}}, {"servers": {...}} (VS Code) or a single named server object. Keep secrets in DSH credentials with ${credential:NAME}.',
        mcpAdd: 'Add connector',
        mcpAddBusy: 'Adding…',
        mcpScan: 'Scan other agents',
        mcpScanning: 'Scanning…',
        mcpPlatformsTitle: 'Agents with MCP config',
        mcpNoCandidates: 'No MCP server was found in other agents\u2019 configs. Paste a config to add one manually.',
        mcpSelected: '{count} selected',
        mcpLink: 'Reference selected ({count})',
        mcpLinking: 'Referencing…',
        mcpUnlinkSelected: 'Unreference selected ({count})',
        mcpBadgeRef: 'Referenced · not copied',
        mcpBadgeLocal: 'Local',
        mcpStatus: 'Connection',
        mcpProbe: 'Test connection',
        mcpProbing: 'Testing…',
        mcpProbeOk: '{name} connected',
        mcpProbeFail: '{name} failed: {error}',
        mcpNoticeAdded: 'Added MCP connector {name}',
        mcpNoticeLinked: 'Referenced MCP {name}',
        mcpNoticeLinkedMany: 'Referenced {count} MCP connectors',
        mcpEnvKeys: 'Credential fields',
        mcpSecretsNote: 'Scan results never show a secret value — only the field names. Once referenced, DSH reads the values from the original config when connecting.',
        mcpInvalid: 'unsupported',
        catalogTitle: 'Connector marketplace',
        catalogIntro: 'Ready-made connectors that work with one click. Enter a key once: it is stored in DSH credentials, never in the store files, and removed together with the connector. Custom connectors and MCP servers already configured by other agents are available below.',
        catalogSearch: 'Search connectors',
        catalogAll: 'All',
        catalogConnect: 'Connect',
        catalogConnected: 'Connected',
        catalogEnabled: 'live',
        catalogDisabled: 'disabled',
        catalogReconfigure: 'Update key',
        catalogInstallBusy: 'Connecting…',
        catalogNeedFields: 'Fill in first: {fields}',
        catalogCredentialMissing: 'This profile has no credentials provider, so a key cannot be stored safely. Enable credentials in DSH settings, or use a custom connector.',
        catalogNoticeInstalled: 'Connected {name}',
        catalogNoMatch: 'No connector matches.',
        catalogDocs: 'Docs',
        catalogSecretNote: 'Keys go to DSH credentials only; the connector entry stores a reference name.',
        catalogCategoryEfficiency: 'Work',
        catalogCategoryDeveloper: 'Developer',
        catalogCategorySearch: 'Search & maps',
        catalogCategoryData: 'Data & files',
        catalogCategoryChina: 'China services',
        catalogCategoryDemo: 'Examples',
        mcpCustomTitle: 'Custom MCP connector',
        errorPrefix: 'Action failed: ',
        hostReloadHint: ' (If the old error persists, restart DeepSeek Harness once so the new batch logic loads.)',
      },
    } as const

    type Copy = { [K in keyof typeof COPY.zh]: string }
    function copyFor(lang: 'zh' | 'en'): Copy {
      return COPY[lang]
    }
    function fill(template: string, values: Record<string, string>): string {
      return template.replace(/\{(\w+)\}/g, (_match, key: string) => values[key] ?? '')
    }

    // ----------------------------------------------------------------- types --
    interface EntryView {
      id: string
      name: string
      version: string
      description: string
      enabled: boolean
      installedAt: string
      updatedAt: string
      source: { kind: string; value: string }
      origin?: 'store' | 'external'
      externalPath?: string
      kind?: 'skill' | 'mcp'
      skills: Array<{ name: string; description: string }>
      mcpServers: Array<{ name: string; transport: string; summary?: string; envKeys?: string[] }>
      mcpRefs?: Array<{ name: string; agent: string; agentLabel: string; file: string; scope?: string }>
      dependencies: { node: boolean; python: boolean }
      provenance?: { agent?: string; origin?: string }
    }
    interface StatusView {
      ok: boolean
      version: string
      store: { dir: string; count: number; enabled: number; external: number; skills: number; mcpServers: number; mcp?: number; revision: number }
      capabilities: { skills: boolean; mcp: boolean; probe?: boolean }
      warnings: string[]
    }
    interface McpCandidate {
      key: string
      name: string
      agent: string
      agentLabel: string
      file: string
      scope?: string
      transport: string
      summary: string
      envKeys: string[]
      linked: boolean
      linkedId?: string
      invalid?: boolean
      invalidReason?: string
    }
    interface McpServerRow {
      registeredAs: string
      entryId: string
      entryName: string
      server: string
      status: string
      configured: boolean
    }
    interface CatalogField {
      key: string
      label: string
      hint?: string
      placeholder?: string
      secret?: boolean
      required?: boolean
    }
    interface CatalogItem {
      id: string
      name: string
      vendor: string
      category: 'efficiency' | 'developer' | 'search' | 'data' | 'china' | 'demo'
      description: string
      icon: string
      docs: string
      transport: string
      url?: string
      fields: CatalogField[]
      credentialRefs: string[]
      installed: boolean
      entryId?: string
      enabled?: boolean
      credentialReady: boolean
    }
    interface SearchItem {
      slug: string
      name: string
      description: string
      version: string
      downloads: number
      stars: number
      publisher: string
      verified: boolean
      requiresApiKey: boolean
    }
    interface Platform {
      agent: string
      label: string
      path: string
      count: number
    }
    interface Candidate {
      path: string
      folder: string
      name: string
      description: string
      agent: string
      agentLabel: string
      installed: boolean
      linked: boolean
      linkedId?: string
    }

    /** Call one Host route; throws with the Host's message. */
    async function api(path: string, init?: { method?: string; body?: unknown }): Promise<Record<string, unknown>> {
      const response = await fetch(ROUTE + path, {
        method: init?.method ?? 'GET',
        headers: {
          accept: 'application/json',
          ...(init?.body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      })
      let data: Record<string, unknown> | undefined
      try {
        data = await response.json() as Record<string, unknown>
      } catch {
        data = undefined
      }
      if (!response.ok || data === undefined) {
        const message = data !== undefined && typeof data.error === 'string' ? data.error : `HTTP ${String(response.status)}`
        throw new Error(message)
      }
      return data
    }

    // ---------------------------------------------------------------- styles --
    const S = {
      section: { display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '880px', color: 'var(--dsw-alias-label-primary)' },
      title: { margin: 0, fontSize: '16px', lineHeight: '24px', fontWeight: 600 },
      intro: { margin: 0, fontSize: '14px', lineHeight: '22px', color: 'var(--dsw-alias-label-tertiary)' },
      row: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' as const },
      card: {
        border: '0.5px solid var(--dsw-alias-settings-card-stroke)',
        background: 'var(--dsw-alias-settings-card-fill)',
        borderRadius: 'var(--dsw-radius-lg)',
        padding: '14px',
        display: 'flex',
        flexDirection: 'column' as const,
        gap: '8px',
      },
      stat: { display: 'flex', flexDirection: 'column' as const, gap: '2px', minWidth: '84px' },
      statValue: { fontSize: '20px', lineHeight: '26px', fontWeight: 600 },
      statLabel: { fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)' },
      dim: { margin: 0, fontSize: '13px', lineHeight: '20px', color: 'var(--dsw-alias-label-tertiary)' },
      mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '12px', color: 'var(--dsw-alias-label-secondary)', wordBreak: 'break-all' as const },
      input: {
        width: '100%',
        boxSizing: 'border-box' as const,
        padding: '8px 10px',
        fontSize: '13px',
        color: 'var(--dsw-alias-label-primary)',
        background: 'var(--dsw-alias-bg-layer-1)',
        border: '0.5px solid var(--dsw-alias-border-l3)',
        borderRadius: 'var(--dsw-radius-md)',
        outline: 'none',
      },
      button: (primary: boolean, disabled: boolean) => ({
        padding: '6px 12px',
        fontSize: '13px',
        lineHeight: '18px',
        borderRadius: 'var(--dsw-radius-md)',
        border: primary ? 'none' : '0.5px solid var(--dsw-alias-border-l3)',
        background: primary ? 'var(--dsw-alias-button-primary-fill)' : 'transparent',
        color: primary ? 'var(--dsw-alias-label-primary-foreground)' : 'var(--dsw-alias-label-secondary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
      }),
      tabs: { display: 'flex', gap: '6px', borderBottom: '0.5px solid var(--dsw-alias-border-l3)', paddingBottom: '6px' },
      tab: (active: boolean) => ({
        padding: '6px 10px',
        fontSize: '13px',
        borderRadius: 'var(--dsw-radius-sm)',
        border: 'none',
        background: active ? 'var(--dsw-alias-bg-module-platform)' : 'transparent',
        color: active ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-tertiary)',
        cursor: 'pointer',
      }),
      badge: (tone: 'ok' | 'warn' | 'muted' | 'error') => ({
        display: 'inline-flex',
        alignItems: 'center',
        padding: '1px 8px',
        fontSize: '11px',
        lineHeight: '18px',
        borderRadius: 'var(--dsw-radius-sm)',
        background: 'var(--dsw-alias-bg-module-platform)',
        color: tone === 'ok'
          ? 'var(--dsw-alias-state-success-primary)'
          : tone === 'warn'
            ? 'var(--dsw-alias-state-warn-label)'
            : tone === 'error'
              ? 'var(--dsw-alias-state-error-primary)'
              : 'var(--dsw-alias-label-tertiary)',
        border: '0.5px solid var(--dsw-alias-border-l3)',
      }),
      notice: (tone: 'ok' | 'error') => ({
        margin: 0,
        padding: '8px 10px',
        fontSize: '13px',
        lineHeight: '20px',
        borderRadius: 'var(--dsw-radius-md)',
        color: tone === 'ok' ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-state-error-primary)',
        background: 'var(--dsw-alias-bg-module-platform)',
        border: '0.5px solid var(--dsw-alias-border-l3)',
      }),
      grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px' },
      meta: { fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)' },
      pre: {
        margin: 0,
        padding: '10px',
        maxHeight: '240px',
        overflow: 'auto',
        fontSize: '12px',
        lineHeight: '18px',
        whiteSpace: 'pre-wrap' as const,
        wordBreak: 'break-all' as const,
        background: 'var(--dsw-alias-bg-layer-1)',
        border: '0.5px solid var(--dsw-alias-border-l3)',
        borderRadius: 'var(--dsw-radius-md)',
        color: 'var(--dsw-alias-label-secondary)',
      },
      switch: (on: boolean) => ({
        width: '34px',
        height: '20px',
        padding: 0,
        borderRadius: '999px',
        border: 'none',
        cursor: 'pointer',
        background: on ? 'var(--dsw-alias-button-primary-fill)' : 'var(--dsw-alias-border-l3)',
        position: 'relative' as const,
      }),
      knob: (on: boolean) => ({
        position: 'absolute' as const,
        top: '2px',
        left: on ? '16px' : '2px',
        width: '16px',
        height: '16px',
        borderRadius: '999px',
        background: 'var(--dsw-alias-label-primary-foreground)',
        transition: 'left 120ms ease',
      }),
    }

    function sourceLabel(kind: string, copy: Copy): string {
      if (kind === 'npm') return copy.sourceNpm
      if (kind === 'git') return copy.sourceGit
      if (kind === 'skillhub') return copy.sourceSkillhub
      if (kind === 'archive') return copy.sourceArchive
      return copy.sourceLocal
    }

    function formatDate(value: string): string {
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return value
      return date.toLocaleString()
    }

    function basenameLike(path: string): string {
      const parts = String(path).split(/[\\/]/).filter(Boolean)
      return parts[parts.length - 1] ?? path
    }

    interface ChatMessage {
      role: 'user' | 'assistant'
      text: string
      items?: SearchItem[]
      prompt?: string
    }

    /** Strip common Chinese/English command fillers before a catalogue search. */
    function searchKeywords(text: string): string {
      const cleaned = text
        .toLowerCase()
        .replace(/[，。！？、,.!?;:；：'"“”‘’()（）[\]【】]/g, ' ')
        .replace(/(帮我|请|麻烦|我想|我要|想要|能不能|可不可以|可以|安装|装上|装个|装一下|一个|技能|skill|的|吧|吗|呢|谢谢|找|搜索|搜一下|有没有|推荐|适合|用来|做|制作|相关|那种|选项)/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      return cleaned.length > 0 ? cleaned : text.trim()
    }

    function ChatPanel(props: {
      copy: Copy
      messages: ChatMessage[]
      input: string
      setInput: (value: string) => void
      busy: boolean
      installing: string
      onSend: () => void
      onInstall: (item: SearchItem) => void
      onCopy: (prompt: string) => void
      onExample: (text: string) => void
    }): unknown {
      const { copy } = props
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
        h('p', { style: S.dim }, copy.chatIntro),
        h('div', {
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            maxHeight: '360px',
            overflowY: 'auto',
            padding: '10px',
            background: 'var(--dsw-alias-bg-layer-1)',
            border: '0.5px solid var(--dsw-alias-border-l3)',
            borderRadius: 'var(--dsw-radius-lg)',
          },
        },
          props.messages.map((message, index) => h('div', {
            key: String(index),
            style: {
              alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '92%',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            },
          },
            h('div', {
              style: {
                padding: '8px 10px',
                borderRadius: 'var(--dsw-radius-md)',
                fontSize: '13px',
                lineHeight: '20px',
                whiteSpace: 'pre-wrap',
                background: message.role === 'user' ? 'var(--dsw-alias-bg-module-platform)' : 'var(--dsw-alias-settings-card-fill)',
                border: '0.5px solid var(--dsw-alias-settings-card-stroke)',
                color: message.role === 'user' ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)',
              },
            }, message.text),
            message.prompt === undefined ? null : h('div', { style: S.card },
              h('span', { style: S.mono }, message.prompt),
              h('div', { style: S.row },
                h('span', { style: { flex: 1 } }),
                h('button', { type: 'button', style: S.button(false, false), onClick: () => props.onCopy(message.prompt as string) }, copy.chatCopyPrompt),
              ),
            ),
            message.items === undefined ? null : h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
              message.items.map(item => h('div', { key: item.slug, style: S.card },
                h('div', { style: S.row },
                  h('span', { style: { fontSize: '13px', fontWeight: 600 } }, item.name),
                  item.verified ? h(Badge, { tone: 'ok' }, copy.verified) : null,
                  item.requiresApiKey ? h(Badge, { tone: 'warn' }, copy.needsKey) : null,
                  h('span', { style: { flex: 1 } }),
                  h('span', { style: S.meta }, `v${item.version || '—'}`),
                ),
                h('p', { style: { ...S.dim, margin: 0 } }, item.description),
                h('div', { style: S.row },
                  h('span', { style: S.meta }, `${copy.publisher}: ${item.publisher || '—'} · ${copy.downloads} ${item.downloads.toLocaleString()}`),
                  h('span', { style: { flex: 1 } }),
                  h('button', {
                    type: 'button',
                    style: S.button(true, props.installing === item.slug),
                    disabled: props.installing === item.slug,
                    onClick: () => props.onInstall(item),
                  }, props.installing === item.slug ? copy.chatInstalling : copy.chatInstall),
                ),
              )),
            ),
          )),
        ),
        h('div', { style: S.row },
          h('input', {
            style: { ...S.input, flex: 1 },
            value: props.input,
            placeholder: copy.chatPlaceholder,
            'aria-label': copy.chatPlaceholder,
            onChange: (event: { target: { value: string } }) => props.setInput(event.target.value),
            onKeyDown: (event: { key: string }) => { if (event.key === 'Enter') props.onSend() },
          }),
          h('button', {
            type: 'button',
            style: S.button(true, props.busy || props.input.trim().length === 0),
            disabled: props.busy || props.input.trim().length === 0,
            onClick: props.onSend,
          }, props.busy ? copy.chatSearching : copy.chatSend),
        ),
        h('div', { style: S.row },
          ['PPT 制作', 'PDF 文字提取', '数据分析', '视频剪辑'].map(example =>
            h('button', {
              key: example,
              type: 'button',
              style: S.button(false, false),
              onClick: () => props.onExample(example),
            }, example)),
        ),
        h('p', { style: S.dim }, copy.chatExamples),
      )
    }

    // ----------------------------------------------------------- components --
    function Badge(props: { children: unknown; tone?: 'ok' | 'warn' | 'muted' | 'error' }): unknown {
      return h('span', { style: S.badge(props.tone ?? 'muted') }, props.children)
    }

    function Notice(props: { text: string; tone: 'ok' | 'error' }): unknown {
      if (props.text.length === 0) return null
      return h('p', { style: S.notice(props.tone), role: 'status' }, props.text)
    }

    function InstalledPanel(props: {
      copy: Copy
      entries: EntryView[]
      busy: string
      emptyText?: string
      onToggle: (entry: EntryView) => void
      onRemove: (entry: EntryView) => void
      onRepair: (entry: EntryView) => void
      onLog: (entry: EntryView) => void
    }): unknown {
      const { copy, entries } = props
      if (entries.length === 0) return h('p', { style: S.dim }, props.emptyText ?? copy.emptyInstalled)
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
        entries.map(entry => h('div', { key: entry.id, style: S.card },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } },
            h('span', { style: { fontSize: '14px', fontWeight: 600 } }, entry.name),
            h(Badge, { tone: entry.enabled ? 'ok' : 'muted' }, entry.enabled ? copy.enabled : copy.disabled),
            h(Badge, { tone: entry.origin === 'external' ? 'warn' : 'muted' },
              entry.origin === 'external' ? copy.externalBadge : sourceLabel(entry.source.kind, copy)),
            h('span', { style: S.meta }, `${copy.versionLabel} ${entry.version}`),
            h('span', { style: { flex: 1 } }),
            h('button', {
              type: 'button',
              style: S.switch(entry.enabled),
              title: entry.enabled ? copy.disable : copy.enable,
              'aria-label': entry.enabled ? copy.disable : copy.enable,
              disabled: props.busy === entry.id,
              onClick: () => props.onToggle(entry),
            }, h('span', { style: S.knob(entry.enabled) })),
          ),
          h('p', { style: { margin: 0, fontSize: '13px', lineHeight: '20px', color: 'var(--dsw-alias-label-secondary)' } },
            entry.description.length > 0 ? entry.description : copy.noDescription),
          h('div', { style: S.row },
            h('span', { style: S.meta }, `${copy.skillsLabel}: ${entry.skills.map(skill => skill.name).join(', ') || '—'}`),
            entry.mcpServers.length > 0
              ? h('span', { style: S.meta }, `${copy.mcpLabel}: ${entry.mcpServers.map(server => server.name).join(', ')}`)
              : null,
            entry.dependencies.node || entry.dependencies.python
              ? h(Badge, { tone: 'warn' }, [entry.dependencies.node ? 'node' : '', entry.dependencies.python ? 'python' : ''].filter(Boolean).join(' + '))
              : null,
          ),
          h('div', { style: { ...S.row, marginTop: '2px' } },
            entry.origin === 'external'
              ? null
              : h('button', { type: 'button', style: S.button(false, props.busy === entry.id), onClick: () => props.onRepair(entry) },
                props.busy === entry.id ? copy.repairing : copy.repair),
            h('button', { type: 'button', style: S.button(false, false), onClick: () => props.onLog(entry) }, copy.log),
            h('span', { style: { flex: 1 } }),
            h('button', { type: 'button', style: S.button(false, props.busy === entry.id), onClick: () => props.onRemove(entry) },
              props.busy === entry.id ? copy.confirmRemove : (entry.origin === 'external' ? copy.unlink : copy.remove)),
            h('span', { style: S.meta }, `${copy.installedAt} ${formatDate(entry.installedAt)}`),
          ),
          entry.externalPath !== undefined
            ? h('p', { style: S.mono }, `↗ ${entry.externalPath}`)
            : null,
          entry.provenance?.agent !== undefined
            ? h('p', { style: S.meta }, `← ${entry.provenance.agent}`)
            : null,
        )),
      )
    }

    function SearchPanel(props: {
      copy: Copy
      query: string
      setQuery: (value: string) => void
      results: SearchItem[]
      busy: boolean
      onSearch: () => void
      onInstall: (item: SearchItem) => void
      installBusy: string
      searched: boolean
    }): unknown {
      const { copy } = props
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
        h('p', { style: S.dim }, copy.searchHint),
        h('div', { style: S.row },
          h('input', {
            style: { ...S.input, flex: 1 },
            type: 'search',
            value: props.query,
            placeholder: copy.searchPlaceholder,
            'aria-label': copy.searchPlaceholder,
            onChange: (event: { target: { value: string } }) => props.setQuery(event.target.value),
            onKeyDown: (event: { key: string }) => { if (event.key === 'Enter') props.onSearch() },
          }),
          h('button', { type: 'button', style: S.button(true, props.busy), disabled: props.busy, onClick: props.onSearch },
            props.busy ? copy.searching : copy.search),
        ),
        props.searched && props.results.length === 0 && !props.busy ? h('p', { style: S.dim }, copy.searchEmpty) : null,
        h('div', { style: S.grid },
          props.results.map(item => h('div', { key: item.slug, style: S.card },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' } },
              h('span', { style: { fontSize: '14px', fontWeight: 600 } }, item.name),
              item.verified ? h(Badge, { tone: 'ok' }, copy.verified) : null,
              item.requiresApiKey ? h(Badge, { tone: 'warn' }, copy.needsKey) : null,
            ),
            h('p', { style: { ...S.dim, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' } }, item.description),
            h('div', { style: S.meta }, `${copy.publisher}: ${item.publisher || '—'} · ${copy.downloads} ${item.downloads.toLocaleString()}`),
            h('div', { style: S.row },
              h('span', { style: S.meta }, `v${item.version || '—'}`),
              h('span', { style: { flex: 1 } }),
              h('button', {
                type: 'button',
                style: S.button(true, props.installBusy === item.slug),
                disabled: props.installBusy === item.slug,
                onClick: () => props.onInstall(item),
              }, props.installBusy === item.slug ? copy.installing : copy.install),
            ),
          )),
        ),
      )
    }

    function ImportPanel(props: {
      copy: Copy
      candidates: Candidate[]
      busy: boolean
      imported: string
      onScan: () => void
      onImport: (candidate: Candidate) => void
    }): unknown {
      const { copy } = props
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
        h('p', { style: S.dim }, copy.importHint),
        h('div', { style: S.row },
          h('button', { type: 'button', style: S.button(true, props.busy), disabled: props.busy, onClick: props.onScan },
            props.busy ? copy.scanning : copy.scan),
        ),
        props.candidates.length === 0 && !props.busy ? h('p', { style: S.dim }, copy.importEmpty) : null,
        h('div', { style: S.grid },
          props.candidates.map(candidate => h('div', { key: candidate.path, style: S.card },
            h('div', { style: S.row },
              h('span', { style: { fontSize: '14px', fontWeight: 600 } }, candidate.name),
              h(Badge, null, candidate.agentLabel),
              candidate.linked
                ? h(Badge, { tone: 'warn' }, copy.linkedBadge)
                : candidate.installed
                  ? h(Badge, { tone: 'ok' }, copy.copiedBadge)
                  : null,
            ),
            h('p', { style: { ...S.dim, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' } },
              candidate.description.length > 0 ? candidate.description : copy.noDescription),
            h('p', { style: S.mono }, candidate.path),
            h('div', { style: S.row },
              h('span', { style: { flex: 1 } }),
              h('button', {
                type: 'button',
                style: S.button(true, props.imported === candidate.path || candidate.installed || candidate.linked),
                disabled: props.imported === candidate.path || candidate.installed || candidate.linked,
                onClick: () => props.onImport(candidate),
              }, props.imported === candidate.path ? copy.importing : copy.import),
            ),
          )),
        ),
      )
    }

    /**
     * Selection is local and never fires a request: tick skills, then click
     * 「引用选中」to commit them in one tolerant batch. This keeps selection
     * usable even when an individual package is broken.
     */
    function DirectPanel(props: {
      copy: Copy
      candidates: Candidate[]
      platforms: Platform[]
      busy: boolean
      directBusy: string
      selected: string[]
      onScan: () => void
      onToggle: (path: string) => void
      onSelectGroup: (rows: Candidate[], select: boolean) => void
      onSelectAll: (select: boolean) => void
      onUse: (paths: string[]) => void
      onUnuse: (ids: string[]) => void
    }): unknown {
      const { copy } = props
      const [expanded, setExpanded] = useState<string[]>([])
      const groups = new Map<string, Candidate[]>()
      for (const platform of props.platforms) groups.set(platform.label, [])
      for (const candidate of props.candidates) {
        const list = groups.get(candidate.agentLabel) ?? []
        list.push(candidate)
        groups.set(candidate.agentLabel, list)
      }
      const selectedCandidates = props.candidates.filter(candidate => props.selected.includes(candidate.path))
      const usableSelected = selectedCandidates.filter(candidate => !candidate.linked && !candidate.installed)
      const linkedSelected = selectedCandidates.filter(candidate => candidate.linked && candidate.linkedId !== undefined)
      const linkedCandidates = props.candidates.filter(candidate => candidate.linked && candidate.linkedId !== undefined)
      const allSelectable = props.candidates.filter(candidate => !candidate.installed || candidate.linked)
      const batchBusy = props.directBusy === 'batch'
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
        h('p', { style: S.dim }, copy.directIntro),
        props.busy ? h('p', { style: S.dim }, copy.scanningPlatforms) : null,
        h('div', { style: S.row },
          h('button', { type: 'button', style: S.button(false, props.busy), disabled: props.busy, onClick: props.onScan },
            props.busy ? copy.scanning : copy.scan),
          h('span', { style: S.meta }, `${copy.platformsTitle}: ${props.platforms.length}`),
          h('span', { style: S.meta }, fill(copy.selectedCount, { count: String(selectedCandidates.length) })),
          h('button', {
            type: 'button',
            style: S.button(false, allSelectable.length === 0),
            disabled: allSelectable.length === 0,
            onClick: () => props.onSelectAll(true),
          }, copy.selectAllPlatforms),
          h('button', {
            type: 'button',
            style: S.button(false, props.selected.length === 0),
            disabled: props.selected.length === 0,
            onClick: () => props.onSelectAll(false),
          }, copy.clearAllPlatforms),
          h('button', {
            type: 'button',
            style: S.button(true, batchBusy || usableSelected.length === 0),
            disabled: batchBusy || usableSelected.length === 0,
            onClick: () => props.onUse(usableSelected.map(candidate => candidate.path)),
          }, batchBusy ? copy.directUsing : fill(copy.useSelected, { count: String(usableSelected.length) })),
          h('button', {
            type: 'button',
            style: S.button(false, batchBusy || linkedSelected.length === 0),
            disabled: batchBusy || linkedSelected.length === 0,
            onClick: () => props.onUnuse(linkedSelected.map(candidate => candidate.linkedId as string)),
          }, fill(copy.unuseSelected, { count: String(linkedSelected.length) })),
        ),
        props.platforms.length > 0
          ? h('div', { style: S.row },
            h('span', { style: S.meta }, copy.platformsTitle),
            ...props.platforms.map(platform => h(Badge, {
              key: platform.agent,
              tone: platform.count > 0 ? 'ok' : 'muted',
            }, `${platform.label} · ${platform.count}`)))
          : (props.busy ? null : h('p', { style: S.dim }, copy.noPlatforms)),
        h('p', { style: S.dim }, copy.directUseHint),
        linkedCandidates.length === 0
          ? h('p', { style: S.dim }, copy.queueEmpty)
          : h('div', { style: S.card },
            h('div', { style: S.row },
              h('span', { style: { fontSize: '13px', fontWeight: 600 } }, copy.queueTitle),
              h('span', { style: S.meta }, fill(copy.queueCount, { count: String(linkedCandidates.length) })),
              h('span', { style: { flex: 1 } }),
              h('button', {
                type: 'button',
                style: S.button(false, batchBusy),
                disabled: batchBusy,
                onClick: () => props.onUnuse(linkedCandidates.map(candidate => candidate.linkedId as string)),
              }, copy.clearAllPlatforms),
            ),
            h('div', { style: { ...S.row, flexWrap: 'wrap' } },
              ...linkedCandidates.slice(0, 24).map(candidate => h(Badge, { key: candidate.path, tone: 'ok' }, candidate.name)),
              linkedCandidates.length > 24 ? h('span', { style: S.meta }, `… +${String(linkedCandidates.length - 24)}`) : null,
            ),
          ),
        props.candidates.length === 0 && !props.busy ? h('p', { style: S.dim }, copy.importEmpty) : null,
        [...groups.entries()].map(([label, rows]) => {
          const selectable = rows.filter(candidate => !candidate.installed || candidate.linked)
          const allSelected = selectable.length > 0 && selectable.every(candidate => props.selected.includes(candidate.path))
          const open = expanded.includes(label)
          return h('div', { key: label, style: S.card },
            h('div', { style: S.row },
              h('span', { style: { fontSize: '13px', fontWeight: 600 } }, label),
              h(Badge, { tone: rows.length > 0 ? 'ok' : 'muted' }, String(rows.length)),
              h('span', { style: { flex: 1 } }),
              h('button', {
                type: 'button',
                style: S.button(false, batchBusy || selectable.length === 0),
                disabled: batchBusy || selectable.length === 0,
                onClick: () => props.onSelectGroup(selectable, !allSelected),
              }, allSelected ? copy.clearAll : copy.selectAll),
              h('button', {
                type: 'button',
                style: S.button(false, rows.length === 0),
                disabled: rows.length === 0,
                onClick: () => setExpanded(previous => previous.includes(label)
                  ? previous.filter(item => item !== label)
                  : [...previous, label]),
              }, open ? copy.collapse : `${copy.expand} (${String(rows.length)})`),
            ),
            open && rows.length === 0 ? h('p', { style: S.dim }, copy.noSkillsInPlatform) : null,
            open ? rows.map(candidate => {
              const copied = candidate.installed && !candidate.linked
              return h('div', { key: candidate.path, style: { ...S.row, alignItems: 'flex-start', padding: '6px 0', borderTop: '0.5px solid var(--dsw-alias-border-l3)' } },
                h('input', {
                  type: 'checkbox',
                  checked: props.selected.includes(candidate.path),
                  disabled: copied || batchBusy,
                  'aria-label': candidate.name,
                  onChange: () => props.onToggle(candidate.path),
                }),
                h('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: 0 } },
                  h('div', { style: S.row },
                    h('span', { style: { fontSize: '13px', fontWeight: 600 } }, candidate.name),
                    candidate.linked ? h(Badge, { tone: 'ok' }, copy.linkedBadge) : null,
                    !candidate.linked && candidate.installed ? h(Badge, null, copy.copiedBadge) : null,
                  ),
                  h('span', { style: S.dim }, candidate.description || copy.noDescription),
                  h('span', { style: S.mono }, candidate.path),
                ),
              )
            }) : null,
          )
        }),
      )
    }

    function statusTone(status: string): 'ok' | 'warn' | 'muted' | 'error' {
      if (/connect|ready|running|ok\b/i.test(status)) return 'ok'
      if (/fail|error|crash|closed/i.test(status)) return 'error'
      if (/unavailable|disabled|unknown|stopped/i.test(status)) return 'muted'
      return 'warn'
    }

    /**
     * The connector marketplace: a card per ready-made MCP connector. A card
     * with fields opens a small form; the value goes straight to the Host,
     * which stores it as a DSH credential and installs the connector.
     */
    function MarketPanel(props: {
      copy: Copy
      items: CatalogItem[]
      busy: string
      credentialsAvailable: boolean
      onConnect: (item: CatalogItem, values: Record<string, string>) => Promise<void> | void
      onRefresh: () => void
    }): unknown {
      const { copy } = props
      const [query, setQuery] = useState('')
      const [category, setCategory] = useState<'all' | CatalogItem['category']>('all')
      const [dialog, setDialog] = useState<CatalogItem | undefined>(undefined)
      const [values, setValues] = useState<Record<string, string>>({})
      const [formError, setFormError] = useState('')

      const categories: Array<{ key: 'all' | CatalogItem['category']; label: string }> = [
        { key: 'all', label: copy.catalogAll },
        { key: 'efficiency', label: copy.catalogCategoryEfficiency },
        { key: 'developer', label: copy.catalogCategoryDeveloper },
        { key: 'search', label: copy.catalogCategorySearch },
        { key: 'data', label: copy.catalogCategoryData },
        { key: 'china', label: copy.catalogCategoryChina },
        { key: 'demo', label: copy.catalogCategoryDemo },
      ]
      const needle = query.trim().toLowerCase()
      const visible = props.items.filter((item) => {
        if (category !== 'all' && item.category !== category) return false
        if (needle.length === 0) return true
        return `${item.name} ${item.vendor} ${item.description}`.toLowerCase().includes(needle)
      })

      const openDialog = (item: CatalogItem): void => {
        setFormError('')
        setValues({})
        setDialog(item)
      }
      const submit = (): void => {
        if (dialog === undefined) return
        const missing = dialog.fields.filter(field => field.required === true && (values[field.key] ?? '').trim().length === 0)
        if (missing.length > 0) {
          setFormError(fill(copy.catalogNeedFields, { fields: missing.map(field => field.label).join(' / ') }))
          return
        }
        setFormError('')
        const result = props.onConnect(dialog, values)
        if (result !== undefined) {
          void result.then(() => {
            setDialog(undefined)
            setValues({})
          })
        } else {
          setDialog(undefined)
          setValues({})
        }
      }

      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
        h('div', { style: S.card },
          h('div', { style: S.row },
            h('span', { style: { fontSize: '13px', fontWeight: 600 } }, copy.catalogTitle),
            h(Badge, { tone: 'ok' }, String(props.items.filter(item => !item.installed).length)),
            h('span', { style: { flex: 1 } }),
            h('button', { type: 'button', style: S.button(false, false), onClick: props.onRefresh }, copy.refresh),
          ),
          h('p', { style: { ...S.dim, margin: 0 } }, copy.catalogIntro),
          h('div', { style: { ...S.row, marginTop: '6px' } },
            h('input', {
              style: { ...S.input, flex: 1, minWidth: '200px' },
              value: query,
              placeholder: copy.catalogSearch,
              'aria-label': copy.catalogSearch,
              onChange: (event: { target: { value: string } }) => setQuery(event.target.value),
            }),
          ),
          h('div', { style: { ...S.row, flexWrap: 'wrap' } },
            ...categories.map(entry => h('button', {
              key: entry.key,
              type: 'button',
              style: S.tab(category === entry.key),
              onClick: () => setCategory(entry.key),
            }, entry.label)),
          ),
          visible.length === 0 && props.items.length > 0 ? h('p', { style: S.dim }, copy.catalogNoMatch) : null,
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '10px' } },
            ...visible.map(item => h('div', {
              key: item.id,
              style: {
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                width: '268px',
                flex: '1 1 268px',
                maxWidth: '420px',
                padding: '10px',
                borderRadius: '10px',
                border: '0.5px solid var(--dsw-alias-border-l3)',
                background: 'var(--dsw-alias-bg-l1)',
              },
            },
              h('div', { style: { ...S.row, alignItems: 'center' } },
                h('span', {
                  style: {
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '34px',
                    height: '34px',
                    borderRadius: '9px',
                    fontSize: '18px',
                    background: 'var(--dsw-alias-bg-l2)',
                    border: '0.5px solid var(--dsw-alias-border-l3)',
                  },
                }, item.icon),
                h('div', { style: { display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 } },
                  h('span', { style: { fontSize: '13px', fontWeight: 600 } }, item.name),
                  h('span', { style: S.meta }, `${item.vendor} · ${item.transport === 'stdio' ? 'stdio' : 'HTTP'}`),
                ),
                item.installed ? h(Badge, { tone: item.enabled === false ? 'muted' : 'ok' }, item.enabled === false ? copy.catalogDisabled : copy.catalogEnabled) : null,
              ),
              h('span', { style: { ...S.dim, minHeight: '32px' } }, item.description),
              h('div', { style: S.row },
                h('a', {
                  href: item.docs,
                  target: '_blank',
                  rel: 'noreferrer',
                  style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary)' },
                }, copy.catalogDocs),
                h('span', { style: { flex: 1 } }),
                item.installed
                  ? h('button', {
                    type: 'button',
                    style: S.button(false, props.busy === item.id),
                    disabled: props.busy === item.id,
                    onClick: () => openDialog(item),
                  }, props.busy === item.id ? copy.catalogInstallBusy : copy.catalogReconfigure)
                  : h('button', {
                    type: 'button',
                    style: S.button(true, props.busy === item.id),
                    disabled: props.busy === item.id,
                    onClick: () => (item.fields.length === 0 ? props.onConnect(item, {}) : openDialog(item)),
                  }, props.busy === item.id ? copy.catalogInstallBusy : copy.catalogConnect),
              ),
            )),
          ),
          h('p', { style: { ...S.dim, margin: 0 } }, copy.catalogSecretNote),
        ),

        dialog === undefined ? null : h('div', {
          style: {
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.38)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          },
          onClick: () => setDialog(undefined),
        },
          h('div', {
            style: {
              ...S.card,
              width: '440px',
              maxWidth: '92vw',
              maxHeight: '86vh',
              overflow: 'auto',
              background: 'var(--dsw-alias-bg-l1)',
            },
            onClick: (event: { stopPropagation: () => void }) => event.stopPropagation(),
          },
            h('div', { style: S.row },
              h('span', { style: { fontSize: '15px' } }, dialog.icon),
              h('span', { style: { fontSize: '14px', fontWeight: 600 } }, dialog.name),
              h('span', { style: S.meta }, dialog.vendor),
              h('span', { style: { flex: 1 } }),
              h('button', { type: 'button', style: S.button(false, false), onClick: () => setDialog(undefined) }, copy.close),
            ),
            h('p', { style: S.dim }, dialog.description),
            props.credentialsAvailable
              ? null
              : h('p', { style: S.notice('error') }, copy.catalogCredentialMissing),
            ...dialog.fields.map(field => h('label', { key: field.key, style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
              h('span', { style: { fontSize: '12px', fontWeight: 600 } }, `${field.label}${field.required === true ? ' *' : ''}`),
              h('input', {
                style: S.input,
                type: field.secret === true ? 'password' : 'text',
                autoComplete: 'off',
                value: values[field.key] ?? '',
                placeholder: field.placeholder ?? '',
                'aria-label': field.label,
                onChange: (event: { target: { value: string } }) => setValues(previous => ({ ...previous, [field.key]: event.target.value })),
              }),
              field.hint === undefined ? null : h('span', { style: S.dim }, field.hint),
            )),
            dialog.fields.length === 0 ? h('p', { style: S.dim }, copy.mcpSecretsNote) : null,
            formError.length === 0 ? null : h('p', { style: S.notice('error') }, formError),
            h('div', { style: S.row },
              h('span', { style: { flex: 1 } }),
              h('button', { type: 'button', style: S.button(false, false), onClick: () => setDialog(undefined) }, copy.cancel),
              h('button', {
                type: 'button',
                style: S.button(true, props.busy === dialog.id),
                disabled: props.busy === dialog.id || !props.credentialsAvailable,
                onClick: submit,
              }, props.busy === dialog.id ? copy.catalogInstallBusy : copy.catalogConnect),
            ),
          ),
        ),
      )
    }

    /**
     * MCP connectors: the same enable/disable/remove ergonomics as skills, plus
     * what only MCP needs — pasting a config, referencing another agent's
     * config, live connection status and a connection test.
     */
    function McpPanel(props: {
      copy: Copy
      entries: EntryView[]
      servers: McpServerRow[]
      candidates: McpCandidate[]
      platforms: Platform[]
      busy: string
      selected: string[]
      jsonText: string
      setJsonText: (value: string) => void
      probeBusy: string
      canProbe: boolean
      catalog: CatalogItem[]
      catalogBusy: string
      credentialsAvailable: boolean
      onScan: () => void
      onAdd: () => void
      onToggle: (entry: EntryView) => void
      onRemove: (entry: EntryView) => void
      onProbe: (entry: EntryView, server: string) => void
      onSelect: (key: string) => void
      onSelectGroup: (rows: McpCandidate[], select: boolean) => void
      onLink: (keys: string[]) => void
      onUnlink: (ids: string[]) => void
      onConnect: (item: CatalogItem, values: Record<string, string>) => void
      onRefreshCatalog: () => void
    }): unknown {
      const { copy } = props
      const [expanded, setExpanded] = useState<string[]>([])
      const statusOf = (entryId: string, server: string): McpServerRow | undefined =>
        props.servers.find(row => row.entryId === entryId && row.server === server)
      const groups = new Map<string, McpCandidate[]>()
      for (const platform of props.platforms) groups.set(platform.label, [])
      for (const candidate of props.candidates) {
        const list = groups.get(candidate.agentLabel) ?? []
        list.push(candidate)
        groups.set(candidate.agentLabel, list)
      }
      const selectedCandidates = props.candidates.filter(candidate => props.selected.includes(candidate.key))
      const linkable = selectedCandidates.filter(candidate => !candidate.linked)
      const linkedSelected = selectedCandidates.filter(candidate => candidate.linked && candidate.linkedId !== undefined)
      const batchBusy = props.busy === 'link'
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
        h(MarketPanel, {
          copy: props.copy,
          items: props.catalog,
          busy: props.catalogBusy,
          credentialsAvailable: props.credentialsAvailable,
          onConnect: props.onConnect,
          onRefresh: props.onRefreshCatalog,
        }),
        h('p', { style: S.dim }, copy.mcpIntro),

        // Current connectors.
        h('div', { style: S.card },
          h('div', { style: S.row },
            h('span', { style: { fontSize: '13px', fontWeight: 600 } }, copy.tabMcp),
            h(Badge, { tone: props.entries.length > 0 ? 'ok' : 'muted' }, String(props.entries.length)),
            h('span', { style: { flex: 1 } }),
            h('button', { type: 'button', style: S.button(false, props.busy === 'scan'), disabled: props.busy === 'scan', onClick: props.onScan },
              props.busy === 'scan' ? copy.mcpScanning : copy.mcpScan),
          ),
          props.entries.length === 0 ? h('p', { style: S.dim }, copy.mcpEmpty) : null,
          ...props.entries.map(entry => h('div', {
            key: entry.id,
            style: { display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px 0', borderTop: '0.5px solid var(--dsw-alias-border-l3)' },
          },
            h('div', { style: S.row },
              h('span', { style: { fontSize: '13px', fontWeight: 600 } }, entry.name),
              entry.origin === 'external'
                ? h(Badge, { tone: 'warn' }, copy.mcpBadgeRef)
                : h(Badge, { tone: 'muted' }, copy.mcpBadgeLocal),
              ...(entry.mcpRefs ?? []).map(ref => h(Badge, { key: ref.agent, tone: 'muted' }, ref.agentLabel)),
              h('span', { style: { flex: 1 } }),
              h('button', {
                type: 'button',
                style: S.switch(entry.enabled),
                title: entry.enabled ? copy.disable : copy.enable,
                'aria-label': entry.enabled ? copy.disable : copy.enable,
                disabled: props.busy === entry.id,
                onClick: () => props.onToggle(entry),
              }, h('span', { style: S.knob(entry.enabled) })),
            ),
            ...entry.mcpServers.map((server) => {
              const row = statusOf(entry.id, server.name)
              return h('div', { key: `s-${server.name}`, style: { ...S.row, alignItems: 'flex-start' } },
                h('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: 0 } },
                  h('div', { style: S.row },
                    h('span', { style: { fontSize: '12px', fontWeight: 600 } }, server.name),
                    h(Badge, null, server.transport),
                    row === undefined ? null : h(Badge, { tone: statusTone(row.status) }, row.status),
                    (server.envKeys ?? []).length > 0
                      ? h('span', { style: S.meta }, `${copy.mcpEnvKeys}: ${(server.envKeys ?? []).join(', ')}`)
                      : null,
                  ),
                  h('span', { style: S.mono }, server.summary ?? ''),
                ),
                h('button', {
                  type: 'button',
                  style: S.button(false, props.probeBusy === `${entry.id}/${server.name}` || !props.canProbe),
                  disabled: props.probeBusy === `${entry.id}/${server.name}` || !props.canProbe,
                  onClick: () => props.onProbe(entry, server.name),
                }, props.probeBusy === `${entry.id}/${server.name}` ? copy.mcpProbing : copy.mcpProbe),
              )
            }),
            ...(entry.mcpRefs ?? []).map((ref) => {
              const row = statusOf(entry.id, ref.name)
              return h('div', { key: `r-${ref.name}`, style: { ...S.row, alignItems: 'flex-start' } },
                h('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: 0 } },
                  h('div', { style: S.row },
                    h('span', { style: { fontSize: '12px', fontWeight: 600 } }, ref.name),
                    row === undefined ? null : h(Badge, { tone: statusTone(row.status) }, row.status),
                  ),
                  h('span', { style: S.mono }, ref.file),
                ),
                h('button', {
                  type: 'button',
                  style: S.button(false, props.probeBusy === `${entry.id}/${ref.name}` || !props.canProbe),
                  disabled: props.probeBusy === `${entry.id}/${ref.name}` || !props.canProbe,
                  onClick: () => props.onProbe(entry, ref.name),
                }, props.probeBusy === `${entry.id}/${ref.name}` ? copy.mcpProbing : copy.mcpProbe),
              )
            }),
            h('div', { style: S.row },
              h('span', { style: { flex: 1 } }),
              h('button', { type: 'button', style: S.button(false, props.busy === entry.id), onClick: () => props.onRemove(entry) },
                props.busy === entry.id ? copy.confirmRemove : (entry.origin === 'external' ? copy.unlink : copy.remove)),
            ),
          )),
        ),

        // Manual add.
        h('div', { style: S.card },
          h('span', { style: { fontSize: '13px', fontWeight: 600 } }, copy.mcpCustomTitle),
          h('textarea', {
            style: { ...S.input, minHeight: '110px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', resize: 'vertical' as const },
            value: props.jsonText,
            placeholder: copy.mcpAddPlaceholder,
            'aria-label': copy.mcpAddTitle,
            onChange: (event: { target: { value: string } }) => props.setJsonText(event.target.value),
          }),
          h('div', { style: S.row },
            h('span', { style: { flex: 1 } }),
            h('button', {
              type: 'button',
              style: S.button(true, props.busy === 'add' || props.jsonText.trim().length === 0),
              disabled: props.busy === 'add' || props.jsonText.trim().length === 0,
              onClick: props.onAdd,
            }, props.busy === 'add' ? copy.mcpAddBusy : copy.mcpAdd),
          ),
          h('p', { style: S.dim }, copy.mcpAddHint),
        ),

        // Scan other agents.
        h('div', { style: S.card },
          h('div', { style: S.row },
            h('span', { style: { fontSize: '13px', fontWeight: 600 } }, copy.mcpPlatformsTitle),
            h('span', { style: { flex: 1 } }),
            h('span', { style: S.meta }, fill(copy.mcpSelected, { count: String(selectedCandidates.length) })),
            h('button', {
              type: 'button',
              style: S.button(true, batchBusy || linkable.length === 0),
              disabled: batchBusy || linkable.length === 0,
              onClick: () => props.onLink(linkable.map(candidate => candidate.key)),
            }, batchBusy ? copy.mcpLinking : fill(copy.mcpLink, { count: String(linkable.length) })),
            h('button', {
              type: 'button',
              style: S.button(false, batchBusy || linkedSelected.length === 0),
              disabled: batchBusy || linkedSelected.length === 0,
              onClick: () => props.onUnlink(linkedSelected.map(candidate => candidate.linkedId as string)),
            }, fill(copy.mcpUnlinkSelected, { count: String(linkedSelected.length) })),
          ),
          props.platforms.length > 0
            ? h('div', { style: S.row },
              ...props.platforms.map(platform => h(Badge, { key: platform.agent, tone: 'ok' }, `${platform.label} · ${platform.count}`)))
            : (props.busy === 'scan' ? null : h('p', { style: S.dim }, copy.mcpNoCandidates)),
          h('p', { style: S.dim }, copy.mcpSecretsNote),
          ...[...groups.entries()].map(([label, rows]) => {
            const open = expanded.includes(label)
            const selectable = rows.filter(candidate => !candidate.linked)
            const allSelected = selectable.length > 0 && selectable.every(candidate => props.selected.includes(candidate.key))
            return h('div', { key: label, style: { display: 'flex', flexDirection: 'column', gap: '4px', paddingTop: '4px' } },
              h('div', { style: S.row },
                h('span', { style: { fontSize: '12px', fontWeight: 600 } }, label),
                h(Badge, { tone: rows.length > 0 ? 'ok' : 'muted' }, String(rows.length)),
                h('span', { style: { flex: 1 } }),
                h('button', {
                  type: 'button',
                  style: S.button(false, batchBusy || selectable.length === 0),
                  disabled: batchBusy || selectable.length === 0,
                  onClick: () => props.onSelectGroup(selectable, !allSelected),
                }, allSelected ? copy.clearAll : copy.selectAll),
                h('button', {
                  type: 'button',
                  style: S.button(false, rows.length === 0),
                  disabled: rows.length === 0,
                  onClick: () => setExpanded(previous => previous.includes(label)
                    ? previous.filter(item => item !== label)
                    : [...previous, label]),
                }, open ? copy.collapse : `${copy.expand} (${String(rows.length)})`),
              ),
              open ? rows.map(candidate => h('div', {
                key: candidate.key,
                style: { ...S.row, alignItems: 'flex-start', padding: '6px 0', borderTop: '0.5px solid var(--dsw-alias-border-l3)' },
              },
                h('input', {
                  type: 'checkbox',
                  checked: props.selected.includes(candidate.key),
                  disabled: candidate.linked || candidate.invalid === true || batchBusy,
                  'aria-label': candidate.name,
                  onChange: () => props.onSelect(candidate.key),
                }),
                h('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: 0 } },
                  h('div', { style: S.row },
                    h('span', { style: { fontSize: '13px', fontWeight: 600 } }, candidate.name),
                    h(Badge, null, candidate.transport),
                    candidate.linked ? h(Badge, { tone: 'ok' }, copy.linkedBadge) : null,
                    candidate.invalid === true ? h(Badge, { tone: 'error' }, copy.mcpInvalid) : null,
                    candidate.envKeys.length > 0
                      ? h('span', { style: S.meta }, `${copy.mcpEnvKeys}: ${candidate.envKeys.join(', ')}`)
                      : null,
                  ),
                  h('span', { style: S.mono }, candidate.summary),
                  h('span', { style: S.mono }, `${candidate.file}${candidate.scope === undefined ? '' : ` · ${candidate.scope}`}`),
                ),
              )) : null,
            )
          }),
        ),
      )
    }

    function SkillManagerPage(props: { ctx: unknown }): unknown {
      const copy = copyFor(detectLang(props.ctx))
      const [status, setStatus] = useState<StatusView | undefined>(undefined)
      const [entries, setEntries] = useState<EntryView[]>([])
      const [tab, setTab] = useState<'installed' | 'queue' | 'store' | 'direct' | 'import' | 'chat' | 'mcp'>('chat')
      const [source, setSource] = useState('')
      const [allowScripts, setAllowScripts] = useState(false)
      const [installBusy, setInstallBusy] = useState('')
      const [busyId, setBusyId] = useState('')
      const [notice, setNotice] = useState<{ text: string; tone: 'ok' | 'error' }>({ text: '', tone: 'ok' })
      const [query, setQuery] = useState('')
      const [results, setResults] = useState<SearchItem[]>([])
      const [searchBusy, setSearchBusy] = useState(false)
      const [searched, setSearched] = useState(false)
      const [candidates, setCandidates] = useState<Candidate[]>([])
      const [platforms, setPlatforms] = useState<Platform[]>([])
      const [scanBusy, setScanBusy] = useState(false)
      const [imported, setImported] = useState('')
      const [selected, setSelected] = useState<string[]>([])
      const [directBusy, setDirectBusy] = useState('')
      const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
        { role: 'assistant', text: copy.chatWelcome },
      ])
      const [chatInput, setChatInput] = useState('')
      const [chatBusy, setChatBusy] = useState(false)
      const [chatInstalling, setChatInstalling] = useState('')
      const [log, setLog] = useState<{ title: string; text: string } | undefined>(undefined)
      const [warning, setWarning] = useState('')
      const [mcpEntries, setMcpEntries] = useState<EntryView[]>([])
      const [mcpServers, setMcpServers] = useState<McpServerRow[]>([])
      const [mcpCandidates, setMcpCandidates] = useState<McpCandidate[]>([])
      const [mcpPlatforms, setMcpPlatforms] = useState<Platform[]>([])
      const [mcpSelected, setMcpSelected] = useState<string[]>([])
      const [mcpBusy, setMcpBusy] = useState('')
      const [mcpJson, setMcpJson] = useState('')
      const [probeBusy, setProbeBusy] = useState('')
      const [probeText, setProbeText] = useState('')
      const [catalog, setCatalog] = useState<CatalogItem[]>([])
      const [catalogBusy, setCatalogBusy] = useState('')
      const [credentialsAvailable, setCredentialsAvailable] = useState(true)
      const confirmRemove = useRef<string>('')
      const alive = useRef(true)

      const reload = useCallback(async (): Promise<void> => {
        const [statusData, listData] = await Promise.all([api('/status'), api('/skills')])
        if (!alive.current) return
        setStatus(statusData as unknown as StatusView)
        setEntries(Array.isArray(listData.entries) ? listData.entries as EntryView[] : [])
      }, [])

      const loadMcp = useCallback(async (): Promise<void> => {
        const data = await api('/mcp')
        if (!alive.current) return
        setMcpEntries(Array.isArray(data.entries) ? data.entries as EntryView[] : [])
        setMcpServers(Array.isArray(data.servers) ? data.servers as McpServerRow[] : [])
        setMcpCandidates(Array.isArray(data.candidates) ? data.candidates as McpCandidate[] : [])
        setMcpPlatforms(Array.isArray(data.platforms) ? data.platforms as Platform[] : [])
        const capabilities = data.capabilities as StatusView['capabilities'] | undefined
        if (capabilities !== undefined) setStatus(previous => (previous === undefined ? previous : { ...previous, capabilities }))
      }, [])

      const loadCatalog = useCallback(async (): Promise<void> => {
        const data = await api('/catalog')
        if (!alive.current) return
        setCatalog(Array.isArray(data.entries) ? data.entries as CatalogItem[] : [])
        setCredentialsAvailable(data.credentials !== false)
      }, [])

      useEffect(() => {
        alive.current = true
        void reload().catch((error: Error) => {
          if (alive.current) setNotice({ text: copy.errorPrefix + error.message, tone: 'error' })
        })
        return () => { alive.current = false }
      }, [reload])

      useEffect(() => {
        if ((tab === 'import' || tab === 'direct') && candidates.length === 0 && !scanBusy) void scan()
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [tab])

      useEffect(() => {
        if (tab !== 'mcp') return
        void Promise.all([loadMcp(), loadCatalog()]).catch((error: Error) => {
          if (alive.current) announce(copy.errorPrefix + error.message, 'error')
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [tab, loadMcp, loadCatalog])

      const announce = (text: string, tone: 'ok' | 'error' = 'ok'): void => setNotice({ text, tone })

      async function installFrom(value: string, itemName?: string): Promise<void> {
        const target = value.trim()
        if (target.length === 0) return
        setInstallBusy(itemName ?? target)
        setWarning('')
        try {
          const data = await api('/install', { method: 'POST', body: { source: target, allowScripts } })
          const entry = data.entry as EntryView | undefined
          const warnings = Array.isArray(data.warnings) ? data.warnings as string[] : []
          setNotice({ text: fill(copy.noticeInstalled, { name: entry?.name ?? target }), tone: 'ok' })
          if (warnings.length > 0) setWarning(`${copy.installWarnings} ${warnings.join('；')}`)
          setSource('')
          await reload()
        } catch (error) {
          announce(copy.errorPrefix + (error as Error).message, 'error')
        } finally {
          setInstallBusy('')
        }
      }

      async function toggle(entry: EntryView): Promise<void> {
        setBusyId(entry.id)
        try {
          await api('/enable', { method: 'POST', body: { id: entry.id, enabled: !entry.enabled } })
          setNotice({ text: entry.enabled
            ? fill(copy.noticeDisabled, { name: entry.name })
            : fill(copy.noticeEnabled, { name: entry.name }), tone: 'ok' })
          await reload()
          if (entry.kind === 'mcp') await loadMcp()
        } catch (error) {
          announce(copy.errorPrefix + (error as Error).message, 'error')
        } finally {
          setBusyId('')
        }
      }

      async function remove(entry: EntryView): Promise<void> {
        if (confirmRemove.current !== entry.id) {
          confirmRemove.current = entry.id
          setBusyId(entry.id)
          setNotice({ text: `${entry.origin === 'external' ? copy.unlink : copy.confirmRemove}: ${entry.name}`, tone: 'error' })
          return
        }
        confirmRemove.current = ''
        setBusyId(entry.id)
        try {
          await api('/remove', { method: 'POST', body: { id: entry.id } })
          setNotice({
            text: entry.origin === 'external'
              ? fill(copy.noticeUnlinked, { name: entry.name })
              : fill(copy.noticeRemoved, { name: entry.name }),
            tone: 'ok',
          })
          await reload()
          if (entry.kind === 'mcp') await loadMcp()
        } catch (error) {
          announce(copy.errorPrefix + (error as Error).message, 'error')
        } finally {
          setBusyId('')
        }
      }

      async function repair(entry: EntryView): Promise<void> {
        setBusyId(entry.id)
        try {
          await api('/repair', { method: 'POST', body: { id: entry.id } })
          setNotice({ text: fill(copy.noticeRepaired, { name: entry.name }), tone: 'ok' })
        } catch (error) {
          announce(copy.errorPrefix + (error as Error).message, 'error')
        } finally {
          setBusyId('')
        }
      }

      async function showLog(entry: EntryView): Promise<void> {
        try {
          const data = await api(`/log?id=${encodeURIComponent(entry.id)}`)
          const text = typeof data.log === 'string' && data.log.length > 0 ? data.log : copy.logEmpty
          setLog({ title: fill(copy.logTitle, { name: entry.name }), text })
        } catch (error) {
          announce(copy.errorPrefix + (error as Error).message, 'error')
        }
      }

      async function search(): Promise<void> {
        setSearchBusy(true)
        setSearched(true)
        try {
          const data = await api(`/search?q=${encodeURIComponent(query.trim())}&page=1`)
          if (Array.isArray(data.items)) setResults(data.items as SearchItem[])
          else setResults([])
          if (data.ok === false && typeof data.error === 'string') announce(copy.errorPrefix + data.error, 'error')
        } catch (error) {
          announce(copy.errorPrefix + (error as Error).message, 'error')
        } finally {
          setSearchBusy(false)
        }
      }

      async function scan(): Promise<void> {
        setScanBusy(true)
        try {
          const data = await api('/scan')
          setCandidates(Array.isArray(data.candidates) ? data.candidates as Candidate[] : [])
          setPlatforms(Array.isArray(data.platforms) ? data.platforms as Platform[] : [])
        } catch (error) {
          announce(copy.errorPrefix + (error as Error).message, 'error')
        } finally {
          setScanBusy(false)
        }
      }

      async function importCandidate(candidate: Candidate): Promise<void> {
        setImported(candidate.path)
        try {
          await api('/import', { method: 'POST', body: { path: candidate.path } })
          setNotice({ text: fill(copy.noticeImported, { name: candidate.name }), tone: 'ok' })
          await reload()
          await scan()
        } catch (error) {
          announce(copy.errorPrefix + (error as Error).message, 'error')
        } finally {
          setImported('')
        }
      }

      function toggleSelected(path: string): void {
        setSelected(previous => previous.includes(path)
          ? previous.filter(item => item !== path)
          : [...previous, path])
      }

      function selectGroup(rows: Candidate[], select: boolean): void {
        const paths = rows.map(candidate => candidate.path)
        setSelected(previous => select
          ? [...new Set([...previous, ...paths])]
          : previous.filter(item => !paths.includes(item)))
      }

      async function usePaths(paths: string[]): Promise<void> {
        if (paths.length === 0) return
        if (paths.length > 100) announce(copy.batchTooLarge, 'ok')
        setDirectBusy(paths.length === 1 ? paths[0]! : 'batch')
        setWarning('')
        // A stale Host aborts the whole batch on one bad folder. Drop the named
        // culprit and retry so a select-all still references every valid skill.
        const skipped: string[] = []
        let remaining = [...paths]
        let data: Record<string, unknown> | undefined
        try {
          for (let attempt = 0; attempt < 24 && remaining.length > 0; attempt += 1) {
            try {
              data = await api('/link', { method: 'POST', body: { paths: remaining } })
              break
            } catch (error) {
              const message = (error as Error).message
              const culprit = remaining.find(path => message.includes(path))
              if (culprit === undefined) throw error
              skipped.push(culprit)
              remaining = remaining.filter(path => path !== culprit)
            }
          }
          if (data === undefined) {
            throw new Error(skipped.length > 0 ? `已跳过 ${String(skipped.length)} 个无效技能` : '引用失败')
          }
          const warnings = Array.isArray(data.warnings) ? data.warnings as string[] : []
          const linkedCount = Array.isArray(data.entries) ? data.entries.length : remaining.length
          const names = remaining.length === 1 ? remaining[0] : String(linkedCount)
          setNotice({
            text: linkedCount === 1
              ? fill(copy.noticeLinked, { name: basenameLike(names) })
              : fill(copy.noticeLinkedMany, { count: String(linkedCount) }),
            tone: 'ok',
          })
          const allWarnings = [...skipped.map(path => `跳过（无效）：${path}`), ...warnings]
          if (allWarnings.length > 0) setWarning(`${copy.installWarnings} ${allWarnings.join('；')}`)
          setSelected([])
          await reload()
          await scan()
        } catch (error) {
          const message = (error as Error).message
          const stale = message.includes('技能名重复') || message.includes('SKILL.md')
          announce(copy.errorPrefix + message + (stale ? copy.hostReloadHint : ''), 'error')
        } finally {
          setDirectBusy('')
        }
      }

      async function unuseIds(ids: string[]): Promise<void> {
        if (ids.length === 0) return
        setDirectBusy('batch')
        try {
          for (const id of ids) {
            await api('/remove', { method: 'POST', body: { id } })
          }
          setNotice({
            text: ids.length === 1
              ? fill(copy.noticeUnlinked, { name: ids[0]! })
              : fill(copy.noticeUnlinkedMany, { count: String(ids.length) }),
            tone: 'ok',
          })
          setSelected([])
          await reload()
          await scan()
        } catch (error) {
          announce(copy.errorPrefix + (error as Error).message, 'error')
        } finally {
          setDirectBusy('')
        }
      }

      function lastChatResults(): SearchItem[] {
        for (let index = chatMessages.length - 1; index >= 0; index -= 1) {
          const message = chatMessages[index]
          if (message?.items !== undefined && message.items.length > 0) return message.items
        }
        return []
      }

      function appendChat(message: ChatMessage): void {
        setChatMessages(previous => [...previous, message])
      }

      async function installChatItem(item: SearchItem): Promise<void> {
        setChatInstalling(item.slug)
        try {
          await api('/install', { method: 'POST', body: { source: `skillhub:${item.slug}` } })
          appendChat({ role: 'assistant', text: fill(copy.chatInstalled, { name: item.name }) })
          await reload()
        } catch (error) {
          appendChat({ role: 'assistant', text: copy.errorPrefix + (error as Error).message })
        } finally {
          setChatInstalling('')
        }
      }

      async function sendChat(textArg?: string): Promise<void> {
        const text = (textArg ?? chatInput).trim()
        if (text.length === 0 || chatBusy) return
        setChatInput('')
        appendChat({ role: 'user', text })
        const install = /(?:安装|装)\s*(?:第)?\s*(\d+)/.exec(text)
          ?? /^install\s+(\d+)/i.exec(text)
          ?? /^(?:第)?\s*(\d+)\s*(?:个)?$/.exec(text)
        if (install !== null) {
          const item = lastChatResults()[Number(install[1]) - 1]
          if (item === undefined) {
            appendChat({ role: 'assistant', text: copy.chatNeedResult })
            return
          }
          await installChatItem(item)
          return
        }
        setChatBusy(true)
        try {
          const query = searchKeywords(text)
          let data = await api(`/search?q=${encodeURIComponent(query)}&page=1`)
          if (data.ok === false && typeof data.error === 'string') throw new Error(data.error)
          let items = Array.isArray(data.items) ? data.items as SearchItem[] : []
          if (items.length === 0 && query !== text) {
            data = await api(`/search?q=${encodeURIComponent(text)}&page=1`)
            if (data.ok === false && typeof data.error === 'string') throw new Error(data.error)
            items = Array.isArray(data.items) ? data.items as SearchItem[] : []
          }
          if (items.length === 0) {
            appendChat({
              role: 'assistant',
              text: copy.chatNoResult,
              prompt: copy.chatPromptPrefix + text,
            })
          } else {
            appendChat({
              role: 'assistant',
              text: fill(copy.chatFound, { count: String(Math.min(items.length, 8)), query }),
              items: items.slice(0, 8),
            })
          }
        } catch (error) {
          appendChat({ role: 'assistant', text: copy.errorPrefix + (error as Error).message })
        } finally {
          setChatBusy(false)
        }
      }

      async function copyChatPrompt(prompt: string): Promise<void> {
        try {
          await (globalThis as unknown as { navigator: { clipboard: { writeText: (text: string) => Promise<void> } } })
            .navigator.clipboard.writeText(prompt)
          announce(copy.chatCopied)
        } catch {
          announce(copy.errorPrefix + 'clipboard', 'error')
        }
      }

      async function connectCatalog(item: CatalogItem, values: Record<string, string>): Promise<void> {
        setCatalogBusy(item.id)
        setWarning('')
        try {
          const data = await api('/catalog/install', { method: 'POST', body: { id: item.id, values } })
          const warnings = Array.isArray(data.warnings) ? data.warnings as string[] : []
          announce(fill(copy.catalogNoticeInstalled, { name: item.name }))
          if (warnings.length > 0) setWarning(`${copy.installWarnings} ${warnings.join('；')}`)
          await reload()
          await Promise.all([loadMcp(), loadCatalog()])
        } catch (error) {
          announce(copy.errorPrefix + (error as Error).message, 'error')
        } finally {
          setCatalogBusy('')
        }
      }

      async function refreshCatalog(): Promise<void> {
        try {
          await Promise.all([loadMcp(), loadCatalog()])
          announce(copy.noticeRefreshed)
        } catch (error) {
          announce(copy.errorPrefix + (error as Error).message, 'error')
        }
      }

      async function scanMcp(): Promise<void> {
        setMcpBusy('scan')
        setWarning('')
        try {
          await loadMcp()
        } catch (error) {
          announce(copy.errorPrefix + (error as Error).message, 'error')
        } finally {
          setMcpBusy('')
        }
      }

      async function addMcp(): Promise<void> {
        const text = mcpJson.trim()
        if (text.length === 0) return
        setMcpBusy('add')
        setWarning('')
        try {
          const data = await api('/mcp/add', { method: 'POST', body: { json: text } })
          const warnings = Array.isArray(data.warnings) ? data.warnings as string[] : []
          const first = data.entry as EntryView | undefined
          announce(fill(copy.mcpNoticeAdded, { name: first?.name ?? '' }))
          if (warnings.length > 0) setWarning(`${copy.installWarnings} ${warnings.join('；')}`)
          setMcpJson('')
          await reload()
          await loadMcp()
        } catch (error) {
          announce(copy.errorPrefix + (error as Error).message, 'error')
        } finally {
          setMcpBusy('')
        }
      }

      async function linkMcp(keys: string[]): Promise<void> {
        if (keys.length === 0) return
        setMcpBusy('link')
        setWarning('')
        try {
          const data = await api('/mcp/link', { method: 'POST', body: { keys } })
          const warnings = Array.isArray(data.warnings) ? data.warnings as string[] : []
          const count = Array.isArray(data.entries) ? data.entries.length : keys.length
          announce(count === 1
            ? fill(copy.mcpNoticeLinked, { name: (data.entries as EntryView[] | undefined)?.[0]?.name ?? '' })
            : fill(copy.mcpNoticeLinkedMany, { count: String(count) }))
          if (warnings.length > 0) setWarning(`${copy.installWarnings} ${warnings.join('；')}`)
          setMcpSelected([])
          await reload()
          await loadMcp()
        } catch (error) {
          announce(copy.errorPrefix + (error as Error).message, 'error')
        } finally {
          setMcpBusy('')
        }
      }

      async function unlinkMcp(ids: string[]): Promise<void> {
        if (ids.length === 0) return
        setMcpBusy('link')
        try {
          for (const id of ids) await api('/remove', { method: 'POST', body: { id } })
          announce(ids.length === 1
            ? fill(copy.noticeUnlinked, { name: ids[0]! })
            : fill(copy.noticeUnlinkedMany, { count: String(ids.length) }))
          setMcpSelected([])
          await reload()
          await loadMcp()
        } catch (error) {
          announce(copy.errorPrefix + (error as Error).message, 'error')
        } finally {
          setMcpBusy('')
        }
      }

      async function probeMcp(entry: EntryView, server: string): Promise<void> {
        setProbeBusy(`${entry.id}/${server}`)
        setProbeText('')
        try {
          const data = await api('/mcp/probe', { method: 'POST', body: { id: entry.id, server } })
          if (data.ok === false) {
            announce(fill(copy.mcpProbeFail, { name: server, error: typeof data.error === 'string' ? data.error : '' }), 'error')
          } else {
            announce(fill(copy.mcpProbeOk, { name: server }))
            setProbeText(JSON.stringify(data.result ?? {}, null, 2).slice(0, 4000))
          }
          await loadMcp()
        } catch (error) {
          announce(copy.errorPrefix + (error as Error).message, 'error')
        } finally {
          setProbeBusy('')
        }
      }

      function toggleMcpSelected(key: string): void {
        setMcpSelected(previous => previous.includes(key) ? previous.filter(item => item !== key) : [...previous, key])
      }

      function selectMcpGroup(rows: McpCandidate[], select: boolean): void {
        const keys = rows.map(row => row.key)
        setMcpSelected(previous => select ? [...new Set([...previous, ...keys])] : previous.filter(item => !keys.includes(item)))
      }

      const stats = status?.store
      const installedEntries = entries.filter(entry => entry.origin !== 'external' && entry.kind !== 'mcp')
      const queueEntries = entries.filter(entry => entry.origin === 'external' && entry.kind !== 'mcp')
      return h('div', { style: S.section },
        h('div', { style: S.row },
          h('h3', { style: S.title }, copy.title),
          h('span', { style: { flex: 1 } }),
          h('button', { type: 'button', style: S.button(false, false), onClick: () => { void reload().then(() => announce(copy.noticeRefreshed)) } }, copy.refresh),
        ),
        h('p', { style: S.intro }, copy.intro),
        stats === undefined ? null : h('div', { style: { ...S.card, flexDirection: 'row', gap: '24px', flexWrap: 'wrap' } },
          h('div', { style: S.stat }, h('span', { style: S.statValue }, String(stats.count)), h('span', { style: S.statLabel }, copy.installedCount)),
          h('div', { style: S.stat }, h('span', { style: S.statValue }, String(stats.enabled)), h('span', { style: S.statLabel }, copy.enabledCount)),
          h('div', { style: S.stat }, h('span', { style: S.statValue }, String(stats.external ?? 0)), h('span', { style: S.statLabel }, copy.externalCount)),
          h('div', { style: S.stat }, h('span', { style: S.statValue }, String(stats.skills)), h('span', { style: S.statLabel }, copy.skillsCount)),
          h('div', { style: S.stat }, h('span', { style: S.statValue }, String(stats.mcp ?? mcpEntries.length)), h('span', { style: S.statLabel }, copy.mcpCount)),
          h('div', { style: S.stat }, h('span', { style: S.statValue }, String(stats.mcpServers)), h('span', { style: S.statLabel }, copy.capMcp)),
          h('div', { style: { ...S.stat, flex: 1, minWidth: '200px' } },
            h('span', { style: S.statLabel }, copy.storeDir),
            h('span', { style: S.mono }, stats.dir)),
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
            h('span', { style: S.statLabel }, copy.capSkills),
            h(Badge, { tone: status?.capabilities.skills ? 'ok' : 'warn' }, status?.capabilities.skills ? copy.capOn : copy.capOff),
            h('span', { style: S.statLabel }, copy.capMcp),
            h(Badge, { tone: status?.capabilities.mcp ? 'ok' : 'warn' }, status?.capabilities.mcp ? copy.capOn : copy.capOff),
          ),
          h('p', { style: { ...S.dim, flexBasis: '100%', margin: 0 } }, copy.statsHint),
        ),
        status !== undefined && status.warnings.length > 0
          ? h('div', { style: S.card },
            h('span', { style: { fontSize: '13px', fontWeight: 600 } }, copy.warningsTitle),
            ...status.warnings.map((text, index) => h('p', { key: `${String(index)}-${text}`, style: S.dim }, text)))
          : null,
        tab === 'chat' ? null : h('div', { style: S.card },
          h('span', { style: { fontSize: '13px', fontWeight: 600 } }, copy.installTitle),
          h('div', { style: S.row },
            h('input', {
              style: { ...S.input, flex: 1, minWidth: '240px' },
              value: source,
              placeholder: copy.installPlaceholder,
              'aria-label': copy.installPlaceholder,
              onChange: (event: { target: { value: string } }) => setSource(event.target.value),
              onKeyDown: (event: { key: string }) => { if (event.key === 'Enter') void installFrom(source) },
            }),
            h('button', {
              type: 'button',
              style: S.button(true, installBusy.length > 0 || source.trim().length === 0),
              disabled: installBusy.length > 0 || source.trim().length === 0,
              onClick: () => { void installFrom(source) },
            }, installBusy.length > 0 && installBusy !== '' && !installBusy.includes('skillhub:') ? copy.installing : copy.install),
          ),
          h('p', { style: S.dim }, copy.installHint),
          h('label', { style: { ...S.row, fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)' } },
            h('input', {
              type: 'checkbox',
              checked: allowScripts,
              onChange: (event: { target: { checked: boolean } }) => setAllowScripts(event.target.checked),
            }),
            copy.allowScripts,
          ),
          h('p', { style: S.dim }, copy.permissionHint),
          warning.length > 0 ? h('p', { style: S.notice('error') }, warning) : null,
        ),
        h(Notice, { text: notice.text, tone: notice.tone }),
        h('div', { style: S.tabs },
          h('button', { type: 'button', style: S.tab(tab === 'chat'), onClick: () => setTab('chat') }, copy.tabChat),
          h('button', { type: 'button', style: S.tab(tab === 'installed'), onClick: () => setTab('installed') }, copy.tabInstalled),
          h('button', { type: 'button', style: S.tab(tab === 'queue'), onClick: () => setTab('queue') }, copy.tabQueue),
          h('button', { type: 'button', style: S.tab(tab === 'mcp'), onClick: () => setTab('mcp') }, copy.tabMcp),
          h('button', { type: 'button', style: S.tab(tab === 'store'), onClick: () => setTab('store') }, copy.tabStore),
          h('button', { type: 'button', style: S.tab(tab === 'direct'), onClick: () => setTab('direct') }, copy.tabDirect),
          h('button', { type: 'button', style: S.tab(tab === 'import'), onClick: () => setTab('import') }, copy.tabImport),
        ),
        tab === 'installed'
          ? h(InstalledPanel, {
            copy,
            entries: installedEntries,
            busy: busyId,
            onToggle: (entry: EntryView) => { void toggle(entry) },
            onRemove: (entry: EntryView) => { void remove(entry) },
            onRepair: (entry: EntryView) => { void repair(entry) },
            onLog: (entry: EntryView) => { void showLog(entry) },
          })
          : tab === 'queue'
            ? h(InstalledPanel, {
              copy,
              entries: queueEntries,
              busy: busyId,
              emptyText: copy.emptyQueue,
              onToggle: (entry: EntryView) => { void toggle(entry) },
              onRemove: (entry: EntryView) => { void remove(entry) },
              onRepair: (entry: EntryView) => { void repair(entry) },
              onLog: (entry: EntryView) => { void showLog(entry) },
            })
            : tab === 'mcp'
              ? h(McpPanel, {
                copy,
                entries: mcpEntries,
                servers: mcpServers,
                candidates: mcpCandidates,
                platforms: mcpPlatforms,
                busy: mcpBusy,
                selected: mcpSelected,
                jsonText: mcpJson,
                setJsonText: setMcpJson,
                probeBusy,
                canProbe: status?.capabilities.probe !== false,
                onScan: () => { void scanMcp() },
                onAdd: () => { void addMcp() },
                onToggle: (entry: EntryView) => { void toggle(entry) },
                onRemove: (entry: EntryView) => { void remove(entry) },
                onProbe: (entry: EntryView, server: string) => { void probeMcp(entry, server) },
                onSelect: toggleMcpSelected,
                onSelectGroup: selectMcpGroup,
                onLink: (keys: string[]) => { void linkMcp(keys) },
                onUnlink: (ids: string[]) => { void unlinkMcp(ids) },
                catalog,
                catalogBusy,
                credentialsAvailable,
                onConnect: (item: CatalogItem, values: Record<string, string>) => connectCatalog(item, values),
                onRefreshCatalog: () => { void refreshCatalog() },
              })
            : tab === 'store'
            ? h(SearchPanel, {
              copy,
              query,
              setQuery,
              results,
              busy: searchBusy,
              searched,
              installBusy,
              onSearch: () => { void search() },
              onInstall: (item: SearchItem) => { void installFrom(`skillhub:${item.slug}`, item.slug) },
            })
            : tab === 'direct'
              ? h(DirectPanel, {
                copy,
                candidates,
                platforms,
                busy: scanBusy,
                directBusy,
                selected,
                onScan: () => { void scan() },
                onToggle: toggleSelected,
                onSelectGroup: selectGroup,
                onSelectAll: (select: boolean) => selectGroup(
                  candidates.filter(candidate => !candidate.installed || candidate.linked),
                  select,
                ),
                onUse: (paths: string[]) => { void usePaths(paths) },
                onUnuse: (ids: string[]) => { void unuseIds(ids) },
              })
              : tab === 'import'
                ? h(ImportPanel, {
                  copy,
                  candidates,
                  busy: scanBusy,
                  imported,
                  onScan: () => { void scan() },
                  onImport: (candidate: Candidate) => { void importCandidate(candidate) },
                })
                : h(ChatPanel, {
                  copy,
                  messages: chatMessages,
                  input: chatInput,
                  setInput: setChatInput,
                  busy: chatBusy,
                  installing: chatInstalling,
                  onSend: () => { void sendChat() },
                  onInstall: (item: SearchItem) => { void installChatItem(item) },
                  onCopy: (prompt: string) => { void copyChatPrompt(prompt) },
                  onExample: (text: string) => { void sendChat(text) },
                }),
        log === undefined ? null : h('div', { style: S.card },
          h('div', { style: S.row },
            h('span', { style: { fontSize: '13px', fontWeight: 600 } }, log.title),
            h('span', { style: { flex: 1 } }),
            h('button', { type: 'button', style: S.button(false, false), onClick: () => setLog(undefined) }, copy.close),
          ),
          h('pre', { style: S.pre }, log.text),
        ),
        probeText.length === 0 ? null : h('div', { style: S.card },
          h('div', { style: S.row },
            h('span', { style: { fontSize: '13px', fontWeight: 600 } }, copy.mcpStatus),
            h('span', { style: { flex: 1 } }),
            h('button', { type: 'button', style: S.button(false, false), onClick: () => setProbeText('') }, copy.close),
          ),
          h('pre', { style: S.pre }, probeText),
        ),
      )
    }

    // ----------------------------------------------------------------- apply --
    return {
      inject: ['slots'],
      apply(ctx: { slots: { inject: (slot: string, fn: () => void) => void; register: (options: Record<string, unknown>, component: unknown) => void } }) {
        const Page = () => h(SkillManagerPage, { ctx })
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: SECTION_ID,
          order: 13,
          label: () => copyFor(detectLang(ctx)).nav,
        }, Page))
      },
    }
  },
  })
})()
