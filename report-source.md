# 本地参考资料研究与实现取舍

日期：2026-09-05。设计依据以本仓库 `TASK.md`、`refs/images/` 的实机截图和 `refs/wiki/` 的机制正文为先。游戏《深井余烬 / Ember Deep》的代码、像素角色、地形纹理、界面及合成音效均为原创；参考文件不作为运行时资源加载。

## 阅读范围

- `TASK.md` 和重做前的 `report-source.md`。
- `refs/` 的全部 12 份 TXT：biomes、enemies、feel_notes、game_mechanics、gems、golden_mountain、lighting、materials、reactions、spells、wand_ui、wands。
- `refs/wiki/` 的全部 23 份 Markdown：Biomes、Damage、Enemies、Explosion、Frozen_Vault、Fungal_Caverns、Game_Mechanics、Golden_Mountain、HP、Materials、Perks、Projectile_Spells、Spell_Modifiers、Spell_Types、Spells、Status_Effects、Table_of_Alchemical_Reactions、The_Coal_Pits、Utility_Spells、Wand、Wand_Crafting、Wands、how_noita_s_pixel_simulation_creates_emergent_gameplay。
- `refs/images/` 全部 14 张图：8 张官方实机截图及 6 张视频截帧。
- `refs/videos/` 的全部 3 段本地视频，每段 15 秒，使用逐秒联系表检查画面变化。这些是短片段，不能当作完整预告片。

## 图像分析

| 本地资料 | 画面观察 | 重做中的对应实现 |
| --- | --- | --- |
| `ss_02.jpg` | 暗色矿洞、多尺度成块岩纹、土壳、苔边、支撑木架、细小角色、橙色火光 | 不规则连通洞室，分层石纹与边缘高光，木架、吊绳，原创小尺寸像素角色 |
| `ss_03.jpg` | 真菌洞的青色与洋红发光植物、暗色根系、岩层与建筑混合 | 荧孢深林的双色菌伞、根系、酸池及局部发光 |
| `ss_05.jpg` | 水平休整室、砖墙与柱、编辑和购买区域、与危险洞穴形成节奏变化 | 静火驿站、完整恢复、三选一天赋、有限藏品与法杖编辑台 |
| `ss_07.jpg`、雪地视频截帧 | 冰雪冷色材质、明亮能量弹、寒冷洞室背景 | 霜裂冰窟、雪粉末、冰层与冷色火把 |
| `ss_00.jpg`、`ss_06.jpg` | 材料分层与危险液体、局部熔岩照明 | 油、水、血液的密度分层，熔岩照明与水反应 |
| `ss_01.jpg`、`ss_04.jpg`、其余有效视频帧 | 复杂洞穴轮廓、局部爆炸和密集短寿命粒子 | 保留主路径的随机支洞，命中闪光、爆裂粒子、短暂光照与震动 |

黑暗在独立透明画布上计算，径向光源从遮罩中扣除后再覆盖场景，避免在不透明主画布上擦除地形。低强度环境光保证边缘可读，火把、手持发光魔杖、法术、菌伞、火焰及熔岩提供局部光源。它是二维径向光照近似，没有实现完整逐像素遮挡或原作渲染器。

## 机制对照

| 资料 | 采用的机制 | 实现边界 |
| --- | --- | --- |
| Materials、反应表、materials.txt、reactions.txt | 固体、液体、粉末、气体；密度交换；火焰蔓延和耗尽；水灭火；水与熔岩生成石与蒸汽；酸蚀产生上升毒气 | 22 种网格状态；模拟摄像机附近及上下缓冲区域，远处材料休眠；内部材料可被酸腐蚀，世界边界保留 |
| Materials、Explosion | 固体的耐久破坏阈值与硬度消耗分开判断 | 弹体／爆炸具有破坏强度和能量预算；落石是简化的独立刚体，没有通用刚体引擎 |
| Wand、Wands、Spells、wands.txt、wand_ui.txt | 顺序读牌；修饰作用于后续弹体；触发载荷递归读取；载荷魔力预付；槽末充能采用最大值 | 4 个魔杖位，开局 2 把；固定容量；7 弹体、5 修饰、2 触发；仅非乱序魔杖，不实现原作全部抽牌／复制细则 |
| Wand、Spells | 命中触发、定时触发及碰撞提前触发；内层修饰独立于外层 | 触发携带下一个施法组，可嵌套；载体释放载荷仅一次；用储物格和鼠标／触屏拖放实际交换法术，不无限生成法术 |
| Damage、HP、Status_Effects | 燃烧、湿润、油污、毒素、窒息；玩家没有坠落伤害 | 水与血可以灭火，水清洗油污和毒素；燃烧约最大生命 2%/秒，油污加重燃烧；落石挤压与坠落明确区分 |
| Enemies、enemies.txt | 冲锋、远程射击、飞行、自爆、潜地，各自有识别轮廓和行为 | 5 类普通敌人及赤核守卫；射手检查视线，自爆有引信，潜地实际挖开材料；深度增加生命、伤害和射击压力 |
| Biomes、Fungal_Caverns、Frozen_Vault、Perks、golden_mountain.txt | 地层推进、休整、恢复、天赋和法杖编辑 | 按任务书固定顺序：矿坑→煤层→真菌→冰窟→熔炉；5 座驿站，每站一次天赋；终层首领与胜利状态 |
| feel_notes.txt、lighting.txt、全部截图 | 小尺度角色、局部可读性、反馈与危险材料共存 | 固定 30 Hz 模拟；逐像素碰撞步进；跳跃和有限悬浮；震动开关、命中闪光、WebAudio；按设备比例改变视野，避免拉伸 |

## 资料质量与冲突

本地文件名并不总能代表有效正文，以下问题已在设计时排除：

- `Golden_Mountain.md` 的内容实际上是 Perks；`The_Coal_Pits.md` 的内容重复 Frozen Vault。因此不能把它们当作对应地形的直接证据。
- Game_Mechanics、Projectile_Spells、Spell_Modifiers、Spell_Types、Utility_Spells、Wand_Crafting 的正文提示 “There is currently no text in this page”。相应机制使用其他有效 Wiki 正文和 TXT 补充。
- `how_noita_s_pixel_simulation_creates_emergent_gameplay.md` 是无关的 GameDeveloper 分类列表，不能支持像素模拟技术细节。
- Early Access 的两张本地视频截图都是黑帧，不作为视觉依据。
- Wiki 原作的八段主路径与任务书指定的五层顺序不同；本实现优先满足任务书。内部数值是本项目的原创平衡值，不声称与原作数值或规则全集完全一致。

验收脚本与实际游玩结果见 `README.md` 和 `DONE.md`。机制夹具、画面检查与自然输入游玩分别记录，避免用直接设置场景的测试冒充完整通关。
