# 技术约定（CONVENTIONS）

> AI 任务的技术操作手册。改代码前必读，遵守以下约定可以避免 90% 的事故。

## 仓库与部署

- **仓库**：https://github.com/kanapet/kanapet-website （公开仓库）
- **分支策略**：单分支 main——push 到 main 即自动部署上线（Cloudflare 绑定）
- **部署配置**：`wrangler.jsonc`（固定在仓库里，与 Cloudflare 后台设置绑定，防漂移）
- **部署内容**：`public/` 静态资产 + `worker/index.js`（`.assetsignore` 排除内部源图）

## 目录结构

```
public/            网站全部静态文件（HTML/CSS/JS/图片）
  images/products/   正式产品图（网站上线的）
  images/products_raw/ 设计源文件（已移出仓库，勿再放回）
worker/index.js    询盘 API（/api/inquiry → 飞书）
tools/             工具脚本（数据校验等）
data.js            产品数据（在 public/ 内，产品页数据源）
sitemap.xml        站点地图（改产品后需重新生成）
```

## 铁律（违反会出事故）

1. **密钥永不进仓库**：FEISHU_WEBHOOK_URL / FEISHU_SECRET 只存在 Cloudflare dashboard 的 Secrets 里
2. **改产品数据后**：必须跑 `tools/` 里的数据校验器，再重新生成 sitemap.xml
3. **图片规范**：新图放 `public/images/products/`，单张 ≤500KB，主图统一 82% 内容占比；设计源文件一律不放仓库
4. **URL 稳定**：不改已有页面 URL 结构（.html 后缀保持），改 slug 前必须设置重定向
5. **提交信息**：格式 `类型: 描述`，类型用 fix/feat/perf/docs/security/chore

## git 环境注意（沙箱）

- 本沙箱网关与 GnuTLS 的 TLS1.3 不兼容，已全局固化 `git config --global http.sslVersion tlsv1.2`
- 沙箱重置后若 git 报 gnutls handshake 错误，重新执行上面这条命令即可
- hosts 需要 GitHub IP 映射（见 ~/.user_hosts），丢失时用 DoH 重新解析写入

## 验证部署

push 后等待约 1-2 分钟，然后：
```bash
curl -s -o /dev/null -w "%{http_code}" https://<正式域名>/   # 期望 200
```
