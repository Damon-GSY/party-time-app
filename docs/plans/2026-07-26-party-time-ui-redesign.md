# Party Time UI Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Rebuild the native WeChat Mini Program’s core create-and-vote journey around the selected warm dark visual reference while preserving cloud contracts and proving the flow with automated checks and real browser interactions.

**Architecture:** Keep the production runtime dependency-free and native (`WXML`, `WXSS`, CommonJS page logic). Centralize visual tokens in `app.wxss`, centralize slot semantics in `utils/util.js`, and treat `preview.html` as a faithful interactive acceptance harness for the four core pages. One implementation stream owns source changes; independent agents perform architecture, visual, test, specification, and quality reviews.

**Tech Stack:** WeChat Mini Program, WXSS transitions/animations, Node.js built-in test runner, standalone browser preview, in-app Browser automation.

---

### Task 1: Lock the behavior contract and design tokens

**Files:**
- Modify: `miniprogram/utils/util.js`
- Modify: `miniprogram/app.wxss`
- Modify: `miniprogram/app.json`
- Create: `tests/util.test.js`

**Steps:**
1. Write tests that require a single index-based slot contract for `hour`, `twoHours`, and `halfDay`, including exact labels and IDs.
2. Run `node --test tests/util.test.js` and verify the current two-hour label mismatch fails.
3. Add slot configuration helpers and make existing helpers use the same contract without changing stored slot IDs.
4. Replace the global blue/glass palette with warm ink, coral, stone, border, spacing, radius, elevation, and motion tokens derived from the selected reference.
5. Update native window colors to match the new surface.
6. Re-run the unit test and JSON parsing checks; expect all to pass.

### Task 2: Rebuild the home and create experiences

**Files:**
- Modify: `miniprogram/pages/index/index.wxml`
- Modify: `miniprogram/pages/index/index.wxss`
- Modify: `miniprogram/pages/index/index.js`
- Modify: `miniprogram/pages/create/create.wxml`
- Modify: `miniprogram/pages/create/create.wxss`
- Modify: `miniprogram/pages/create/create.js`

**Steps:**
1. Replace decorative beams, meteors, rotating borders, nested glass cards, and emoji chrome with a task-first calendar header, clear response queue, recent events, and a direct create action.
2. Preserve existing event loading, swipe/delete, profile navigation, sharing, and event routing contracts.
3. Make create a compact single-flow form with visible required fields, selected states, date validation, and a persistent primary action.
4. Keep motion to short opacity/transform transitions and pressed feedback; remove perpetual decoration.
5. Verify all WXML event bindings resolve to page methods and all interactive targets are at least 88rpx.

### Task 3: Rebuild vote and result around one slot model

**Files:**
- Modify: `miniprogram/pages/vote/vote.wxml`
- Modify: `miniprogram/pages/vote/vote.wxss`
- Modify: `miniprogram/pages/vote/vote.js`
- Modify: `miniprogram/pages/result/result.wxml`
- Modify: `miniprogram/pages/result/result.wxss`
- Modify: `miniprogram/pages/result/result.js`
- Modify: `tests/util.test.js`

**Steps:**
1. Render vote labels from shared slot configuration and preserve index-based persisted IDs.
2. Use large tap targets, clear selected/unselected states, multi-select guidance, keyboard-safe inputs, a live count, and a stable submit action.
3. Render result labels and heatmap cells from the same contract; make dense grids horizontally scrollable instead of overflowing.
4. Add explicit loading, empty, error-safe mock, best-time, participants, and modal states without changing cloud collection/function names.
5. Re-run unit and contract checks and confirm vote/result labels agree for every granularity.

### Task 4: Build the faithful interactive preview harness

**Files:**
- Modify: `preview.html`

**Steps:**
1. Recreate the selected home reference at a 393px mobile viewport using the same tokens and hierarchy as production.
2. Implement create input, date, granularity, and expiry controls; make submission navigate to vote with the entered event name.
3. Implement vote date switching, slot selection, clear/select-all, nickname input, disabled/enabled submit states, and success navigation.
4. Implement result heatmap detail dialog, responsive scrolling, and return/revote navigation.
5. Use semantic buttons, labels, focus-visible styles, dialog semantics, keyboard activation, and reduced-motion support.

### Task 5: Automated and real end-to-end verification

**Files:**
- Create: `tests/source-contract.test.js`
- Create: `artifacts/e2e/*`

**Steps:**
1. Add static contract tests for JSON parsing, JavaScript syntax, WXML handler existence, required preview landmarks, and prohibited decorative leftovers.
2. Run `node --test tests/*.test.js`; expect zero failures.
3. Start the local preview and open it in the in-app Browser at 393x852.
4. Use real clicks and keyboard input to complete: home → create → fill form → submit → select date/time → enter nickname → submit → inspect result → open/close heatmap detail.
5. Repeat key responsive checks at 375px and 430px, inspect browser console errors, and save screenshots under `artifacts/e2e/`.

### Task 6: Design QA and independent reviews

**Files:**
- Create: `design-qa.md`
- Modify: any implementation file required to close findings

**Steps:**
1. Open the exact selected reference and latest 393px implementation capture together; compare typography, layout rhythm, colors, assets, copy, affordances, responsiveness, and polish.
2. Record every P0/P1/P2 finding in `design-qa.md`, fix it, recapture, and repeat until `final result: passed`.
3. Run independent specification compliance review against this plan.
4. Only after specification approval, run independent code quality/accessibility review.
5. Fix every blocking or important finding and re-run the corresponding reviewer.

### Task 7: Final regression and submission

**Files:**
- All changed files on `codex/party-time-ui`

**Steps:**
1. Re-run automated checks, browser E2E, console inspection, and visual QA after all review fixes.
2. Confirm the original `master` worktree and `.omc/` remain untouched.
3. Stage only scoped files, commit the verified result, and report the branch, commit, checks, screenshots, QA report, and clickable local preview.
