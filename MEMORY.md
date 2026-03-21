# MEMORY.md — Hearth Long-Term Memory

## Product Identity

- `Hearth` 是家庭資產管理系統，不是一般型記帳工具
- 核心價值是把月度現金流與投資淨值放在同一個產品裡

## Architecture Decisions

- 資料庫與身份驗證使用 Supabase
- 前端與 API 部署方向使用 Cloudflare Pages + Workers
- `ai-governance-framework` 以 submodule 方式導入，作為治理參考與未來能力來源

## Working Model

- `Hearth-plan.md` 是初始產品藍圖
- `PLAN.md` 是持續更新的實作計畫與當前優先級
- `memory/YYYY-MM-DD.md` 記錄每次重要進展

## Important Boundary

- 目前只是完成 framework adoption 的第一層：submodule + local plan/memory workflow
- 尚未完成 repo-specific engineering governance，也尚未把 framework 工具正式接進日常開發流程
