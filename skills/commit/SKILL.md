---
name: commit
description: 依意圖把工作區變更拆成數個 commit 並逐個提交。當使用者要 commit、要拆分 commit、或要擬 commit message 時觸發。
allowed-tools:
  - Bash
  - PowerShell
  - Read
  - Grep
  - Write
  - AskUserQuestion
---

# Commit

**一個 commit 一個意義單位。** git 不是程式碼的 FTP，是歷史查閱的工具——切對了每一筆都能單獨回溯、單獨 revert、單獨 cherry-pick，一年後還讀得懂。

四段依序：**盤點** → **分組** → **確認** → **逐個提交**。確認過才動 `git add`；**commit 要使用者開口才做，push 要再一次明確要求。**

> **工作區只有一件事時，四段照跑，只是段二只分出一組。** 先盤點才知道是不是真的只有一件事。

---

## 段一 · 盤點

- `git status --porcelain` 拿全貌；`git diff` 看未 staged，`git diff --staged` 看已 staged。
- **untracked 檔案 `git diff` 看不到**，逐個 `Read`。漏掉新檔是這一段最常見的失手。
- 使用者原本就 staged 的內容一併納入計畫，段四才敢清空 staging。
- 逐個 hunk 讀出「它在做什麼」**與「為什麼要改」**。why 讀不出來就去問或去翻單號——它是段二分組的依據，也是內文要寫的東西。
- 行數大的機械式改動（formatter、批次 rename、import 重排）當場標記，它們幾乎一定要自成一組。
- `git log --format="%s" -20` 掃一眼。專案 log 明顯另有慣例（別的 type 用字、別的單號格式、英文標題）時，把兩種格式並陳問使用者要照哪邊，得到答覆再進段二。

**完成條件**：每一個變更檔案（含 untracked）都讀過；每一個 hunk 都寫得出「做什麼」與「為什麼」各一句。

---

## 段二 · 分組

切分準則：

- **意圖不混** — 順手修掉的 bug 自成一筆。**type 是給 reviewer 的定位訊號**：看到 `refactor` 就知道只要盯結構、行為該是一樣的；看到 `fix` 就直接找問題怎麼解的。兩種混在同一筆，這個訊號就沒了。
- **單號不混** — 不同 ticket 一定分開。
- **機械與手寫不混** — formatter、批次 rename、import 重排自成一組；混進邏輯變更會把 review 淹成雜訊。
- **依賴決定順序** — 被依賴的先（新增 util／型別 → 用到它的頁面）。每一個 commit 送出後專案都應該還能 build。
- **同一檔多意圖就拆 hunk** — 做法見段四。
- **切不動就別硬切** — 真的互相依賴、拆開會壞掉的變更留在同一組，在標題用 `;` 併述。

### 意圖清單

| 意圖 | 這一組裝什麼 |
|---|---|
| feat | 新增或修改功能 |
| fix | 修補 bug |
| refactor | 重構，行為不變 |
| perf | 效能改善 |
| style | 純格式，不動邏輯 |
| docs | 文件與註解 |
| test | 只動測試 |
| chore | 建構、設定、依賴、輔助工具 |
| revert | 撤銷先前的 commit |

這張表同時決定**切的顆粒度**與**標題的 type 用字**。

### 訊息格式

```
[TICKET] type: subject

why：為什麼要改，跟先前行為差在哪

[資料夾][檔案1, 檔案2]
```

- **標題** — 單行，全形算兩個字元、總長控制在 `50` 以內，結尾不加句號。`TICKET` 照專案自己的單號格式（如 `PROJ-526`、`114PROJ-72`）；單號不確定就問，或方括號整個省略直接寫 `type: subject`。`subject` 以繁體中文為主，短英文亦可。
- **why** — 空一行後，**只寫 diff 看不出來的**：為什麼要改、跟先前行為差在哪，每行 `72` 字元內。理由一眼看得出來的單檔小修整段省略。
- **變更檔案** — 再空一行，`[資料夾][檔案1, 檔案2]`，去副檔名、用 basename；位於 src 根層的直接寫 `[App, Types.d]`。單檔小修省略。
- **寫到變更檔案這段為止** — 不附任何 trailer，包含系統預設會自動加上的 `Co-Authored-By`。

範例：

```
[PROJ-526] refactor: 選單展開狀態改用 sessionStorage

原本展開狀態存在 StatusContext，切分頁就被洗掉，使用者每次
回到頁面都要重新點開分類。改存 sessionStorage 的
activeCategory，跨分頁保留。

[context][StatusContext], [layout][SideMenu], [App]
```

### 每組寫出

`# ｜ 意圖 ｜ 檔案（或 hunk） ｜ 完整 message ｜ 前置組`

**完成條件**：每個 hunk 都歸到某一組或列在〈本次不提交〉；每組只有一個意圖；每組的 why 都寫得出來；組間順序已排，且照這個順序提交不會出現壞掉的中間狀態。

---

## 段三 · 確認

分組表整份貼給使用者，**含每一組的完整 message**。疑義——單號是哪一張、某段算 feat 還是 fix、某組要不要乾脆先別提交——用 `AskUserQuestion` 一次問完。

**分支安全也在這裡確認**：`git branch --show-current` 若落在預設分支（`main`／`master`／`dev/*`），先問要不要開新分支，開好再進段四。

**完成條件**：使用者已確認分組、每一則 message、以及要提交到哪個分支。

---

## 段四 · 逐個提交

依段二排定的順序，每組重複：

1. `git reset` 清空 staging（段一已把原有 staging 納入計畫，所以清空是安全的）。
2. `git add <該組檔案>`，逐個點名。**用明確路徑，不用 `git add .`／`-A`。**
3. `git diff --staged --stat` 對一次，檔案清單與計畫相符才提交。
4. 用段三確認過的 message 提交。**多行中文走 Bash heredoc**——PowerShell 把訊息交給 git 時會經過主控台編碼，中文有變亂碼的風險：

```bash
git commit -F - <<'EOF'
<段三確認過的完整 message，原樣貼入>
EOF
```

只有 PowerShell 可用時改單引號 here-string（`git commit -m @'` … 結尾 `'@` 須頂格），提交後用 `git log -1` 確認中文正常。

hook 與簽章一律照跑；`--no-verify`／`--no-gpg-sign` 要使用者明確要求才用，hook 擋下來就去修根因。

### 拆 hunk

`git add -p` 是互動式的，這個環境跑不了。改走 patch，**檔案寫在 scratchpad**，repo 才不會多出未追蹤的 `.patch`：

```bash
git diff -- <檔案> > "$SCRATCH/x.patch"          # 編輯 patch，整段刪掉不屬於本組的 hunk
git apply --cached --check "$SCRATCH/x.patch"    # 先驗
git apply --cached "$SCRATCH/x.patch"
```

`$SCRATCH` 換成本次 session 的 scratchpad 絕對路徑。**整段 hunk 刪掉是安全的**（`@@` 行號各自獨立）；要動 hunk 內部的行，得一併把 `@@` 的行數改對，否則 `--check` 會擋下來。`--check` 失敗就重抓 diff 再編一次。

**完成條件**：每一組都已提交；`git log --oneline -<n>` 與計畫逐條對得上；`git status` 只剩〈本次不提交〉的內容；已回報給使用者。
