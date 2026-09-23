# stephen-skills

個人自用的 Claude Code skill，以 plugin 形式安裝、集中更新。

本 repo 同時是 plugin 本體與 marketplace，一個 URL 就能裝。

## 內含 skill

`compare-diff`、`spec-to-code`、`commit`。各自的用途與觸發時機寫在 `skills/<name>/SKILL.md` 的 frontmatter。

`commit` 是完整的提交流程：盤點工作區 → 依意圖分組 → 確認 → 逐個提交，單筆與多筆走同一條路。訊息格式為 `[TICKET] type: subject` ＋ why ＋ 變更檔案三段式。

> 它與全域的 `~/.claude/skills/commit` **同名且功能重疊**，兩支同時存在時觸發會挑到哪一支不一定。改用這支的話，全域那支要自行刪掉或改成一行指路。

`compare-diff` 的 Axure 擷取腳本借用某個專案的 `ws`，跑之前要設 `NODE_PATH`，見該 skill 的 `references/mockup-extraction.md`。

## 安裝

在終端機跑：

```
claude plugin marketplace add https://github.com/stephen533422/stephen-skills.git
claude plugin install stephen-skills@stephen
```

裝好後**重開 session** skill 才會進可用清單。名稱帶 plugin 前綴（`stephen-skills:compare-diff`），slash 選單打 `/compare` 就篩得到，不必打全名。

終端機版的 Claude Code 也可以用互動式的 `/plugin`；VSCode 擴充版沒有這個 slash command，一律走上面的 CLI。

## 更新

```
claude plugin marketplace update stephen
claude plugin update stephen-skills@stephen
```

## 發版流程

1. 改 `skills/<name>/` 下的內容。**`.claude-plugin/plugin.json` 的 `version` 留著別動**——合進 `main` 後由 `.github/workflows/release.yml` 自動 bump 並打 tag。那一行每個 PR 都會動，手填必然互撞。
2. `claude plugin validate .` 與 `claude plugin validate .claude-plugin/plugin.json` 兩份都要過。
3. commit、push、發 PR。

**commit message 的 type 決定版號級距**（Conventional Commits）：

| type | 級距 |
| --- | --- |
| `feat:` | minor |
| `fix:`／`refactor:`／`perf:`／其餘 | patch |
| 任一 type 帶 `!`，或內文有 `BREAKING CHANGE:` | major |

一次合併含多個 commit 時取**最高**級距。**版本號是更新的唯一訊號**——使用者端比對版本才決定要不要重抓，版本沒動的 push 收不到。

### 啟用 CI 前的一次性設定

1. **先補一個起始 tag**：`git tag -a v<現行版號> -m v<現行版號> && git push --tags`。沒有 tag 時 CI 會拿**整段歷史**算級距。
2. **`main` 若設了保護規則**，預設的 `GITHUB_TOKEN` 推不回去，要在 repo secrets 放一個有 `contents: write` 的 `RELEASE_TOKEN`，workflow 會優先用它。

## 寫 skill 的規矩

新增一支 skill 時，除了建 `skills/<name>/SKILL.md`，還要把路徑補進 `plugin.json` 的 `skills` 陣列——載入清單以該陣列為準。

skill 內要呼叫自己的腳本時，用 Claude Code 注入的 `CLAUDE_PLUGIN_ROOT` 組絕對路徑，在哪個專案下跑都找得到。
