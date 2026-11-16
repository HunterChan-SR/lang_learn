# 四六级单词

面向大学英语四六级（CET-4 / CET-6）的背单词 H5 应用，适配手机、iPad 和电脑，纯静态页面，可以直接部署到 GitHub Pages。

## 功能（v0.1）

- **今日学习**：每天按目标学习新词，并按记忆曲线安排复习（简化版 SM-2 间隔重复）
  - 卡片先显示单词，回想后查看释义，再按“忘记了 / 模糊 / 认识 / 太简单”评分
  - 选“忘记了”的词会在几张卡片之后再出现一次
  - 间隔达到 21 天算作“已掌握”
- **词库**：四级 3846 词，六级新增 1956 词（不含四级词），按词频排序，常用词在前
  - 支持搜索英文或中文、按状态筛选、查看单词详情和词形变化
- **测验**：看词选义、看义选词、拼写三种题型，题目可以来自今日单词、已学单词、错题本、生词本或整个词库
- **错题本 / 生词本**：测验答错自动加入错题本，连续答对 2 次后自动移出；学习时点 ☆ 可以收藏单词
- **发音**：美音或英音；音源可选系统语音（离线可用）或有道在线发音
- **统计**：今日进度、连续打卡天数、最近 7 天学习量
- **数据**：进度保存在浏览器 localStorage，支持导出和导入 JSON
- **体验**：响应式布局（手机底部导航，iPad/PC 侧边导航），深色模式，键盘快捷键，支持添加到主屏幕

### 快捷键（电脑 / iPad 外接键盘）

| 按键 | 学习页 | 测验页 |
|---|---|---|
| 空格 / 回车 | 查看释义；已显示释义时等于“认识” | 回车：下一题 |
| 1–4 | 评分 | 选择选项 |
| R | 朗读 | — |
| S | 加入或移出生词本 | — |
| Esc | 退出 | 退出 |

## 开发

```bash
npm install
npm run dev        # 本地开发，--host 已开启，同一局域网的手机/iPad 可以直接访问
npm test           # 单元测试（记忆算法、出题、队列）
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
    router.ts     hash 路由
  components/   # 通用组件
  pages/        # 首页、学习、测验、词库、我的
public/data/    # 词库 JSON
scripts/        # 词库生成脚本
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

## 后续计划

- [ ] 账号登录与多设备同步（计划使用 Supabase：GitHub / 邮箱登录，配合 RLS 保存学习进度）
- [ ] 例句与真题语境
- [ ] 听力、阅读、翻译、写作等专项练习
- [ ] PWA 离线缓存
