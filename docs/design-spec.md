# PixGo 设计规范（Design Spec）

> 反向梳理自当前代码实现（`src/index.css` + 各组件 className 高频统计）。本文件描述「现状即规范」，供后续 UI 开发对齐。
> 平台名：艺术工具 DCC 启动与资产平台（窗口标题），分享版本名 PixGo。技术栈：React 19 + Vite + Tailwind v4。

---

## 1. 设计基调（Design Language）

- **风格**：开发者工具 / 终端美学（dev-tool, terminal-inspired）。深色为主，霓虹绿点缀，等宽字体承载数据型信息。
- **关键词**：暗色高对比、扁平无阴影（卡片）、绿色高亮态、紧凑信息密度。
- **默认主题**：深色（`localStorage` 无值时默认 `dark`）。支持浅色主题切换。

---

## 2. 颜色系统（Color Tokens）

### 2.1 品牌色
| 用途 | 暗色 | 浅色 |
|---|---|---|
| 主品牌绿（强调/选中/链接/active） | `#00ff00` | `#00C800` |
| 绿 hover 变体 | `#00dd00` | — |
| 暗绿（边框暗调） | `#003300` | — |

> 品牌绿在代码中出现 ~288 次，是绝对核心强调色。规则：选中态、active tab 下划线、聚焦边框、图标高亮、可点击重点元素。浅色模式下全局把 `#00ff00` 映射为 `#00C800`（更深，保证白底可读）。

### 2.2 暗色中性色阶（由深到浅）
| Token | 用途 |
|---|---|
| `#09090b` | 页面根背景（body / brand-bg） |
| `#0a0a0c` | 弹窗 / 详情侧栏背景 |
| `#0c0c0e` | 卡片 / 容器面板背景（高频，72×） |
| `#121214` | 卡片内填充 / hover 态容器 |
| `#18181b` | 选中行背景 / 分隔 |
| `#1c1c1f` | 次级分隔背景 |
| `#27272a` | 主边框色（brand-border，88×） |
| `#f4f4f5` | 主文字（亮） |

文字灰阶用 Tailwind `text-zinc-200/300/400/500/600`（由主到次）。

### 2.3 浅色主题中性色阶
| Token | 用途 |
|---|---|
| `#f8fafc` | 页面背景 |
| `#ffffff` | 卡片 / 弹窗背景 |
| `#f1f5f9` | 输入框 / 次级填充 |
| `#e2e8f0` | 选中态 / 次级背景 |
| `#cbd5e1` | 边框 |
| `#0f172a` / `#0d121e` | 主文字 |
| `#334155`/`#475569`/`#64748b` | 文字灰阶（主→次） |

> 浅色主题在 `src/index.css` 的 `.light` 作用域里，通过 `.light .bg-[#xxxxxx]` 等覆盖规则把暗色 token 整体重映射（详见 §9）。

### 2.4 语义/状态色（Tailwind 色板）
| 语义 | 色 |
|---|---|
| 警告 / 磁盘告急 | `amber-500`（暗）/ `amber-400` |
| 错误 / 删除 / 危险 | `red-500` / `red-400`，浅色 `b91c1c` |
| 成功 | 品牌绿 / `emerald` |
| 个人空间标识 | sky `#38bdf8` |
| 与我共享标识 | violet `#a78bfa` |
| 途游通用标识 | amber `#facc15` |
| 项目空间标识 | green `#00ff00` |
| 外部素材标识 | orange `#fb923c` |
| 更新/升级提示 | purple `#7c3aed` 系 |

---

## 3. 字体系统（Typography）

引入 Google Fonts：Inter / Space Grotesk / JetBrains Mono。

| Token | 字体族 | 用途 |
|---|---|---|
| `font-sans` | **Inter** | 正文 / UI 默认 |
| `font-display` | **Space Grotesk** | 标题 / 品牌字（如 ARTLAUNCHER、区块大标题） |
| `font-mono` | **JetBrains Mono** | 数据 / 标签 / 计数 / 格式后缀 / 日志 / 邮箱等技术信息 |

### 字号阶梯（实际高频用法）
紧凑信息密度，主力字号偏小：
- `text-xs` (12px) — UI 主力（130×）
- `text-[10px]` — 标签 / 计数 / 次级信息（83×）
- `text-[11px]` / `text-[10.5px]` — 筛选项、mono 元信息
- `text-[9px]` / `text-[9.5px]` — 徽章、角标
- `text-sm` (14px) — 区块标题 / 卡片名
- `text-base` / `text-xl` — 弹窗主标题 / 强调数字

> 经验法则：结构性标题用 14px+，操作控件用 12px，元数据/徽章用 9–11px 且多配 `font-mono`。

---

## 4. 间距与圆角（Spacing & Radius）

### 圆角
- 默认 `rounded`（≈4px）——绝对主力（217×），用于按钮/卡片/输入/徽章
- `rounded-full` — 圆点指示器、计数胶囊、头像
- `rounded-md` — 弹窗内中等控件
- `rounded-lg` / `rounded-xl` — 弹窗外层 / 大卡片

### 间距（高频 Tailwind 值）
- 元素间隙：`gap-2`（主力）、`gap-1.5`、`gap-1`、`gap-3`
- 控件内边距：`px-3 py-1.5`（标准按钮）、`px-2 py-1`（紧凑）、`px-4`（区块）
- 容器内边距：`p-4`（卡片）、`p-2`（下拉面板）、`p-3`（侧栏）

> 网格卡片间距 `gap-3`/`gap-4`；筛选条 chip 间距 `gap-1.5`。

---

## 5. 布局结构（Layout）

整体三段式（`App.tsx`）：
```
┌─ Sidebar(左导航) ─┬─ 主内容区 ───────────────┐
│  w-68 / 收起 w-72 │  flex-1                  │
│  bg-black         │  ┌─ 当前 Tab 面板 ─────┐  │
│                   │  │ (素材/工具/权限...) │  │
│                   │  └────────────────────┘  │
│                   │  ┌─ 底部运行日志抽屉 ──┐  │
└───────────────────┴──┴────────────────────┴──┘
```
- **左导航**：固定宽 `w-68`，可折叠为 `w-[72px]`（图标态）。顶部品牌区 + 主 Tab 列表 + 底部存储指示/用户/主题切换。
- **主内容区**：`flex-1`，顶部工具栏 + 滚动内容 + 底部可折叠终端日志（`运行日志与派发流`）。
- **素材库**：内部再分「文件目录侧栏（可拖拽调宽 240–520px）+ 内容区（工具栏 + 类型 tab + 通用筛选 + 卡片网格 + 分页）」。
- **响应式**：`lg`(1024px) 为桌面/移动分界；卡片网格 `grid-cols-2 → md:3 → xl:4 → 2xl:5`。

---

## 6. 核心组件规范（Component Patterns）

### 6.1 导航 Tab（Sidebar）
- 选中：`bg-[#18181b] text-white`，图标 `text-[#00ff00]`
- 未选中：`text-zinc-400 hover:text-white hover:bg-[#0c0c0e]`
- 计数徽章：选中 `bg-[#00ff00] text-black`，否则 `bg-[#1c1c1f] text-zinc-400`，`rounded-full`
- 当前主 Tab：素材 / 工具 / 画布 / 权限管理 / 缓存与设置（默认进入 = 素材）

### 6.2 按钮
| 类型 | 样式 |
|---|---|
| 主操作（实心绿） | `bg-[#00ff00] text-black`，hover 略暗 |
| 次操作（描边） | `border border-zinc-800 bg-black text-zinc-300`，hover `border-[#00ff00]/60 hover:text-white` |
| 危险 | hover `border-red-500/60 text-red-400` |
| 禁用 | `disabled:opacity-40 disabled:cursor-not-allowed` |
- 标准尺寸 `px-3 py-1.5 text-[10.5px~xs]`，图标 + 文字 `gap-1.5`。

### 6.3 筛选下拉（Filter Dropdown）
- 触发钮：active（有选中或展开）= `border-[#00ff00]/60 bg-[#00ff00]/10 text-[#00ff00]`；含计数胶囊 + `ChevronDown`（展开 `rotate-180`）。
- 面板：`absolute top-full mt-1.5 rounded border border-zinc-700 bg-[#0c0c0e] p-2 shadow-xl shadow-black/60 z-30`。
- 三种可复用面板：多选（带可选搜索框）、区间（min/max 双 number）、色板（色相格子）。
- 选中态：`border-[#00ff00]/60 bg-[#00ff00]/10 text-[#00ff00]`。

### 6.4 卡片（素材卡）
- 容器：`rounded border bg-[#0c0c0e]`；选中 `border-[#00ff00]`，否则 `border-[#27272a] hover:border-zinc-700`。
- 缩略图区：`aspect-video`，hover 图片 `scale-105`；左上格式角标（mono 绿）、右上来源/相似度徽章。
- 扁平无投影；仅靠边框色变化表达状态。

### 6.5 弹窗（Modal）
- 遮罩：`fixed inset-0 bg-black/70`（浅色 `bg-white/60 backdrop-blur`）。
- 容器：`rounded-lg border border-[#27272a] bg-[#0a0a0c] shadow-2xl`，分 header / body / footer 三段，header 含图标标题 + `X` 关闭。

### 6.6 内容类型 Tab（素材筛选）
- 横向一排：全部 / 图片 / 视频 / 3D / 工业 / 文档 / 音频；
- active：`bg-[#00ff00]/15 text-[#00ff00] font-semibold`；未选 `text-zinc-400 hover:text-zinc-200`。

### 6.7 徽章 / 角标 / 状态点
- 计数胶囊：`rounded-full bg-[#00ff00]/20 px-1 text-[9px]`。
- 角色/状态徽章：`rounded border px-1.5 py-0.5 text-[10px] font-mono`，管理员=绿，普通=灰。
- 状态圆点：`w-1.5 h-1.5 rounded-full animate-pulse`（如绿色在线点）。

---

## 7. 图标（Iconography）
- 统一用 **lucide-react**，线性风格，常用尺寸 `12 / 14 / 16`。
- 高亮态图标着品牌绿；默认 `text-zinc-400/500`。

---

## 8. 动效（Motion）
- 引入 `motion`（framer-motion）做 Toast 进出场（fade + slide + scale，duration 0.2 easeOut）。
- 大量 `transition-colors` 表达 hover/active；`ChevronDown` 旋转、缩略图 `scale-105`、状态点 `animate-pulse`。
- 自定义发光类：`.glow-green`（文字辉光）、`.glow-box`、`.glow-btn:hover`（绿色辉光，box-shadow rgba(0,255,0,...)）。

---

## 9. 主题切换机制（Theming）
- 根元素挂 `light` / `dark` class（`App.tsx` 第 ~185 行控制），存 `localStorage['art-launcher-theme']`，默认 `dark`。
- **暗色为基准**：组件直接写暗色 token；**浅色靠全局覆盖**——`src/index.css` 的 `.light` 作用域里大量 `.light .bg-[#xxxxxx] { ... !important }` 把暗色 hex 重映射为浅色等价值（背景、边框、文字、translucent 变体、hover、品牌绿→`#00C800` 等）。
- 新增暗色 token 后若浅色下显示异常，需在 `.light` 段补对应覆盖规则（含 `/40`、`/60` 等透明度变体）。
- 滚动条、侧栏渐隐遮罩等也按主题分别定义。

---

## 10. 滚动条
- 全局细滚动条 6px，track `#09090b`，thumb `#27272a`，hover 变品牌绿。
- 侧栏折叠态隐藏滚动条 + 底部渐隐提示（`.sidebar-scroll-fade`）。

---

## 附：文件索引
- 样式与主题：`src/index.css`（1126 行，含全部 `.light` 覆盖）
- 主题/布局/Toast/日志：`src/App.tsx`
- 左导航：`src/components/Sidebar.tsx`
- 素材库（最大模块，含筛选/图搜/目录树）：`src/components/AssetLibrary.tsx`
- 应用与拓展：`src/components/AppManager.tsx` + `ExtensionManager.tsx`
- 权限管理：`src/components/PermissionManager.tsx`
- 缓存与设置：`src/components/SettingsPanel.tsx`
- 数据模型：`src/types.ts`；Mock 数据：`src/data.ts`
- 既有需求文档：`docs/素材库模块-需求文档.md`、`docs/asset-library-requirements-reverse.md`
