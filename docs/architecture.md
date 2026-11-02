# 架构

Astro 负责页面、样式和客户端脚本打包，GitHub Pages 提供静态文件。页面保留原阅读器的 DOM 契约和交互，使用仓库 base 路径访问数据。

构建链：固定 Release → Python SHA-256 校验和转换 → reader/data → export-static.mjs → public/data → Astro dist → Pages。不会发布本地笔记。

章节按需加载，搜索分片延迟加载到 Web Worker，查询只返回当前页结果和全局计数。结果来源信息和上下文从对应章节读取，保留源索引及分支标记。立绘使用固定 Git tree 精确匹配。

浏览器 localStorage 保存个人记录，阅读位置和笔记按快照区分。首页内容直接写在 src/pages/index.astro 中，由 Astro 构建为静态页面。

catalog.snapshot 仅包含 id（剧情包 SHA-256，用于校验及隔离个人记录）、releaseTag、releaseUrl 和 publishedAt。首页以北京时间显示剧情 Release 的发布时间，来源弹窗显示版本号与发布链接；完整构建来源保留在下载的原始 manifest.json 和 release.json 中。
