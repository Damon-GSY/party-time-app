# 投票汇总算法设计文档

## 1. 问题本质

聚会选时间不是"选举"问题，而是**排程优化问题**。

选举要解决：从多个候选人中选出唯一胜者（政治权力分配）。
聚会要解决：找到一个时间，让**最多人出席且出席意愿最高**。

所以 Borda Count、Condorcet、STV 这些选举算法根本不该出现在这里。它们解决的是错误的问题。

**真正的问题是：给定 N 个人对 M 个时段的偏好矩阵，找到使得"出席人数 × 平均满意度"最大化的时段集合。**

## 2. 偏好表达方式

### 2.1 设计原则

手机端操作，交互必须比现在更简单或等价。不能让用户思考。

**核心洞察：用户选择时段时，选中数量本身包含了偏好信息。**
- 选了 1 个时段的人：对那个时段是硬约束（"只有这时间能来"）
- 选了 10 个时段的人：偏好分散（"哪天都行"）

不需要额外的 UI 控件。当前的单次点击已经够了。信息已在数据中，只是聚合算法没利用。

### 2.2 三级偏好（唯一扩展）

在现有"点击选中"的基础上，增加**一个可选操作**：长按时段标记为"必须"。

| 操作 | 含义 | 分值 | UI 表现 |
|------|------|------|---------|
| 不选 | 没空 | 0 | 灰色空格 |
| 短按选中 | 有空 | 1 | 正常高亮 |
| 长按标记 | 只有这时间能来（硬约束） | 2 | 双圈标记 / 星标 |

**为什么是三级而不是五级或滑动条？**

因为人的区分能力就三档："不行"、"可以"、"必须"。四级以上用户会犹豫，犹豫导致弃投。三档是"不假思索"的上限。

**为什么长按而不是新控件？**

- 零学习成本：不改变现有操作习惯
- 渐进式：不标记也能正常投票（向后兼容）
- 可发现：可以在用户选中 1-2 个时段时弹出提示"长按标记为必选时间"

### 2.3 数据结构

```javascript
// 旧格式（向后兼容）
slots: ['2024-03-23_3', '2024-03-23_4']

// 新格式
slots: {
  '2024-03-23_3': 2,   // 硬约束（长按标记）
  '2024-03-23_4': 1,   // 普通有空
  '2024-03-23_5': 1    // 普通有空
}
```

**向后兼容：**

```javascript
function normalizeSlots(slots) {
  // 旧格式：字符串数组 → 全部映射为 score=1
  if (Array.isArray(slots)) {
    const result = {}
    slots.forEach(id => { result[id] = 1 })
    return result
  }
  // 新格式：已经是 { slotId: score }
  return slots
}
```

## 3. 汇总算法

### 3.1 核心公式

对于时段 $s$，定义其**聚合得分**：

$$
Score(s) = \underbrace{H(s)}_{\text{硬约束覆盖率}} \times \underbrace{\left( W(s) + \alpha \cdot P(s) \right)}_{\text{加权出席}}
$$

其中：

$$
H(s) = \sum_{i=1}^{N} \mathbb{1}[r_i(s) = 2]
$$

$$
W(s) = \sum_{i=1}^{N} r_i(s)
$$

$$
P(s) = \sum_{i=1}^{N} \frac{r_i(s)}{\sum_{j} r_i(j)}
$$

- $r_i(s)$：用户 $i$ 对时段 $s$ 的评分（0/1/2）
- $H(s)$：硬约束人数（"必须"这时间来的人头数）
- $W(s)$：原始加权得分（1分=1，硬约束=2）
- $P(s)$：偏好集中度（选得越少，每个选中的权重越高）
- $\alpha$：偏好集中度权重系数，默认 0.5

### 3.2 直觉解释

| 指标 | 含义 | 为什么重要 |
|------|------|-----------|
| $H(s)$ | 多少人"必须"这个时间 | 硬约束者缺席 = 彻底无法参加 |
| $W(s)$ | 总加权出席意愿 | 区分"闲人"和"真心想来的人" |
| $P(s)$ | 偏好集中度 | 只选了1个时段的人，该时段权重应更高 |

### 3.3 伪代码

```javascript
function aggregate(responses, allSlotIds) {
  const N = responses.length
  const alpha = 0.5

  // 预计算每个用户的总偏好（用于偏好集中度）
  const userTotalPreference = {}
  responses.forEach((resp, i) => {
    const slots = normalizeSlots(resp.slots)
    const total = Object.values(slots).reduce((sum, score) => sum + score, 0)
    userTotalPreference[i] = Math.max(total, 1) // 避免除零
  })

  // 对每个时段计算得分
  const results = {}
  for (const slotId of allSlotIds) {
    let H = 0  // 硬约束人数
    let W = 0  // 加权总分
    let P = 0  // 偏好集中度

    responses.forEach((resp, i) => {
      const slots = normalizeSlots(resp.slots)
      const score = slots[slotId] || 0

      if (score === 2) H += 1
      W += score
      if (score > 0) {
        P += score / userTotalPreference[i]
      }
    })

    results[slotId] = {
      hardCount: H,
      weightedScore: W,
      preferenceConcentration: P,
      totalScore: H * (W + alpha * P),
      rawCount: 0  // 传统人数统计，兼容热力图
    }

    // 计算传统人数（score > 0 的用户数）
    responses.forEach(resp => {
      const slots = normalizeSlots(resp.slots)
      if ((slots[slotId] || 0) > 0) results[slotId].rawCount++
    })
  }

  return results
}
```

### 3.4 排序与推荐

```javascript
function rankSlots(aggregateResults) {
  return Object.entries(aggregateResults)
    .map(([slotId, data]) => ({ slotId, ...data }))
    .sort((a, b) => {
      // 第一排序键：硬约束人数（降序）
      // 理由：如果有人"必须"这个时间才能来，优先满足
      if (a.hardCount !== b.hardCount) return b.hardCount - a.hardCount

      // 第二排序键：综合得分（降序）
      return b.totalScore - a.totalScore
    })
}
```

### 3.5 为什么不用 Condorcet / Borda / 评分制

| 算法 | 为何不用 |
|------|----------|
| **Condorcet** | 设计目的是选出"打败所有人的候选人"。聚会不是零和博弈。如果 A 时段 5 人有空、B 时段 4 人有空但更想来，Condorcet 会选 A，但这可能不对。而且 Condorcet 需要 O(N²) 配对比较，聚会场景没必要。 |
| **Borda Count** | 要求用户对所有选项排序。手机上有 50+ 个时段，排序不现实。而且 Borda 对"加入新选项"极度敏感（违反 IIA），而聚会场景经常有人提议新时间。 |
| **Approval Voting** | 就是我们现在在做的（数人头）。已证明无法区分偏好强度。 |
| **Range Voting（评分制）** | 理论最优（满足最多优良性质），但要求用户给每个时段打分。50 个时段打 0-10 分？用户会直接弃投。 |

**我们的方案本质上是"加权的 Approval Voting + 偏好集中度修正"。**

它不是选举算法，是一个排程优化函数。这很重要——我们放弃了 Arrow 定理的框架，因为聚会选时间根本不是社会选择问题。

## 4. 阿罗不可能定理的处理

### 4.1 明确放弃什么

Arrow 不可能定理说：不存在一个投票系统同时满足以下五个条件：

| 条件 | 含义 | 我们的态度 |
|------|------|-----------|
| **非独裁** | 没有一个人的偏好决定结果 | ✅ 保留 |
| **帕累托** | 如果所有人都偏好 A > B，则 A 排名更高 | ✅ 保留 |
| **无关选项独立性（IIA）** | 加入/移除一个选项不影响其他选项的相对排名 | ❌ **明确放弃** |
| **非限制域** | 允许任何偏好序 | ⚠️ 部分保留（只允许三级偏好） |
| **传递性** | 如果 A > B 且 B > C，则 A > C | ❌ **明确放弃** |

### 4.2 为什么可以放心放弃 IIA 和传递性

**放弃 IIA 的理由：**

聚会场景中，"加入新时段"本来就应该影响排名。如果新加入一个晚上 8 点的时段，很多人转投它，导致原最佳时段排名下降——这是**正确行为**，不是缺陷。

IIA 是选举公平性的要求（防止"搅局者"效应），但聚会没有"搅局者"问题。

**放弃传递性的理由：**

我们的输出不是全序排名，而是**推荐集合**（Top-K）。传递性要求 A > B > C 的链条，但我们需要的是"这三个时段都不错，按得分排序"——不需要严格的全序。

### 4.3 避免的策略操纵

| 策略操纵 | 说明 | 我们的防御 |
|----------|------|-----------|
| **埋葬（Burial）** | 故意不给竞争选项评分 | 偏好集中度 $P(s)$ 使得分散投票反而降低单时段权重 |
| **克隆（Cloning）** | 创建多个相似选项稀释票数 | 我们的算法是加分制，不是排名制，克隆不会伤害原选项 |
| **妥协（Compromise）** | 给次优选项高分以防最差选项当选 | 三级评分（0/1/2）让妥协的空间很小 |

## 5. 输出结果结构

### 5.1 推荐输出

```javascript
{
  // 推荐时段列表（Top 5）
  recommendations: [
    {
      slotId: '2024-03-23_4',
      rank: 1,
      totalScore: 12.5,
      hardCount: 3,         // 3 人"必须"这时间
      availableCount: 7,    // 7 人有空（含硬约束）
      weightedScore: 10,    // 加权总分
      satisfactionRate: 0.82, // 满意度（见下方定义）
      users: ['小明', '小红', '小李', ...],  // 有空的人
      hardUsers: ['小明', '小李'],  // 硬约束的人
      timeLabel: '3月23日 周六 8:00-10:00'
    },
    // ...
  ],

  // 全局统计
  summary: {
    participantCount: 8,
    totalSlots: 48,
    consensusLevel: 0.75,  // 共识度（见下方定义）
    paretoOptimalSlots: ['2024-03-23_4', '2024-03-23_5'],
  },

  // 热力图数据（兼容现有 UI）
  heatmap: {
    '2024-03-23_0': { count: 2, level: 1, score: 1.5 },
    '2024-03-23_4': { count: 7, level: 4, score: 12.5 },
    // ...
  }
}
```

### 5.2 满意度定义

时段 $s$ 的满意度 = 有空的人中，该时段的得分占其所有时段得分之和的比率：

$$
Satisfaction(s) = \frac{\sum_{i: r_i(s)>0} r_i(s)}{\sum_{i: r_i(s)>0} \sum_j r_i(j)}
$$

含义：如果所有人都把这个时段作为唯一选择，满意度 = 100%。如果所有人都选了 10 个时段，满意度 ≈ 10%。

### 5.3 共识度定义

整体共识度 = 最佳时段的满意度：

$$
Consensus = \max_s Satisfaction(s)
$$

含义：如果共识度很高，说明大家意见一致，果断选那个时间。如果很低，说明偏好分散，需要人工协调。

### 5.4 帕累托最优集合

时段 $s$ 是帕累托最优的，当且仅当不存在另一个时段 $s'$ 使得：

$$
\exists s': H(s') \geq H(s) \land W(s') \geq W(s) \land (H(s') > H(s) \lor W(s') > W(s))
$$

即：没有其他时钟能在硬约束人数和加权得分上都胜过它。这个集合给创建者提供"安全选择"。

## 6. 完整云函数聚合伪代码

```javascript
// getEventResult/index.js — 新版聚合逻辑

function normalizeSlots(slots) {
  if (Array.isArray(slots)) {
    // 旧格式兼容：['slot1', 'slot2'] → { slot1: 1, slot2: 1 }
    const result = {}
    slots.forEach(id => { result[id] = 1 })
    return result
  }
  return slots || {}
}

exports.main = async (event, context) => {
  const { eventId } = event

  // 获取活动和响应（同现有逻辑）
  const eventRes = await db.collection('events').doc(eventId).get()
  const responsesRes = await db.collection('responses').where({ eventId }).get()

  const eventData = eventRes.data
  const responses = responsesRes.data || []
  const granularity = eventData.granularity || 'twoHours'
  const N = responses.length

  if (N === 0) {
    return { success: true, data: { recommendations: [], summary: {}, heatmap: {} } }
  }

  // 生成所有合法的 slotId
  const allSlotIds = generateAllSlotIds(eventData.startDate, eventData.endDate, granularity)

  // 归一化所有响应
  const normalized = responses.map(resp => ({
    ...resp,
    _slots: normalizeSlots(resp.slots)
  }))

  // 预计算每个用户的总偏好值
  const userTotals = normalized.map(resp =>
    Math.max(Object.values(resp._slots).reduce((s, v) => s + v, 0), 1)
  )

  const alpha = 0.5
  const heatmap = {}
  const slotDetails = {}

  for (const slotId of allSlotIds) {
    let hardCount = 0
    let weightedScore = 0
    let preferenceConcentration = 0
    let availableCount = 0
    const availableUsers = []
    const hardUsers = []

    normalized.forEach((resp, i) => {
      const score = resp._slots[slotId] || 0
      if (score === 2) {
        hardCount++
        hardUsers.push(resp.nickname || '匿名')
      }
      if (score > 0) {
        availableCount++
        availableUsers.push(resp.nickname || '匿名')
        weightedScore += score
        preferenceConcentration += score / userTotals[i]
      }
    })

    const totalScore = hardCount * (weightedScore + alpha * preferenceConcentration)

    // 热力图等级（0-4）
    const ratio = N > 0 ? availableCount / N : 0
    const level = ratio <= 0 ? 0
      : ratio <= 0.2 ? 1
      : ratio <= 0.4 ? 2
      : ratio <= 0.6 ? 3
      : 4

    heatmap[slotId] = { count: availableCount, level, score: totalScore }
    slotDetails[slotId] = {
      slotId, hardCount, weightedScore, preferenceConcentration,
      totalScore, availableCount, availableUsers, hardUsers
    }
  }

  // 排序推荐
  const recommendations = Object.values(slotDetails)
    .filter(s => s.availableCount > 0)
    .sort((a, b) => {
      if (a.hardCount !== b.hardCount) return b.hardCount - a.hardCount
      return b.totalScore - a.totalScore
    })
    .slice(0, 5)
    .map((s, rank) => ({
      ...s,
      rank: rank + 1,
      timeLabel: formatSlotLabel(s.slotId, granularity)
    }))

  // 计算满意度
  recommendations.forEach(rec => {
    let satNumer = 0
    let satDenom = 0
    normalized.forEach((resp, i) => {
      const score = resp._slots[rec.slotId] || 0
      if (score > 0) {
        satNumer += score
        satDenom += userTotals[i]
      }
    })
    rec.satisfactionRate = satDenom > 0 ? satNumer / satDenom : 0
  })

  // 帕累托最优集合
  const paretoOptimal = findParetoOptimal(slotDetails)

  // 共识度
  const consensusLevel = recommendations.length > 0 ? recommendations[0].satisfactionRate : 0

  return {
    success: true,
    data: {
      event: eventData,
      responses,
      recommendations,
      summary: {
        participantCount: N,
        totalSlots: allSlotIds.length,
        consensusLevel,
        paretoOptimalSlots: paretoOptimal.map(s => s.slotId)
      },
      heatmap,
      bestSlots: recommendations.slice(0, 5).map(r => ({
        slotId: r.slotId,
        count: r.availableCount,
        score: r.totalScore
      }))
    }
  }
}

function findParetoOptimal(slotDetails) {
  const candidates = Object.values(slotDetails).filter(s => s.availableCount > 0)
  return candidates.filter(s => {
    // s 是帕累托最优 ⟺ 不存在 s' 支配 s
    return !candidates.some(other =>
      other.slotId !== s.slotId &&
      other.hardCount >= s.hardCount &&
      other.weightedScore >= s.weightedScore &&
      (other.hardCount > s.hardCount || other.weightedScore > s.weightedScore)
    )
  })
}
```

## 7. 前端改造要点

### 7.1 投票页（vote.js）改动

**数据结构变更：**

```javascript
// 旧
slots: { '2024-03-23_3': true, '2024-03-23_4': true }

// 新：0=未选, 1=有空, 2=硬约束
slots: { '2024-03-23_3': 2, '2024-03-23_4': 1 }
```

**交互变更：**

```javascript
// 短按：toggle 选中（0 ↔ 1）
toggleSlot(e) {
  const slotId = currentSlots[index].id
  const current = slots[slotId] || 0
  const newScore = current === 0 ? 1 : 0
  // 更新 UI...
}

// 长按：标记为硬约束（→ 2）
onSlotLongPress(e) {
  const slotId = currentSlots[index].id
  const current = slots[slotId] || 0
  if (current === 1) {
    // 有空 → 硬约束
    slots[slotId] = 2
    // UI: 显示星标/双圈
  } else if (current === 2) {
    // 硬约束 → 有空
    slots[slotId] = 1
    // UI: 移除星标
  }
}

// 提交时转换格式
handleSubmit() {
  const slotsObj = {}
  Object.entries(this.data.slots).forEach(([id, score]) => {
    if (score > 0) slotsObj[id] = score
  })
  // 发送 slotsObj 到云函数
}
```

**提交数据格式变更（submitResponse 云函数）：**

```javascript
// 接收新格式
const { eventId, nickname, slots } = event
// slots 现在是 { slotId: score } 对象
// 兼容检查：如果还是数组，服务端自动转换
```

### 7.2 结果页（result.js）改动

**使用新聚合结果：**

```javascript
// 使用 recommendations 替代旧的 bestSlot
const recommendations = result.data.recommendations
const bestSlot = recommendations[0] || { count: 0 }

// 热力图使用新数据
const heatmap = result.data.heatmap
// heatmap[slotId].score 用于深度色阶，heatmap[slotId].count 用于人数显示

// 展示满意度
bestSlot.satisfactionRate  // 显示为百分比
```

### 7.3 UI 状态展示

| 状态 | 颜色/样式 | 说明 |
|------|-----------|------|
| 未选中（0） | 灰色空格 | 默认状态 |
| 有空（1） | 正常高亮 | 短按切换 |
| 硬约束（2） | 高亮 + 星标图标 | 长按切换 |

结果页推荐卡片新增：
- 满意度百分比条
- 硬约束人数标识（"3 人必选此时段"）
- 帕累托最优标记

## 8. 数据库变更

### 8.1 responses 集合

```javascript
// 旧文档
{
  _id: 'xxx',
  eventId: 'evt123',
  _openid: 'user456',
  nickname: '小明',
  slots: ['2024-03-23_3', '2024-03-23_4'],  // ← 旧格式
  createdAt: Date,
  updatedAt: Date
}

// 新文档
{
  _id: 'xxx',
  eventId: 'evt123',
  _openid: 'user456',
  nickname: '小明',
  slots: {                                    // ← 新格式
    '2024-03-23_3': 2,  // 硬约束
    '2024-03-23_4': 1   // 有空
  },
  createdAt: Date,
  updatedAt: Date
}
```

**无需数据库迁移。** `normalizeSlots()` 在读取时自动处理两种格式。

### 8.2 events 集合

无变更。新增字段 `algorithmVersion: 'v2'` 可选（用于追踪），但不影响现有逻辑。

## 9. 完整数据流

```
用户操作                    数据存储                     聚合计算
───────────────────────────────────────────────────────────────────
短按时段 ─→ score=1  ─┐
                        ├─→ slots: {id: score} ─→ normalizeSlots()
长按时段 ─→ score=2  ─┘        存入 responses           │
                                                        ▼
                                               for each slotId:
                                                 H = Σ(score==2)
                                                 W = Σ(score)
                                                 P = Σ(score/total_i)
                                                 Score = H × (W + α·P)
                                                        │
                                                        ▼
                                               sort by hardCount DESC,
                                                 totalScore DESC
                                                        │
                                                        ▼
                                            recommendations[0..4] + heatmap
```

## 10. 算法性质总结

| 性质 | 是否满足 | 说明 |
|------|----------|------|
| 单调性 | ✅ | 增加任何用户的评分不会降低时段排名 |
| 匿名性（一人一票） | ✅ | 所有用户对称，不区分身份 |
| 非独裁 | ✅ | 没有任何人能单独决定结果 |
| 帕累托最优 | ✅ | 如果所有人都提高某时段评分，其排名上升 |
| IIA | ❌ | 明确放弃，见 §4.2 |
| 全序传递性 | ❌ | 输出 Top-K 排名，不需要严格全序 |
| 策略抗性 | ⚠️ | 三级评分限制了操纵空间，但不完全免疫 |
| 计算复杂度 | O(N × M) | N=用户数，M=时段数。聚会场景 N≤50, M≤100，毫秒级 |

## 11. 边界情况处理

| 场景 | 处理方式 |
|------|----------|
| 所有人都没标记硬约束 | 退化为加权评分（等价于偏好集中度修正的 Approval Voting） |
| 只有 1 人投票 | 直接返回其所有选中的时段，硬约束排最前 |
| 0 人投票 | 返回空推荐列表 |
| 所有时段得分相同 | 按时间顺序排序（最早的优先） |
| 用户只选了硬约束时段 | 该用户的 `userTotal = 2`，偏好集中度贡献最大 |
| 旧数据（数组格式） | `normalizeSlots()` 自动转换为 `{ id: 1 }`，完全兼容 |

## 12. 为什么这个方案是"好品味"

1. **数据结构驱动**：把偏好编码在分值里，而不是加更多字段。一个 `{ slotId: score }` 对象替代了数组和额外的元数据。

2. **消除特殊情况**：`normalizeSlots()` 把旧格式和新格式统一为一个入口，下游代码不需要关心数据版本。

3. **零 UI 侵入（渐进式）**：不标记硬约束的用户，体验和现在完全一样。只有想表达偏好的人才长按。信息增益来自用户操作的自然延伸，不是新控件。

4. **向后兼容**：旧数据在服务端自动转换，前端可以逐步迁移。不需要一次性改完所有页面。

5. **可解释性**：推荐结果是"3 人必选 + 7 人有空 + 满意度 82%"，不是黑盒分数。用户能理解为什么推荐这个时间。
