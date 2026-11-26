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
        externalCount: '直接引用',
        skillsCount: '注册技能',
        mcpCount: 'MCP 服务',
        capSkills: '技能服务',
        capMcp: 'MCP 服务',
        capOn: '可用',
        capOff: '不可用',
        tabInstalled: '已安装',
        tabStore: 'SkillHub 商店',
        tabDirect: '直接使用其他 Agent',
        tabImport: '从其他 Agent 导入',
        tabChat: '对话安装技能',
        installTitle: '安装新技能',
        installPlaceholder: 'npm 包名 / GitHub 地址 / skillhub:<slug> / .zip 路径',
        installHint: '例：skillhub:find-skill-skillhub、https://github.com/owner/repo、@scope/pkg@1.2.3、C:\\path\\skill.zip',
        install: '安装',
        installing: '正在安装…',
        installWarnings: '安装完成，但有提醒：',
        emptyInstalled: '还没有安装任何技能。先在上面的输入框里贴一个来源。',
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
        unlink: '取消直接使用',
        confirmRemove: '确认移除',
        directUse: '直接使用',
        directIntro: '读取本机各 Agent 已安装的 Skill，按平台勾选后直接注册使用。不复制文件、不改原目录，对方更新后这里立即生效。',
        scanningPlatforms: '正在识别本机 Agent 平台…',
        platformsTitle: '已识别平台',
        noPlatforms: '没有识别到已安装的 Agent 技能目录。可以点「重新扫描」再试一次。',
        platformCount: '{count} 个技能',
        noSkillsInPlatform: '该平台未发现技能',
        selectAllPlatforms: '全选所有',
        clearAllPlatforms: '清空所有',
        expand: '展开',
        collapse: '收起',
        selectedCount: '已选 {count} 个',
        useSelected: '直接使用选中（{count}）',
        unuseSelected: '取消选中（{count}）',
        selectAll: '全选',
        clearAll: '清空',
        directUsing: '正在启用…',
        directUseHint: '直接使用不会安装依赖，也不会改动原目录；依赖需要在原 Agent 中可用。',
        linkedBadge: '直接使用中',
        externalBadge: '外部 · 不复制',
        copiedBadge: '已复制',
        noticeLinked: '已直接使用 {name}',
        noticeUnlinked: '已取消直接使用 {name}',
        noticeLinkedMany: '已直接使用 {count} 个技能',
        noticeUnlinkedMany: '已取消 {count} 个直接引用',
        batchTooLarge: '一次最多直接使用 100 个技能，请按平台或分批选择。',
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
        errorPrefix: '操作失败：',
      },
      en: {
        nav: 'Skill Store',
        title: 'Skill Store',
        intro: 'Install third-party skills and MCP servers into an isolated store, then enable or disable them live. npm, GitHub, SkillHub and .zip are supported, and skills already installed by other agents can be migrated in one click.',
        storeDir: 'Store',
        installedCount: 'Installed',
        enabledCount: 'Enabled',
        externalCount: 'In place',
        skillsCount: 'Skills',
        mcpCount: 'MCP servers',
        capSkills: 'Skills service',
        capMcp: 'MCP service',
        capOn: 'available',
        capOff: 'unavailable',
        tabInstalled: 'Installed',
        tabStore: 'SkillHub',
        tabDirect: 'Use other agents',
        tabImport: 'Import from agents',
        tabChat: 'Install by chat',
        installTitle: 'Install a skill',
        installPlaceholder: 'npm name / GitHub URL / skillhub:<slug> / .zip path',
        installHint: 'e.g. skillhub:find-skill-skillhub, https://github.com/owner/repo, @scope/pkg@1.2.3, C:\\path\\skill.zip',
        install: 'Install',
        installing: 'Installing…',
        installWarnings: 'Installed, with warnings:',
        emptyInstalled: 'Nothing installed yet. Paste a source above to begin.',
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
        unlink: 'Stop using',
        confirmRemove: 'Confirm remove',
        directUse: 'Use in place',
        directIntro: 'Read the skills other agents installed on this computer and use them by platform. Nothing is copied and the original folder is untouched; updates made by that agent apply immediately.',
        scanningPlatforms: 'Detecting agent platforms on this computer…',
        platformsTitle: 'Detected platforms',
        noPlatforms: 'No agent skill folder was found. Try “Scan again”.',
        platformCount: '{count} skills',
        noSkillsInPlatform: 'No skills found in this platform',
        selectAllPlatforms: 'Select all',
        clearAllPlatforms: 'Clear all',
        expand: 'Expand',
        collapse: 'Collapse',
        selectedCount: '{count} selected',
        useSelected: 'Use selected ({count})',
        unuseSelected: 'Stop using selected ({count})',
        selectAll: 'Select all',
        clearAll: 'Clear',
        directUsing: 'Linking…',
        directUseHint: 'Use in place does not install dependencies or modify the original folder; dependencies must already work in the other agent.',
        linkedBadge: 'Used in place',
        externalBadge: 'External · not copied',
        copiedBadge: 'Copied',
        noticeLinked: 'Now using {name} in place',
        noticeUnlinked: 'Stopped using {name}',
        noticeLinkedMany: 'Using {count} skills in place',
        noticeUnlinkedMany: 'Stopped {count} in-place references',
        batchTooLarge: 'At most 100 skills can be linked at once; pick a platform or split the batch.',
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
        errorPrefix: 'Action failed: ',
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
      skills: Array<{ name: string; description: string }>
      mcpServers: Array<{ name: string; transport: string }>
      dependencies: { node: boolean; python: boolean }
      provenance?: { agent?: string; origin?: string }
    }
    interface StatusView {
      ok: boolean
      version: string
      store: { dir: string; count: number; enabled: number; external: number; skills: number; mcpServers: number; revision: number }
      capabilities: { skills: boolean; mcp: boolean }
      warnings: string[]
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
      onToggle: (entry: EntryView) => void
      onRemove: (entry: EntryView) => void
      onRepair: (entry: EntryView) => void
      onLog: (entry: EntryView) => void
    }): unknown {
      const { copy, entries } = props
      if (entries.length === 0) return h('p', { style: S.dim }, copy.emptyInstalled)
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

    function DirectPanel(props: {
      copy: Copy
      candidates: Candidate[]
      platforms: Platform[]
      busy: boolean
      directBusy: string
      selected: string[]
      onScan: () => void
      onToggle: (path: string) => void
      onSelectGroup: (group: Candidate[], select: boolean) => void
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
      const usable = selectedCandidates.filter(candidate => !candidate.linked && !candidate.installed)
      const linked = selectedCandidates.filter(candidate => candidate.linked && candidate.linkedId !== undefined)
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
            style: S.button(true, batchBusy || usable.length === 0),
            disabled: batchBusy || usable.length === 0,
            onClick: () => props.onUse(usable.map(candidate => candidate.path)),
          }, batchBusy ? copy.directUsing : fill(copy.useSelected, { count: String(usable.length) })),
          h('button', {
            type: 'button',
            style: S.button(false, batchBusy || linked.length === 0),
            disabled: batchBusy || linked.length === 0,
            onClick: () => props.onUnuse(linked.map(candidate => candidate.linkedId as string)),
          }, fill(copy.unuseSelected, { count: String(linked.length) })),
        ),
        props.platforms.length > 0
          ? h('div', { style: S.row },
            h('span', { style: S.meta }, copy.platformsTitle),
            ...props.platforms.map(platform => h(Badge, {
              key: platform.agent,
              tone: platform.count > 0 ? 'ok' : 'muted',
            }, `${platform.label} · ${platform.count}`)))
          : (props.busy ? null : h('p', { style: S.dim }, copy.noPlatforms)),
        h('div', { style: S.row },
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
        ),
        h('p', { style: S.dim }, copy.directUseHint),
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
                style: S.button(false, selectable.length === 0),
                disabled: selectable.length === 0,
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
            open ? rows.map(candidate => h('div', { key: candidate.path, style: { ...S.row, alignItems: 'flex-start', padding: '6px 0', borderTop: '0.5px solid var(--dsw-alias-border-l3)' } },
              h('input', {
                type: 'checkbox',
                checked: props.selected.includes(candidate.path),
                disabled: candidate.installed && !candidate.linked,
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
              candidate.linked
                ? h('button', {
                  type: 'button',
                  style: S.button(false, props.directBusy === candidate.path),
                  disabled: props.directBusy === candidate.path,
                  onClick: () => props.onUnuse([candidate.linkedId as string]),
                }, copy.unlink)
                : candidate.installed
                  ? null
                  : h('button', {
                    type: 'button',
                    style: S.button(true, props.directBusy === candidate.path),
                    disabled: props.directBusy === candidate.path,
                    onClick: () => props.onUse([candidate.path]),
                  }, props.directBusy === candidate.path ? copy.directUsing : copy.directUse),
            )) : null,
          )
        }),
      )
    }

    function SkillManagerPage(props: { ctx: unknown }): unknown {
      const copy = copyFor(detectLang(props.ctx))
      const [status, setStatus] = useState<StatusView | undefined>(undefined)
      const [entries, setEntries] = useState<EntryView[]>([])
      const [tab, setTab] = useState<'installed' | 'store' | 'direct' | 'import' | 'chat'>('chat')
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
      const confirmRemove = useRef<string>('')
      const alive = useRef(true)

      const reload = useCallback(async (): Promise<void> => {
        const [statusData, listData] = await Promise.all([api('/status'), api('/skills')])
        if (!alive.current) return
        setStatus(statusData as unknown as StatusView)
        setEntries(Array.isArray(listData.entries) ? listData.entries as EntryView[] : [])
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
        if (paths.length > 100) {
          announce(copy.batchTooLarge, 'error')
          return
        }
        setDirectBusy(paths.length === 1 ? paths[0]! : 'batch')
        setWarning('')
        try {
          const data = await api('/link', { method: 'POST', body: { paths } })
          const warnings = Array.isArray(data.warnings) ? data.warnings as string[] : []
          const linkedCount = Array.isArray(data.entries) ? data.entries.length : paths.length
          const names = paths.length === 1 ? paths[0] : String(linkedCount)
          setNotice({
            text: linkedCount === 1
              ? fill(copy.noticeLinked, { name: basenameLike(names) })
              : fill(copy.noticeLinkedMany, { count: String(linkedCount) }),
            tone: 'ok',
          })
          if (warnings.length > 0) setWarning(`${copy.installWarnings} ${warnings.join('；')}`)
          setSelected([])
          await reload()
          await scan()
        } catch (error) {
          announce(copy.errorPrefix + (error as Error).message, 'error')
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

      const stats = status?.store
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
          h('div', { style: S.stat }, h('span', { style: S.statValue }, String(stats.mcpServers)), h('span', { style: S.statLabel }, copy.mcpCount)),
          h('div', { style: { ...S.stat, flex: 1, minWidth: '200px' } },
            h('span', { style: S.statLabel }, copy.storeDir),
            h('span', { style: S.mono }, stats.dir)),
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
            h('span', { style: S.statLabel }, copy.capSkills),
            h(Badge, { tone: status?.capabilities.skills ? 'ok' : 'warn' }, status?.capabilities.skills ? copy.capOn : copy.capOff),
            h('span', { style: S.statLabel }, copy.capMcp),
            h(Badge, { tone: status?.capabilities.mcp ? 'ok' : 'warn' }, status?.capabilities.mcp ? copy.capOn : copy.capOff),
          ),
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
          h('button', { type: 'button', style: S.tab(tab === 'store'), onClick: () => setTab('store') }, copy.tabStore),
          h('button', { type: 'button', style: S.tab(tab === 'direct'), onClick: () => setTab('direct') }, copy.tabDirect),
          h('button', { type: 'button', style: S.tab(tab === 'import'), onClick: () => setTab('import') }, copy.tabImport),
        ),
        tab === 'installed'
          ? h(InstalledPanel, {
            copy,
            entries,
            busy: busyId,
            onToggle: (entry: EntryView) => { void toggle(entry) },
            onRemove: (entry: EntryView) => { void remove(entry) },
            onRepair: (entry: EntryView) => { void repair(entry) },
            onLog: (entry: EntryView) => { void showLog(entry) },
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
