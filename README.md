# langLearn

面向大学英语四六级（CET-4 / CET-6）的英语学习应用：背单词、题型练习、AI 助记与批改。

- **网页版**：适配手机、iPad 和电脑，纯静态页面，部署在 GitHub Pages：<https://hunterchan-sr.github.io/lang_learn/>
- **桌面版**：macOS / Windows，在 [Releases](https://github.com/HunterChan-SR/lang_learn/releases/latest) 下载
- **VS Code 插件**：界面长得像在写代码，也在 Releases 下载（`.vsix`），Cursor、Trae 等基于 VS Code 的编辑器也能装
- **代码皮肤**：网页版也可以切换成代码编辑器的样子，适合在 VS Code 内置浏览器里打开：<https://hunterchan-sr.github.io/lang_learn/?skin=code>

## 功能

- **今日学习**：每天按目标学习新词，并按记忆曲线安排复习（简化版 SM-2 间隔重复）
  - 卡片先显示单词，回想后查看释义，再按“忘记了 / 模糊 / 认识 / 太简单”评分
  - 选“忘记了”的词会在几张卡片之后再出现一次
  - 间隔达到 21 天算作“已掌握”
- **词库**：四级 3846 词，六级新增 1956 词（不含四级词），按词频排序，常用词在前
  - 支持搜索英文或中文、按状态筛选
- **单词卡**：释义、词形变化之外，还有真实例句（目标词高亮，点击朗读）、常用短语、词根词缀与同根词、近义词辨析、英英释义、柯林斯星级和牛津核心词标记
- **AI 助记**：单词旁边的「AI 助记」按钮，让大模型生成助记方法、四六级难度例句、常用搭配、近义辨析、词族和考点；已有内容时再点一次会重新生成。结果缓存在本机
- **测验**：看词选义、看义选词、例句填空、看义拼写、听音拼写五种题型，题目可以来自今日单词、已学单词、错题本、生词本或整个词库
- **题型练习**：按 2013 年改革后的四六级真题结构，四级、六级分开
  - 听力（新闻、长对话、短文、讲座）：设备语音朗读，男女声区分，读完原文后读题；可调语速、显示原文
  - 选词填空、长篇阅读（段落匹配）、仔细阅读：自动判分，附中文解析；配置 AI 后可以让 AI 详细讲解错题
  - 翻译、写作：AI 按四六级评分标准打 15 分制分数，逐条指出问题并给出修改版本；未配置 AI 时显示参考译文/范文
  - 文章中的单词都可以点击查看释义
  - 内置 30 套原创题目，配置 AI 后可以无限出新题，并优先用上你最近学的单词
  - 记录每次成绩，统计各题型正确率，提示薄弱题型（练习记录随账号同步）
- **模拟整卷**：按真题顺序（写作 → 听力 → 阅读 → 翻译）组卷，逐部分作答，最后按真题分值比例折算成 710 分制
- **错题本 / 生词本**：测验答错自动加入错题本，连续答对 2 次后自动移出；学习时点 ☆ 可以收藏单词
- **发音**：美音或英音；音源可选系统语音（离线可用）或有道在线发音
- **统计**：今日进度、连续打卡天数、最近 7 天学习量
- **数据**：进度保存在浏览器 localStorage，登录后自动同步到云端；支持导出和导入 JSON
- **体验**：响应式布局（手机底部导航，iPad/PC 侧边导航），深色模式，键盘快捷键，支持添加到主屏幕
- **代码皮肤**：整个界面伪装成代码编辑器——首页是 `today.ts`，背单词是 `session.ts`（释义藏在 `meaning` 里，评分按钮是 CodeLens），测验是 `quiz.test.ts`（答对答错显示为测试通过/失败），词库是 `words.json`，练习是 Markdown 预览，设置页是 Settings。在「我的 → 界面」切换，或打开带 `?skin=code` 的网址；按设备记住，不随进度同步。代码皮肤下默认不自动发音

### 快捷键（电脑 / iPad 外接键盘）

| 按键 | 学习页 | 测验页 |
|---|---|---|
| 空格 / 回车 | 查看释义；已显示释义时等于“认识” | 回车：下一题 |
| 1–4 | 评分 | 选择选项 |
| R | 朗读 | — |
| S | 加入或移出生词本 | — |
| Esc | 退出 | 退出 |

## AI 助手

在「我的 → AI 助手」里填写大模型服务商、API Key 和模型名即可使用，不配置也不影响其他功能。

- 内置预设：DeepSeek、通义千问、豆包（火山方舟）、硅基流动、OpenRouter、OpenAI、Claude、本机 Ollama，也可以填任意 OpenAI 兼容接口
- 可以一键获取服务商的模型列表，并测试连接
- 浏览器直接调用服务商接口，不经过任何中转服务器；API Key 只保存在当前设备的 localStorage，不会同步到云端，也不会随进度导出
- Kimi、智谱 GLM、Gemini 的官方接口不允许网页跨域调用，可以通过 OpenRouter 或硅基流动使用这些模型

## 桌面版

桌面版用 [Electron](https://www.electronjs.org/) 打包，和网页版是同一套代码（`desktop/` 下是桌面端特有的部分），另外：

- 网页文件打包在应用里，离线可用
- AI 请求由应用转发，不受浏览器跨域限制，Kimi、智谱 GLM、Gemini 的官方接口也能直接用
- GitHub 登录在系统浏览器中完成，授权后通过 `cet-words://auth-callback` 回到应用
- 启动时检查 GitHub Releases，有新版本会提示下载

安装包没有代码签名证书，首次打开时：macOS 到 **系统设置 → 隐私与安全性** 点 **仍要打开**（提示“已损坏”时运行 `xattr -cr /Applications/langLearn.app`）；Windows 在 SmartScreen 提示里点 **更多信息 → 仍要运行**。

**登录需要一次性配置**：在 Supabase 后台 **Authentication → URL Configuration → Redirect URLs** 中添加 `cet-words://auth-callback`。

### 开发与发版

```bash
npm run desktop        # 构建网页并用 Electron 打开
npm run desktop:dist   # 打包当前系统的安装包到 release/
```

推送 `v*` 标签时，GitHub Actions（`.github/workflows/release.yml`）会在 macOS 和 Windows 上打包，并自动创建 Release：

```bash
npm version patch      # 或 minor / major：修改 package.json 版本并打上 v 开头的标签
git push --follow-tags
```

产物：`langLearn-<版本>-mac-arm64.dmg`（Apple 芯片）、`langLearn-<版本>-mac-x64.dmg`（Intel）、`langLearn-<版本>-win-x64-setup.exe`，以及 VS Code 插件 `langLearn-<版本>-vscode.vsix`。

## 登录与多设备同步

使用 [Supabase](https://supabase.com) 免费版：**GitHub 登录**，进度存在 `progress` 表（每个用户一行），通过 RLS 保证每个人只能读写自己的数据。

- 未登录时照常使用，进度只存在本机；登录后会自动合并本机和云端的进度
- 同步时机：登录后、学习过程中（停止操作 3 秒后）、切回页面时、网络恢复时
- 多台设备的合并规则：同一个单词以最近一次复习为准；生词本、错题本按时间合并，删除也会同步；“重置进度”和“导入进度”会整体覆盖其他设备
- 退出登录会清空本机进度（云端保留），避免共用设备时串号
- 只允许已开通的 GitHub 账号登录：Supabase 关闭了公开注册，陌生账号登录会被拒绝

### 初始化（只需一次）

1. Supabase 后台 **SQL Editor** 执行 [`supabase/schema.sql`](supabase/schema.sql)
2. GitHub **Settings → Developer settings → OAuth Apps → New OAuth App**：
   - Homepage URL：`https://<用户名>.github.io/<仓库名>/`
   - Authorization callback URL：`https://<项目ref>.supabase.co/auth/v1/callback`
3. Supabase **Authentication → Sign In / Providers → GitHub**：启用，并填入 OAuth App 的 Client ID 和 Client Secret
4. Supabase **Authentication → URL Configuration**：
   - Site URL：`https://<用户名>.github.io/<仓库名>/`
   - Redirect URLs：添加 `https://<用户名>.github.io/<仓库名>/`、`http://localhost:5173/`、`http://localhost:4173/`
5. 修改 `src/lib/supabase.ts` 中的项目地址和 publishable key（或设置环境变量 `VITE_SUPABASE_URL` / `VITE_SUPABASE_KEY`）

### 开通账号

Supabase 关闭公开注册后，新的 GitHub 账号无法登录。开通方法：

1. 临时打开 **Authentication → Sign In / Providers → Allow new users to sign up**
2. 让对方在网页上用 GitHub 登录一次
3. 立即关掉注册开关

查看或删除账号（需要 secret key，写在已被 git 忽略的 `.env.local` 里，**不要提交 secret key**）：

```bash
echo "SUPABASE_SECRET_KEY=sb_secret_xxx" > .env.local
npm run users -- list                  # 查看所有账号
npm run users -- del <GitHub用户名>    # 删除账号（云端进度一起删除）
```

### 防止免费项目被暂停

Supabase 免费项目连续 7 天无活动会被暂停。`.github/workflows/keepalive.yml` 每 3 天访问一次数据库保持活跃。公开仓库 60 天没有新提交时，GitHub 会停用定时任务，到 Actions 页面重新启用即可。

## VS Code 插件

`vscode/` 目录。插件在编辑器标签页（webview）里运行同一套网页，固定使用代码皮肤，另外：

- 标签页标题和图标跟着页面变成 `today.ts`、`session.ts`、`words.json`……，界面使用当前编辑器的主题颜色和字体
- 资源管理器里有一组 LangLearn “文件”，点击打开对应页面
- 状态栏轮流显示正在学习的单词（设置 `langLearn.ticker.*`）
- 老板键 `Alt+Q`：切到工作区里的代码文件（没有就打开一段示例代码），停止发音，隐藏状态栏单词；再按一次切回来
- 学习进度保存在 VS Code 里，API Key 和登录凭据保存在系统钥匙串；AI 和同步请求由插件转发，不受跨域限制，内网和本机接口也能用
- GitHub 登录在系统浏览器中完成，授权后回到编辑器。**需要在 Supabase 的 Redirect URLs 中添加** `vscode://hunterchan.langlearn/auth-callback`（Cursor、Trae 等编辑器把开头换成 `cursor://`、`trae://`）

```bash
npm run vscode:package   # 构建网页并打包插件到 release/langLearn-<版本>-vscode.vsix
code --install-extension release/langLearn-<版本>-vscode.vsix
```

插件随桌面版一起在推送 `v*` 标签时自动打包发布；`npm version` 会同步 `vscode/package.json` 的版本号。

## 开发

```bash
npm install
npm run dev        # 本地开发，--host 已开启，同一局域网的手机/iPad 可以直接访问
npm test           # 单元测试（记忆算法、出题、队列、同步合并）
npm run build      # 类型检查并构建到 dist/
npm run preview    # 预览构建结果
```

技术栈：React 19 + TypeScript + Vite，没有额外的 UI 或路由依赖。

```
src/
  lib/          # 与界面无关的逻辑
    srs.ts        记忆算法（间隔重复）
    session.ts    每日学习队列
    quiz.ts       出题
    store.ts      数据存储（localStorage），以后接入云同步只需要改这里
    books.ts      词库加载和文本处理
    speech.ts     发音
    extras.ts     单词卡增强资料（例句、短语、词根、辨析）
    ai.ts         大模型接入（OpenAI 兼容 / Anthropic）
    aiNotes.ts    AI 助记
    practice.ts   题型练习：题目结构、校验、判分
    practiceAI.ts AI 出题、批改、讲解
    listen.ts     听力朗读
    router.ts     hash 路由
    host.ts       运行环境（网页 / 桌面版 / VS Code 插件）相关的能力
    skin.ts       界面皮肤（默认 / 代码）
  components/   # 通用组件
  pages/        # 首页、学习、测验、练习、词库、我的
  code/         # 代码皮肤：把首页、学习、测验、词库画成代码
desktop/        # 桌面版（Electron）主进程和预加载脚本
vscode/         # VS Code 插件
build/          # 桌面版图标
public/data/    # 词库 JSON；x/ 下是按首字母分片的单词增强资料；practice/ 下是内置练习题
scripts/        # 数据生成脚本
```

## 部署到 GitHub Pages

1. 在 GitHub 新建仓库并推送代码到 `main` 分支
2. 仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**
3. 之后每次推送都会自动测试、构建并发布，地址是 `https://<用户名>.github.io/<仓库名>/`

项目使用相对路径（`base: './'`）和 hash 路由，部署在根目录或子路径都可以，刷新任何页面也不会 404。

> 免费的 GitHub 账号只能从公开仓库发布 Pages。

## 词库数据

词库由开源词典 [ECDICT](https://github.com/skywind3000/ECDICT)（MIT 协议，见 `public/data/ECDICT-LICENSE.txt`）生成：根据 `tag` 字段中的 `cet4` / `cet6` 标签筛选，按 COCA/BNC 词频排序，并做了以下清洗：音标换成标准 IPA 字符，合并同一词性下的重复义项，去掉网络释义和专业领域释义。

重新生成：

```bash
# 下载 ecdict.csv（约 66MB）
curl -L -o ecdict.csv https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv
npm run wordlist -- ecdict.csv
```

词库 JSON 的格式是 `[单词, 音标, 释义(多行用 \n 分隔), 词形变化?]`，替换成其他来源的数据时保持这个格式即可。

单词卡的增强资料（`public/data/x/`）由 `scripts/build-extras.mjs` 生成：

- 例句：[Tatoeba](https://tatoeba.org) 中英句对（CC-BY 2.0 FR），经 [manythings.org](https://www.manythings.org/anki/) 整理，繁体译文用 OpenCC 转为简体；按句子长度挑选，每词最多 3 句
- 常用短语：ECDICT 中的短语词条，按在例句库中的出现次数筛选
- 词根词缀、近义词辨析：ECDICT 仓库附带的 `wordroot.txt` 和 `resemble.txt`
- 英英释义、柯林斯星级、牛津核心词：ECDICT

```bash
curl -L -O https://www.manythings.org/anki/cmn-eng.zip && unzip cmn-eng.zip cmn.txt
curl -L -O https://raw.githubusercontent.com/skywind3000/ECDICT/master/wordroot.txt
curl -L -O https://raw.githubusercontent.com/skywind3000/ECDICT/master/resemble.txt
npm run extras -- --ecdict ecdict.csv --roots wordroot.txt --resemble resemble.txt --tatoeba cmn.txt
```

## 后续计划

- [x] 账号登录与多设备同步（Supabase）
- [x] 例句、词根、辨析等单词增强资料，AI 助记
- [x] 听力、阅读、翻译、写作等专项练习
- [x] 桌面版（macOS / Windows），推送标签自动发布
- [x] 代码皮肤和 VS Code 插件
- [ ] PWA 离线缓存

## 开源协议

本项目代码以 [MIT 协议](LICENSE) 开源。

词库数据来自 [ECDICT](https://github.com/skywind3000/ECDICT)，同样采用 MIT 协议，版权声明见 `public/data/ECDICT-LICENSE.txt`。例句来自 [Tatoeba](https://tatoeba.org)，采用 [CC-BY 2.0 FR](https://creativecommons.org/licenses/by/2.0/fr/) 协议。
