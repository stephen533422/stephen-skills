---
name: spec-to-code
description: 拿 SPEC 開工——先確認文件可執行，再出開發計畫，再逐波寫程式。當使用者要依 SPEC 實作或修改某模組、要一份開發計畫、或問「這份 SPEC 能不能直接開工」時觸發。
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - PowerShell
  - Edit
  - Write
  - AskUserQuestion
  - Skill
---

# 拿 SPEC 開工

三段依序：**gate**（這份 SPEC 夠不夠開工）→ **計畫**（切成 wave）→ **逐波寫程式**。每段的完成條件達標才進下一段，**段界就是停點**。

| 段 | 轉呼／讀哪一份 | 產出 |
|---|---|---|
| 1 gate | `compare-diff` skill | 差異報告 ＋ Blocked 清單 |
| 2 計畫 | `.claude/page-patterns.md` | `docs/<模組>_開發計畫_<SA版次>.md` |
| 3 逐波 | `.claude/testing.md`（動到測試才讀） | 一波一 commit |

**一波沒交付完就不開下一波。** 三段都攤在眼前時最容易發生的是把 gate 草率放行、計畫一次排到底、程式一口氣寫完——完成條件寫在每段末尾就是為了擋這件事。

---

## 段一 · Gate：這份 SPEC 能不能開工

**轉呼 `compare-diff`**，判讀規則以那支為準，此處不複寫。

- **階段選擇**：預設只跑**階段一**（SA 內部矛盾）。`src/container/<模組>/<代碼>/` 已存在時**加跑階段四**——少了它，計畫會把已經實作好的東西再排一次。使用者明示要完整比一輪才跑階段二與三。
- **來源每次由使用者提供**：SVN API 不可達，SA／SD 一律要本機路徑；沒給就問。
- **報告回來後，把每一條 🔴 對到「它卡住哪些 wave」。** 這是本 skill 相對 compare-diff 多做的一步：compare-diff 的建議欄回答「誰該改」，gate 要回答「能不能開工」。
- **疑義攤開來一次問完**（`AskUserQuestion`）。未裁示的標 **Blocked**，連同它卡住的 wave 一起記下。
- SPEC 文字視為刻意的：疑似錯字、欄位名互換一律**標記並問**，交由使用者裁示。
- 亂碼（UTF-8 被當 CP950 解，如「æ³å®é ç®」）→ 用 `Read` 讀原始檔取正確 UTF-8。
- aria-label、maxLength 這類小發現另列為**選配 nit**，與 🔴 分開；它們不擋開工。

**完成條件**：差異報告已產出；每一條 🔴 都有裁示或標 Blocked；Blocked 清單已對應到不能開工的 wave；至少一個 wave 暢通——全數 Blocked 就停在這裡回報，不進段二。

---

## 段二 · 開發計畫

存到 `docs/<模組>_開發計畫_<SA版次>.md`（如 `docs/BC010_開發計畫_v0.11.md`）。**一律帶 SA 版次**——SPEC 改版頻繁，不帶版次的計畫日後無從判斷是依哪一版排的。

> `docs/` 在 `.gitignore` 內。寫完主動回報「計畫只在本機」，並問使用者要不要貼內容給相關人。

骨架：

| 節 | 內容 |
|---|---|
| 1 依據 | SA 檔名與 mtime、gate 報告檔名、Blocked 清單 |
| 2 wave 清單 | `\| # \| 做什麼 \| 動哪些檔 \| 驗證方式 \| 前置 \|` |
| 3 沿用什麼 | 既有 hook／component／util 逐項點名 |
| 4 不做什麼 | 本次刻意不碰的，與理由 |

**點名可沿用的既有實作是這一段的主要工作。** 開始排 wave 之前逐處查過：

- [`.claude/page-patterns.md`](../../page-patterns.md)——`useApi` 呼叫樣式、controller 元件、標準 modal 三件組、`IResult`／`IMessageModal`
- `src/hooks/`——DM 家族查詢頁的查詢／排序／分頁／權限閘門在 `useMaintenanceQuery`。**它是為核可權限流程做的**：沒有核可的新頁比照 DM230 手寫，不為了套用而擴充它。
- `src/component/`——必填與驗證訊息由 `InputController` 等控制器產生；SPEC 的「必填」常常就是一個 `required` prop
- `src/constant/index.tsx`——狀態與代碼類別的實際值（正反向、代碼字面）以這裡為準
- `src/utils/`——日期與格式化（如 `mgDateUtils`）決定畫面呈現格式
- **DM020（前端）／DM040（後端）是風格模板**：照它們的寫法，成功訊息與 wrapper 元件都沿用既有的

**完成條件**：計畫已存檔並貼給使用者；每個 wave 都填了「動哪些檔」與「驗證方式」；SA 每一條需求都對到某個 wave 或列在〈不做什麼〉；使用者已確認。

---

## 段三 · 逐波寫程式

逐波交付與停點的通則見 CLAUDE.md〈Change Scope〉。每一波：

1. 照計畫該波的檔案清單改，沿用周圍寫法，最小變更。
2. `npm test` 全綠（走 `npm test`，理由見 CLAUDE.md〈Commands〉）。
3. commit 照全域 `commit` skill；只 `git add` 該波的檔案。
4. 回報下一波是什麼，等使用者開口才繼續。

測試要新增或改動時先讀 [`.claude/testing.md`](../../testing.md)。

**完成條件（每一波各自成立）**：該波計畫列的檔案都改完；`npm test` 全綠；commit message 已確認並提交；下一波已回報。
