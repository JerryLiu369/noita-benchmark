# 研究与实现记录 · 余烬之下

更新：2026-09-21。先阅读 `TASK.md`、旧版说明及 `refs/` 全部文本资料，查看全部图片与三段本地视频画面，再重写运行时。本文替代旧版中不再适用的“八层、四把初始杖”等说明。参考文件保持原样。

## 1. 资料清单与可靠性

共 **23 篇 Wiki 文件、12 份检索摘要、14 张图片、3 段视频**。文本阅读时去掉了重复链接、图片 URL 和重复行，但保留机制正文、表格与数值说明。图片制作联系表逐项查看；三段 MP4 均为约 15 秒片段，按秒抽帧覆盖片段全程，不把它们当作完整宣传片。

### Wiki 正文

- 材料与物理：`Materials.md`、`Table_of_Alchemical_Reactions.md`、`Damage.md`、`Explosion.md`、`Status_Effects.md`、`HP.md`。
- 法杖与编排：`Wand.md`、`Wands.md`、`Spells.md`；两份 Wand 内容大量重叠。
- 地形与生物：`Biomes.md`、`Enemies.md`、`Fungal_Caverns.md`、`Frozen_Vault.md`、`Perks.md`。
- **六个空条目**：`Game_Mechanics.md`、`Projectile_Spells.md`、`Spell_Modifiers.md`、`Spell_Types.md`、`Utility_Spells.md`、`Wand_Crafting.md` 均为导航及 “There is currently no text in this page”，不当作已验证的机制证据。
- **文件名错配**：`Golden_Mountain.md` 实际是 Perks 正文；`The_Coal_Pits.md` 实际是 Frozen Vault 正文。没有据此编造圣山布局或煤坑参数。
- **抓取错页**：`how_noita_s_pixel_simulation_creates_emergent_gameplay.md` 是 Game Developer 设计栏目文章目录，不是题名中的像素模拟技术文章。

### 检索摘要

逐项阅读 `biomes.txt`、`enemies.txt`、`feel_notes.txt`、`game_mechanics.txt`、`gems.txt`、`golden_mountain.txt`、`lighting.txt`、`materials.txt`、`reactions.txt`、`spells.txt`、`wand_ui.txt`、`wands.txt`。它们混有社区讨论、模组、检索噪声和不完整片段，仅作补充：例如 `golden_mountain.txt` 多是 The Gold / Mountain Altar，不能证明休整区完整布局；`gems.txt` 说明宝石通常是惰性物件，不是本项目必须加入的货币机制。

## 2. 机制证据 → 实现决策

| 依据 | 读到的关键关系 | 本次实现 |
|---|---|---|
| [Materials](refs/wiki/Materials.md) | 固体、液体、气体、粉末各有行为；液体看密度，地形破坏同时受耐久和硬度约束 | 20 个材料 ID、密度守恒交换、气体上浮、粉末下落、材质阈值与硬度衰减；逐 tick 标记防止单像素被重复更新 |
| [反应表](refs/wiki/Table_of_Alchemical_Reactions.md) | 熔岩与水 → 石和蒸汽；燃烧、融冰、酸腐蚀产气；反应是相邻材料关系 | 四邻域反应；持续接触燃料的火焰传播，有限寿命后成烟；酸消耗并产生毒气；热融冰与法术冻水 |
| [Wands](refs/wiki/Wands.md)、[Spells](refs/wiki/Spells.md) | 非乱序从左读；施法延迟和牌组充能不同；载荷预付魔力，触发时不再付费 | `readGroup()` 构造有序节点与递归载荷；独立回蓝、冷却、游标、洗牌；碰撞印、时砂印；界面显示分组和消耗 |
| 同上及 `wand_ui.txt` | 常规限制为休整区编辑，最多持有四杖；法杖是可更换容器 | 出生刻印台、层间刻印台、四杖上限、满位替换掉落旧杖、跨杖/背包拖放、触屏点选交换、远处只读 |
| [Biomes](refs/wiki/Biomes.md)、[Perks](refs/wiki/Perks.md) | 主线向下、层间休整、三项天赋选一、探索存在风险回报 | 按 TASK 要求改为五层原创路线，四个「烛息回廊」回血、商店及天赋，终层守卫与余烬交互结局 |
| [Fungal Caverns](refs/wiki/Fungal_Caverns.md)、[Frozen Vault](refs/wiki/Frozen_Vault.md) | 潮湿菌区有毒性、可燃物和危险敌人；冰雪区域有替换材质 | 孢光菌庭的酸池、毒雾和菌灯；苍白霜窟的冰、雪与冷色晶体；不同色调、密度和敌人强度 |
| [Creatures](refs/wiki/Enemies.md) | 地面、飞行、远程、挖穿地形等行为不同，视觉与危险需要可读 | 五种普通敌人，不使用原作名称；掘骨蠕虫真实挖掘；爆囊兽有闪烁引信；守卫有扇形弹幕 |
| [Damage](refs/wiki/Damage.md)、[HP](refs/wiki/HP.md)、[Status](refs/wiki/Status_Effects.md) | 环境伤害、持续状态、窒息、物理冲击、永久死亡；最大生命与治疗不是同一件事 | 湿、油、烧、毒、氧气、落石、自伤；血瓶治疗与天赋加生命区分；记录致命事件，展示具体死因 |
| [Explosion](refs/wiki/Explosion.md)、`feel_notes.txt` | 强力爆炸也危险；远程触发可降低自伤风险；像素变化应可感知 | 自伤、燃油桶连锁、击中闪白、抛射粒子、震屏、飘字和合成音效 |

**改编而非照搬**：材料密度和伤害数值为浏览器玩法近似；三岔复制后续单弹体而非原作全套抽牌行为；本作不实现原作的数百法术、秘密区域、阵营与全部炼金配方。空文件不用于推断这些高级机制。

## 3. 视觉研究

- `ss_00`：多种材料同时存在仍可分辨，场景留黑；采用蓝水、橙熔岩、红血、黄绿酸的分离色相。
- `ss_01`：巨大建筑对比小角色；采用小尺寸原创角色、背景柱廊与更大的终层守卫。
- `ss_02`：横向岩架被竖向裂隙串联；采用分层通道、侧室、可燃梁和下降裂隙，不再是一条均质窄井。
- `ss_03`：菌区有独特紫/青发光语言；实现菌灯、孢庭背景与柔紫色局部光。
- `ss_04`：冷暖远景层次与古老构筑物；转译为克制的矿架、门廊和原创刻印台，不复刻其建筑贴图。
- `ss_05`：休整区物件可读、信息密集而不遮住世界；编排采用薄金/绿边框，按功能分色的小图标与数字。
- `ss_06`：熔岩是强光源而非一条橙色线；熔池与炽核给邻近岩层实际补光。
- `ss_07`：冰窟冷色、尖锐轮廓、大量明亮法术粒子；实现冷色材质、冰晶、短命粒子爆裂，设置粒子预算保护性能。
- 另外六张预告片 JPG 逐项查看，其中两张 Early Access 图片接近全黑、两张 Snowy 图片主要为标题；它们不被用作细节贴图依据。
- 三段视频：1.0 片段能看到编排→组合释放的联系；Early Access 片段显示小角色、局部光源和大规模地形影响；Snowy 片段主要是雪地氛围/标题。采用其中的层次关系和交互节奏，不导入任何画面、音乐或角色素材。

## 4. 工程与验证边界

运行代码为三个同目录文件，所有图形由 Canvas/CSS/像素模板原创绘制，声音由 WebAudio 合成。60 Hz 角色/战斗，30 Hz 活动区材料；移动端按容器纵横比调整模拟视窗，而不是拉伸画面。无网络字体或图片请求。

测试中发现单像素火焰会先上浮、来不及点燃邻居，已改为接触燃料时附着传播，随后燃尽成烟；回归案例中 71 个剩余木像素全部燃尽，最终火像素为零。另修正了出生木柱阻路、重开残留提示、悬浮值可能微小为负等问题。

实际试玩记录、48 项回归结果、与夹具测试的明确区分见 [README](README.md) 和 [结构化记录](tests/validation-2026-09-21.json)。没有声称完成实体手机测试、音频听感测评或无辅助的五层通关。
