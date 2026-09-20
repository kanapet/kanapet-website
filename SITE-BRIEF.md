# KANAPET 网站档案（SITE-BRIEF）

> 本文件是所有 AI 任务的必读背景资料。更新信息时同步更新"最后更新"日期。

## 品牌与业务

- **品牌**：KANAPET（Kana Pet）
- **业务性质**：B2B 宠物用品制造与出口，主打宠物笼具
- **核心卖点**：35+ 年制造经验（网站动态计算展示）、OEM/ODM 定制、一站式供应链
- **代表案例**：透明仓鼠笼（ODM 案例：从模具失败到 Amazon 热销）、鸟笼供应链整合

## 主要产品线

- 仓鼠笼（含 75 透明笼系列）
- 鸟笼（travel 系列 30/42、650 玻璃门、490 透明门、鹦鹉窝等）
- 猫用品（自动喂食器、猫笼）
- 其他：咬齿防护用品、折叠笼、管道配件等
- 产品总量：51+ SKU，70 个产品页（已预渲染）

## 网站页面清单

- 首页（index.html）
- 产品列表页（products.html）+ 产品详情页（product/<slug>.html，预渲染）
- OEM/ODM 页（oem-odm.html，含两个案例研究）
- 工厂页（factory.html，含工厂参观视频）
- 隐私政策（privacy.html）
- 询盘表单（全站，经 /api/inquiry 提交）

## URL 与技术形态

- 全静态 HTML 站（public/ 目录），无前端框架构建
- 询盘走 Cloudflare Worker（worker/index.js）转发飞书群机器人
- 部署：Cloudflare Workers（Assets + Worker 混合模式）

## 商业规则备忘

- MOQ：多数产品 50 pcs 起（5 个纸箱装产品按箱起订），个别不同——以 data.js 为准
- 模具费按合作模式区分（OEM/ODM 各不同）
- 产品主图统一 82% 内容占比

## 询盘流程

访客提交表单 → Worker 验签（HMAC-SHA256）→ 飞书群机器人推送 → 销售跟进
