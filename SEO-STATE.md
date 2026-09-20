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

- [x] **仓库瘦身阶段1**（2026-09-20 完成）：products_raw 源文件 88.6MB 移出仓库（提交 c02baf6），仓库 172.5MB → 83.9MB；push 改走 SSH 通道（沙箱公钥已绑定）

## 待办池（按优先级）

1. [x] **图片压缩**（2026-09-20 完成并上线）：20 张 >500KB 产品图已压缩上线（23.3MB → 4.7MB），最大单张 4.5MB → 531KB；线上 CDN 已验证生效
2. [x] **仓库瘦身阶段2**（2026-09-20）：仓库 172.5MB → 65.8MB；图片经网页上传（SSH 大包受网关限制，网页上传为主通道）
2. [ ] 关键词研究：B2B 宠物笼具采购词（wholesale/manufacturer/OEM 类意图）建立关键词表
2. [ ] 每个产品页的 title/meta description 按关键词规范重写（60/155 字符限制）
3. [ ] FAQ 内容扩充（每类产品 3-5 条真实采购问题，配合 FAQPage schema）
4. [ ] GEO 强化：让 ChatGPT/Perplexity 能引用——产品页增加规格对比表、明确的工厂能力描述
5. [ ] Google Search Console 接入与死链巡检
6. [ ] 外链建设：行业目录、B2B 平台档案页带官网链接
7. [ ] 历史仓库瘦身（方案 B，待定）

## 已知问题

- `public/images/products/490-page7-full.png`（918KB）：全站 0 引用的死文件，下次整理时删除
- 早期 90MB 源文件仍在 git 历史中（仓库整体偏大，方案 B 可选处理）
