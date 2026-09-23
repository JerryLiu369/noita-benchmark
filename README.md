# NOITA AI ARENA · Autonomous SWE Agent Benchmark

[![Online Arena](https://img.shields.io/badge/Live_Arena-noita.myai1010.top-amber?style=for-the-badge&logo=google-chrome&logoColor=white)](https://noita.myai1010.top/)
[![PRs Welcome](https://img.shields.io/badge/Pull_Requests-9_Models-blue?style=for-the-badge&logo=github)](https://github.com/JerryLiu369/noita-benchmark/pulls)
[![Zero Build](https://img.shields.io/badge/Stack-Vanilla_JS_%2B_Canvas_2D-emerald?style=for-the-badge)](https://noita.myai1010.top/)

> **全自主大模型编程长跑基准评测**：评测前沿大语言模型与 Coding Agents 在「可破坏像素物理 + 炼金化学反应 + 径向动态光照 + 无头真机实测」极高复杂度要求下的自主架构设计、多轮工程实现与闭环验证能力。

---

## 🎮 线上对决试玩擂台 (Live Arena)

所有参赛模型在独立沙盒中自主运行生成的完整游戏产物，均已在云端全量部署上线：

👉 **官方对决擂台**：**[https://noita.myai1010.top/](https://noita.myai1010.top/)**

无需任何本地环境，点击即可直接在浏览器中秒开试玩各个模型生成的独立完整作品！

---

## 🏆 参赛模型与 Pull Requests 成果总览

本基准共汇聚了来自 **OpenAI、Anthropic (LM Arena)、DeepSeek、StepFun (阶跃星辰)、Xiaomi MiMo、Google 与开源贡献者** 的 9 款前沿模型。所有模型的独立分支与实现细节均已通过 Pull Request 提交：

| 排名 / 阵营 | 参赛模型 | 作品名称 | 线上直达试玩 | 对应 PR | 总 Tokens | Cache 命中率 | 官方折算总价 | 核心技术亮点 |
|:---|:---|:---|:---|:---|:---:|:---:|:---:|:---|
| 👑 **标杆旗舰** | **GPT-6-Astra** | **《深井余烬》** <br>`EMBER DEEP` | [▶ 试玩 Astra](https://noita.myai1010.top/astra/) | [#3](https://github.com/JerryLiu369/noita-benchmark/pull/3) | 1,465 万 | 92.2% | ~$30.58 USD | 首创 38 种材料分层、热力传导、法杖连锁组装、动态径向洞穴光晕 |
| 🛡️ **盲测绝杀** | **Arena 2** <br>*(极大概率 Claude 3.7)* | **《余烬之下》** <br>`EMBER BELOW` | [▶ 试玩 Arena 2](https://noita.myai1010.top/arena-2/) | [#2](https://github.com/JerryLiu369/noita-benchmark/pull/2) | — | — | 盲测对决 | 48 项 Playwright 全绿，材料流体极其细腻，空间探索与法杖连击超群 |
| 🌟 **求索巨构** | **DeepSeek-V4.1-Flash** | **《求索深渊》** <br>`DEEP CHASM` | [▶ 试玩 DS41](https://noita.myai1010.top/ds41/) | [#4](https://github.com/JerryLiu369/noita-benchmark/pull/4) | 6,943.5 万 | 98.7% | ¥8.27 <br>(~$1.20) | **47 种材料（全场之最）**，4000 行 6 模块分治拼装，超长程流体压测 |
| ✨ **阶跃旗舰** | **Step-5-Preview** | **《阶跃炼金》** <br>`STEP5 ALCHEMIST` | [▶ 试玩 Step5](https://noita.myai1010.top/step5/) | [#5](https://github.com/JerryLiu369/noita-benchmark/pull/5) | 3,555.3 万 | 93.6% | ¥30.06 <br>(~$4.36) | 36 种材料，14 弹体 14 修饰，烧/溺/压/毒/砍 5 大死因全真机捕获 |
| 🔮 **谷歌极速** | **Gemini-3.8-Flash** | **《双子炼金》** <br>`GEMINI ALCHEMIST` | [▶ 试玩 Gemini](https://noita.myai1010.top/gemini/) | [#9](https://github.com/JerryLiu369/noita-benchmark/pull/9) | 1,161.7 万 | 72.0% | ¥6.03 <br>(~$0.87) | 首创深渊巨蠕虫实时啃穿岩壁、终焉之眼三阶段 Boss 战、原生合成音效 |
| 💎 **小米旗舰** | **MiMo-V2.6-Pro** | **《像素炼金地牢》** <br>`PIXEL ALCHEMIST PRO` | [▶ 试玩 MiMo Pro](https://noita.myai1010.top/mimo-pro/) | [#6](https://github.com/JerryLiu369/noita-benchmark/pull/6) | 3,470 万 | 95.8% | ¥5.79 <br>(~$0.84) | 21/21 单测全绿，180 秒无头下井真人存活模拟，实机截图光照微调 |
| ⚡ **开源极速** | **MiMo-V2.6-Flash** | **《像素炼金》** <br>`PIXEL ALCHEMIST` | [▶ 试玩 MiMo Flash](https://noita.myai1010.top/mimo-flash/) | [#7](https://github.com/JerryLiu369/noita-benchmark/pull/7) | 1,794 万 | 96.2% | ¥1.25 <br>(~$0.18) | 34 种元胞物理材料，110KB 极速纯原生引擎，自建 CDP 自动化通关 |
| ⚡ **开源贡献** | **Muse-Spark-1.3** | **《灰烬竖井》** <br>`ASHFALL` | [▶ 试玩 Muse](https://noita.myai1010.top/muse/) | [#8](https://github.com/JerryLiu369/noita-benchmark/pull/8) | 614.3 万 | 97.1% | ¥4.10 <br>(~$0.59) | 26 种材料，牌库式法杖结算，6 层地牢 + 5 圣所祝福，11 项单测全绿 |
| 🗡️ **盲测先锋** | **Arena 1** <br>*(匿名模型 A)* | **《烬渊》** <br>`EMBERDEEP` | [▶ 试玩 Arena 1](https://noita.myai1010.top/arena-1/) | [#1](https://github.com/JerryLiu369/noita-benchmark/pull/1) | — | — | 盲测对决 | 480×270 复古点阵射击，30 种材质 32 项手搓规则，节奏紧凑凌厉 |

---

## 🎯 统一评测提示词与启动指令 (Evaluation Prompt & Runner Commands)

为确保纯粹客观的基准对照，本评测对所有模型均使用**完全一致、单轮直发、无人工干预**的标准启动提示词：

> **统一启动提示词 (Prompt Text)**：
> ```text
> 请仔细研读仓库内的 TASK.md 与 refs/ 资料，自主将当前游戏全面重做为机制高还原、画面与物理完备的 Noita 网页像素游戏，并在完成后编写 DONE.md 说明。
> ```

每个模型均在专属隔离沙盒中自主运行，具体 CLI 启动脚本与规格细节请查阅完整文档：
- 📄 **[评测启动指令与提示词规范完整说明 (PROMPT.md)](./PROMPT.md)**
- 📋 **[沙盒任务规格与红线说明书 (TASK.md)](./TASK.md)**

---

## 🧪 新模型标准评测接入流程 (Standard Evaluation & Anti-Leak Workflow)

为保证所有参赛模型处于**绝对公平、无历史污染、防提示词泄密（Anti-Cheating）**的盲测环境中，评测一个全新模型必须严格遵守以下四步流水线：

```
[1. 克隆并剥离元数据]  git clone -> 彻底删除 .git 和 README.md -> 保留纯净沙盒
        │
[2. 单轮盲测启动]     传入统一 PROMPT -> Agent 自主阅读 TASK.md 与 refs/ 攻坚
        │
[3. 交付物与门禁核验]  必须具备 DONE.md + Headless 真机实测验证通过
        │
[4. 外部受控提交 PR]  由人类或外部看门狗将产物挂载至全新分支并提交 PR
```

### 1. 为什么必须删掉 `.git` 和 `README.md`？
- **防分支与提交窥探（No Git History Leak）**：
  若保留 `.git`，高阶 Agent 在探索环境时极易执行 `git log`、`git branch -a` 或翻阅 stash，从而调取其他顶尖模型的提交历史、代码 diff 与解题策略；
- **防题面与战报泄露（No Benchmark Spoiling）**：
  `README.md` 记录了所有已完赛模型的架构亮点、PR 链接与材料数量（如“DeepSeek 做了 47 种材料”、“Astra 做了法杖连锁”）。若保留此文件，模型会直接提取其他模型的总结进行套话抄袭，丧失“第一性原理从零设计”的评测价值。
- **沙盒内仅保留**：`TASK.md`（原始任务书）、`refs/`（原作离线参考维基与实机图）、初始极简游戏原型（`index.html` + `game.js` + `report-source.md`）。

### 2. 标准自动化启动脚手架
```bash
# 1. 准备沙盒
git clone https://github.com/JerryLiu369/noita-benchmark.git /tmp/eval-new-model
cd /tmp/eval-new-model

# 2. 剥离 Git 元数据与主站战报 (关键防作弊步骤)
rm -rf .git README.md

# 3. 传入标准统一 Prompt 单轮直发
PROMPT="请仔细研读仓库内的 TASK.md 与 refs/ 资料，自主将当前游戏全面重做为机制高还原、画面与物理完备的 Noita 网页像素游戏，并在完成后编写 DONE.md 说明。"
opencode run --agent bypassPermissions -m "<PROVIDER>/<NEW_MODEL>" "$PROMPT"
```

### 3. 外部提交 PR 规程 (Prevent Direct Write)
严禁将带写权限的 GitHub Token 注入受试 Agent 的沙盒环境。待模型打出 `DONE.md` 并完成真机实测后，由评测员在外部干净仓库中开辟分支 `bench/<model-name>`，提取修改文件完成提交与 PR 发起。

---

## 📋 评测规格与硬核约束 (Task Specification)

不同于常规只测几十行代码函数修复的 `SWE-bench`，本 Benchmark 专为**长程自主系统工程（Long-Horizon Autonomous SWE）**设计。

智能体在入场时仅拿到一份任务说明书（`TASK.md`）和未整理的原作离线资料库（`refs/`），必须在完全零人工干预下满足以下约束：

1. **纯前端零构建要求**：
   - 仅限 `index.html` + `game.js` + `styles.css`，零构建步骤（No Vite / Webpack / Babel）、零 npm 依赖、无后端、不请求任何外部 CDN 或音频图片素材。
2. **像素元胞物理模拟 (Falling-sand CA)**：
   - 实现 $\ge 20$ 种物理材料；严格遵循物理密度分层（油浮水上、血沉水下、强酸蚀万物、熔岩凝结为石并爆裂出上升水汽）。
3. **黑暗氛围与动态径向光照**：
   - 洞穴全黑压暗，仅由提灯、火把、荧光矿物与法术弹体以径向渐变算法柔和点亮。
4. **法杖连锁与魔力构筑系统**：
   - 实现弹体（Projectiles）、修饰符（Modifiers）与触发器（Triggers）的链式读取逻辑，支持圣山/工作台交互式组装与魔力消耗核算。
5. **死因追溯因果闭环**：
   - 严禁模糊死亡，必须在结算面板精确断言致死因果（如被烈火烧死、溺亡、落石压死、强酸腐蚀、被特定敌人击杀等）。
6. **无头浏览器真实端到端实测**：
   - 模型在交卷前必须自主编写测试脚本，使用 Headless Chrome（CDP 或 Playwright）驱动游戏运行数千帧，验证无 JS 报错、无掉帧与逻辑全绿后方可书写 `DONE.md`。

---

## 🚀 本地快速运行任意模型成果

任意克隆对应分支，即可在本地秒开体验：

```bash
# 1. 克隆仓库
git clone https://github.com/JerryLiu369/noita-benchmark.git
cd noita-benchmark

# 2. 切换到你想体验的模型分支 (例如 DeepSeek-V4.1-Flash)
git checkout bench/deepseek-v4.1-flash

# 3. 启动本地纯静态服务器
python3 -m http.server 4173

# 4. 在浏览器中打开
# http://localhost:4173/
```

---

## 📄 License & Attribution

- 机制灵感源自 Nolla Games 开发的经典游戏《Noita》；
- 本基准测试中的所有参赛代码、美术点阵、自研物理引擎与合成音效均为各 AI 模型在沙盒中自主原创生成，未引用原版专有资产。
