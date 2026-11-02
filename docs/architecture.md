# 架构

Astro 使用文件路由生成首页 `/`、阅读页 `/reader/` 和致谢页 `/acknowledgements/`，GitHub Pages 提供静态文件。页面使用 SiteLayout 的 slot 组合内容，共享 SiteHeader、主题变量、字体和基础控件样式；链接统一通过 sitePath 适配仓库 base 路径。

阅读页组合 ChapterLibrary、ReadingDesk、NotesPanel 和 SearchPanel 组件，只在该页加载阅读样式与脚本。阅读和搜索在页内切换，导航到其他页面使用普通链接。首页统计和来源弹窗由 Astro 构建时生成，客户端只负责旧链接兼容与续读提示；致谢页使用 DocumentLayout 排版原始第三方声明，并从 Markdown 标题生成目录。

原首页 `#章节ID/段落下标` 和 `#search` 链接自动转到 `/reader/`。快照标识和浏览器存储键保持不变，切换页面时保存未提交的笔记；外观脚本按页面实际存在的控件初始化，首页和致谢页也可切换主题。

构建链：固定 Release → Python SHA-256 校验和转换 → reader/data → export-static.mjs → public/data → Astro dist → Pages。不会发布本地笔记。

章节按需加载，搜索分片延迟加载到 Web Worker，查询只返回当前页结果和全局计数。结果来源信息和上下文从对应章节读取，保留源索引及分支标记。立绘使用固定 Git tree 精确匹配。

浏览器 localStorage 保存个人记录，阅读位置和笔记按快照区分。首页内容直接写在 src/pages/index.astro 中，由 Astro 构建为静态页面。

catalog.snapshot 仅包含 id（剧情包 SHA-256，用于校验及隔离个人记录）、releaseTag、releaseUrl 和 publishedAt。首页以北京时间显示剧情 Release 的发布时间，来源弹窗显示版本号与发布链接；完整构建来源保留在下载的原始 manifest.json 和 release.json 中。
