# SEO / GEO 进度台账（SEO-STATE）

> 每次任务收尾时更新本文件：做了什么、效果、下一步。这是跨任务交接的核心文件。

## 已完成（截至 2026-09-20，摘自 git 历史）

- [x] FAQPage 结构化数据 + OG 分享图（首页）
- [x] sitemap.xml 自动生成（tools/ 里含生成逻辑）
- [x] 70 个产品页预渲染——让 AI 爬虫（GEO）能直接读到内容
- [x] 产品 slug 去重（travel 30/42、parrot nest 等 3 处）
- [x] 移动端布局优化（OEM/ODM、factory 页）
- [x] 51 个产品主图统一 82% 内容占比
- [x] JSON-LD 重复键修复
- [x] 询盘 API 安全加固（密钥不落仓库）
- [x] favicon、MOQ 文案统一、隐私页补齐

## 进行中

- [ ] **仓库瘦身**（2026-09-20 整理任务）：移出 products_raw 源文件、压缩大图

## 待办池（按优先级）

1. [ ] 关键词研究：B2B 宠物笼具采购词（wholesale/manufacturer/OEM 类意图）建立关键词表
2. [ ] 每个产品页的 title/meta description 按关键词规范重写（60/155 字符限制）
3. [ ] FAQ 内容扩充（每类产品 3-5 条真实采购问题，配合 FAQPage schema）
4. [ ] GEO 强化：让 ChatGPT/Perplexity 能引用——产品页增加规格对比表、明确的工厂能力描述
5. [ ] Google Search Console 接入与死链巡检
6. [ ] 外链建设：行业目录、B2B 平台档案页带官网链接
7. [ ] 历史仓库瘦身（方案 B，待定）

## 已知问题

- 产品图总量 70.8MB 偏大，压缩中（2026-09-20）
- 早期 90MB 源文件仍在 git 历史中（仓库整体偏大，方案 B 处理）
