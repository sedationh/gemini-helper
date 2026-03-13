# Gemini Helper

一个 Tampermonkey 用户脚本，增强 [Gemini](https://gemini.google.com) 的使用体验。部分功能移植自 [Gemini Voyager](https://github.com/nicepkg/gemini-voyager) 浏览器扩展。

**Greasy Fork:** <https://greasyfork.org/en/scripts/569478-gemini-helper>

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)（Chrome / Edge / Firefox / Safari）
2. 从 [Greasy Fork](https://greasyfork.org/en/scripts/569478-gemini-helper) 一键安装，或打开 `gemini-helper.user.js` 在 Tampermonkey 弹窗中点击 **安装**
3. 访问 [gemini.google.com](https://gemini.google.com)，所有功能自动生效

## 功能

### 1. 复制时去除美元符号

Gemini 在渲染 LaTeX 公式时会使用 `$` 分隔符。复制含公式的文本时，剪贴板中会混入 `$` 和 `\` 转义字符。

该功能拦截所有复制操作（选中复制、`navigator.clipboard.writeText`、`navigator.clipboard.write`），自动去除 `$` 符号并将 `\min` 等反斜杠命令还原为 `min`。

**处理前：** `$dp[i] = \min(dp[i], dp[i - coin] + 1)$`
**处理后：** `dp[i] = min(dp[i], dp[i - coin] + 1)`

无需配置，始终生效。

---

### 2. 聊天宽度调节

自由调整聊天内容宽度，尤其适合宽屏显示器。

- 右下角会出现一个浮动 `↔` 按钮
- 点击后展开控制面板：
  - **开关** — 启用 / 禁用宽度覆盖
  - **滑块** — 在 30% 到 100% 屏幕宽度之间调节
- 设置跨会话持久化（保存在 `localStorage`）
- 新消息加载时自动重新应用
- 支持暗色模式

---

### 3. 默认模型

不再每次手动切换 — 自动锁定你偏好的模型。

- 打开模型选择菜单，每个模型名称旁会出现一个 **★ 星标按钮**
- 点击星标将该模型设为默认
- 每次新对话（`/app` 或 `/gem/*`）时，脚本自动：
  1. 检测当前模型
  2. 打开模型菜单
  3. 切换到你的默认模型
  4. 聚焦聊天输入框
- Flash/Fast 模型会被跳过（Gemini 已默认使用）
- 再次点击星标可取消默认
- Toast 通知确认操作
- SPA 路由跳转无需刷新页面

---

### 4. 时间线导航

长对话的可视化导航，一目了然。

- 屏幕右侧边缘出现一条垂直 **时间线**
- 每个 **圆点** 代表对话中的一条用户消息
- **活跃圆点**（绿色圆环）指示当前可见的消息
- **点击**圆点可平滑滚动到对应消息
- **悬浮**到时间线区域时，弹出预览面板，展示所有消息摘要列表
  - 列表中高亮当前活跃消息
  - 点击列表项可快速跳转
- 新消息添加时自动更新
- 自适应 Gemini 的亮色 / 暗色主题
- 仅在对话路由（`/app`、`/gem/*`）下显示
- 离开对话页面时自动清理

---

## 数据存储

所有设置保存在 `localStorage`，使用以下键名：

| 键名 | 说明 |
|------|------|
| `geminiHelperSettings` | 聊天宽度的启用状态和百分比 |
| `geminiHelperDefaultModel` | 星标默认模型（`{id, name}`） |

不发起任何外部网络请求，数据不会离开你的浏览器。

## 许可证

MIT
