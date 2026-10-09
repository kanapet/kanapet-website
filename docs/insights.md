# Insights 实施及维护说明

本次在现有静态 HTML/CSS/JS 网站中增加内容模块，未引入 CMS、框架或第三方运行依赖。生成的正文、产品关联、内链和 SEO 均直接存在于 HTML 中，JavaScript 仅负责分类筛选和手机端目录折叠。

## 新增 URL

- `/insights/`
- `/insights/custom-pet-product-development-process/`

Worker 将无末尾斜杠及显式 `index.html` 的 Insights URL 301 到统一目录 URL。既有 `.html` 页面继续使用原 URL。分类筛选不生成查询参数页面，分类面包屑使用首页 fragment。

## 新增文件

- `content/insights/custom-pet-product-development-process.md`：第一篇文章及 metadata。
- `tools/build_insights.py`：无依赖静态生成器；复用首页 Header、Footer 和 Organization 信息。
- `tools/audit_insights.py`：链接、图片、SEO、H1、JSON-LD 和 sitemap 检查。
- `tools/test_insights.py`：模拟增加四篇内容，验证重点文章、普通卡片、关联文章和 sitemap。
- `public/insights/index.html`：生成的列表页。
- `public/insights/custom-pet-product-development-process/index.html`：生成的文章页。
- `public/css/insights.css`、`public/js/insights.js`：模块布局和少量交互。
- `docs/insights.md`：本说明。
- `outputs/insights-qa.cjs` 与 `outputs/insights-{1440,390,375}-{list,article}.png`：本地浏览器验收脚本和截图，不属于发布资产。

## 修改文件及已有页面影响

- 现有 77 个 HTML 文件的主导航增加 Insights：`public/{index,products,product,factory,oem-odm,contact,privacy}.html` 和 `public/product/` 的 70 个产品页。
- `public/sitemap.xml`：增加列表及文章 URL，保留已有 URL。
- `worker/index.js`：新增 Insights URL 归一化；目录文件服务沿用既有逻辑。
- `tools/test_worker.mjs`：加入新 URL 的重定向及目录服务测试。
- `.github/workflows/validate.yml`：加入 Insights 生成结果及内容检查。

本次未修改首页正文、产品页正文、公共 CSS、产品 JSON 结构和既有页面 URL。工作开始时已有大量未提交的产品、图片、视频和生成器修改，这些内容保留。

## 如何新增文章

1. 在 `content/insights/` 新建 `<slug>.md`，文件名必须与 slug 相同。
2. 按示范文件，在两个 `---` 之间填写 JSON metadata，在第二个 `---` 后写 Markdown 正文。
3. 运行以下命令，提交内容源文件以及生成的 HTML 和 sitemap。

```powershell
python tools/build_insights.py
python tools/build_insights.py --check
python tools/audit_insights.py
python tools/test_insights.py
```

新增内容文件后，生成器自动产生页面、卡片、metadata、Schema 和 sitemap，无需编写页面代码。CI 检查生成文件是否与源文件一致；不会在部署时默默更改源文件。修改产品 JSON 后，也需重新生成 Insights 以更新关联产品信息。

Markdown 支持 H2/H3、段落、粗体、链接、无序列表、有序列表、简单表格，以及独立图片块。段落、标题、列表及图片块之间保留空行。此实现是适合本项目的有限 Markdown 子集，不支持 MDX、任意 HTML 或复杂嵌套。文章 H1 来自 title，正文不要写 H1。四个及以上 H2 自动生成目录；手机端初始折叠，可点击展开。

## Metadata 字段

| 字段 | 填写方式 |
| --- | --- |
| title | 必填，清晰的文章标题，自动作为唯一 H1 |
| slug | 必填，英文小写及短横线，发布后保持稳定 |
| description | 必填，卡片和 SEO 描述 |
| summary | 必填，直接回答文章主题的 2–3 句摘要 |
| category | 必填，OEM / ODM、Product Guide、Manufacturing、Company News、Exhibition 之一 |
| datePublished | 必填，实际发布日期，YYYY-MM-DD |
| dateModified | 可选，实际修改日期；未修改时 Schema 使用发布日期 |
| coverImage | 必填，站点绝对图片路径，例如 /images/insights/custom-pet-product.jpg |
| coverAlt | 必填，自然描述图片，不堆关键词 |
| featured | 可选布尔值，建议仅一篇为 true；否则使用最新文章 |
| relatedProducts | 可选数组，填写 products.json 中的产品 id，产品信息由唯一数据源读取 |
| relatedArticles | 可选数组，填写其他文章 slug；未指定时自动取最新其他文章，最多三篇 |
| keyTakeaways | 可选字符串数组，建议 3–5 条 |
| faq | 可选数组，每项包含 question 和 answer |

所有 JSON 字符串使用双引号，最后一项不加尾随逗号。第一篇示范文章可直接复制作为格式参考，但新增内容须依据真实资料编写。

只有一篇文章时，列表仅展示重点文章，普通文章和 Related Articles 区域在后续新增文章时自动出现。没有内容的分类展示简洁空状态。

## 图片存放与正文图片

本次复用 `/images/oem/custom-mold.webp`、`/images/oem/custom-logo-box.webp` 和关联产品现有主图，无新建图片。今后文章专用图片可放 `public/images/insights/`，使用语义化英文文件名；沿用仓库单张不超过 500KB 的图片约定，优先高质量 WebP。封面建议真实 1600×900 或更高、16:9。

```markdown
![自然描述图片内容](/images/insights/custom-bird-cage-prototype.webp "可选图片说明")
```

封面和正文图采用固定 16:9 展示比例，产品图采用 contain，避免裁掉产品。模板设置 width/height、decoding，首屏图优先加载，其余图片 lazy load。没有引入新的图片处理服务或生成额外低质量图片。

## 验收结果及现有问题

- Insights 生成及一致性检查通过。
- H1、canonical、description、Open Graph、Twitter card、Article、Breadcrumb、Organization、图片路径和内链检查通过。
- 内容增长模拟测试通过，未在正式内容中加入模拟文章。
- Worker 路由测试及 JavaScript 语法检查通过。
- 全站 HTTP smoke 检查通过：83 个 URL、70 个产品。沙箱内 localhost 连接失败后，在允许本地网络连接的执行环境完成检查。
- 产品数据/sitemap 检查通过，保留原有七条缺失规格警告。
- Chrome headless 实测 1440px、390px、375px：列表和文章无横向溢出、唯一 H1、图片加载正常；分类筛选及恢复 All 正常。截图在 outputs 中。
- 全站 accessibility normalization 检查通过；既有 `public/products.html` 第 58 行图片 alt 为空，完整 accessibility audit 因此未通过。
- 既有 `hamster-running-disc`、`hamster-ball-180`、`hamster-ball-270` 产品静态输出与产品生成器结果有差异，完整产品 output check 未通过；本次未覆盖用户已有产品修改。
- 既有产品页部分改动含行末空白，完整 git diff whitespace 检查未通过；本次 Worker、CI 和新增路由测试文件的检查通过。
- 网站已经存在 Organization、canonical、Open Graph、robots 和 sitemap；robots 没有阻止 Insights。本次复用真实已有联系方式，未增加未核实认证、产量、客户、交期或社交账号。
- 既有 Footer 的 LinkedIn、YouTube、TikTok 使用 `#` 占位链接，仍按原设计保留，未将它们写入 sameAs。
- 既有 OEM 页面含固定样品周期陈述；示范文章未扩展此类数字。建议由业务团队核实旧页面的时效性。

## 后续事项

本次尚未提交、push 或部署。上线后应核查 Cloudflare 实际响应、sitemap 可访问性及搜索平台索引；本地布局测试不能替代线上 Core Web Vitals 实测。第一篇配图为现有生产与包装素材，未来有真实项目照片时可替换。

后续增加更多真实文章即可启用完整普通列表和关联文章展示。首页 Latest Insights 本阶段未添加。撤下文章时，删除内容文件及对应生成目录，重新生成 sitemap，并为已发布 URL 规划跳转，避免遗留公开页面。


## 正式发布准备（2026-10-09）

按用户确认的真实业务流程更新英文文章，并将用户提供的两张照片分别用于封面和第一张正文图。使用 production main 的干净副本发布，仅纳入 Insights 改动，其他未提交的首页、产品和视频工作保留在原工作目录。

发布副本的 Insights 生成、内链/Schema、内容增长测试、产品静态输出、可访问性、产品 audit、33 项产品审计回归测试、产品渲染、Worker、83 个 URL smoke 检查及 whitespace 检查全部通过，产品数据的既有规格警告仍保留。为新的目录 URL 调整了 tools/audit_products.py 并在 tools/test_audit_products.py 增加目录页面存在/缺失检查；上述初次验收中的产品输出和 alt 错误属于原工作目录的其他未提交改动，不包含在本次发布副本。
