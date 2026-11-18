# langLearn

在 VS Code 里背四六级单词。界面长得像在写代码，路过的人只会看到你在改 `today.ts`。

和网页版、桌面版共用同一套功能和账号：背单词（间隔重复）、测验、词库、题型练习、模拟考试、AI 助记和作文批改。

## 用法

- 命令面板（`Ctrl/Cmd+Shift+P`）运行 **langLearn: 打开**，或者点资源管理器里 **LANGLEARN** 分组下的文件。
- 标签页的标题和图标会随页面变化：`today.ts`（首页）、`session.ts`（背单词）、`quiz.test.ts`（测验）、`words.json`（词库）、`Preview practice.md`（练习）、`Settings`（设置）。
- 界面自动使用当前编辑器的主题和字体。
- 背单词：`空格` 显示释义，`1`–`4` 评分，`R` 朗读，`S` 收藏，`Esc` 退出。代码风格界面默认不自动发音。

## 老板键

`Alt+Q`：立刻切到其他代码文件（没有就打开一段示例代码），停止发音，并隐藏状态栏单词。再按一次切回来。

可以在键盘快捷方式里搜索 `langLearn.boss` 改成别的键。

## 状态栏单词

状态栏右下角轮流显示正在学习的单词，点一下换一个，鼠标移上去显示完整释义。

| 设置 | 默认 | 说明 |
|---|---|---|
| `langLearn.ticker.enabled` | `true` | 是否显示 |
| `langLearn.ticker.interval` | `30` | 切换间隔（秒） |
| `langLearn.ticker.showMeaning` | `true` | 同时显示中文释义 |

也可以运行 **langLearn: 显示 / 隐藏状态栏单词** 临时关闭。

## 登录与数据

- 学习进度保存在 VS Code 里；登录 GitHub 后和网页版、桌面版、手机自动同步。
- 登录在系统浏览器中完成，授权后回到 VS Code。回调地址是 `vscode://hunterchan.langlearn/auth-callback`（Cursor、Trae 等编辑器开头换成各自的名字），需要加入 Supabase 的 Redirect URLs。
- AI 的 API Key 和登录凭据保存在系统钥匙串里。
- AI 请求由插件转发，不受浏览器跨域限制，内网和本机的接口也能直接用。

## 安装

从 [GitHub Releases](https://github.com/HunterChan-SR/lang_learn/releases/latest) 下载 `langLearn-<版本>-vscode.vsix`，然后在扩展视图右上角 `…` 菜单选择 **从 VSIX 安装…**，或者运行：

```bash
code --install-extension langLearn-<版本>-vscode.vsix
```

基于 VS Code 的编辑器（Cursor、Trae、Windsurf 等）同样可以安装。
