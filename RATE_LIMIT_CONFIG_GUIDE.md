# 🔧 MIMO Token Plan 速率限制配置指南

## 当前配置

### 代码中的默认配置 (rate-limiter.ts)
```typescript
const DEFAULT_CONFIG: RateLimiterConfig = {
  requestsPerMinute: 60,      // 60 RPM — 标准API层级
  minIntervalMs: 0,           // 无请求间隔延迟
  cooldownBaseMs: 2000,       // 429 -> 等待2秒
  cooldownMaxMs: 30000,       // 最大等待30秒
  cooldownMultiplier: 2,      // 2s -> 4s -> 8s -> 16s -> 30s
  maxRetries: 3,              // 最多重试3次
};
```

### 配置文件 (~/.mimo/config.toml)
```toml
[api.tokenPlan]
apiKey = "tp-sf12u83b5s4ghyxnicfhh4xi2acqmc5jg149nqa2jjdb1mb5"
baseUrl = "https://token-plan-sgp.xiaomimimo.com/anthropic"
monthlyBudget = 999999999999
```

---

## ⚠️ 问题分析

**共享Key的RPM限制**：
- 所有MIMO用户共用同一个API Key
- 总RPM是固定的（假设为N）
- 用户数增加 → 每用户可用RPM减少
- 频繁429错误

**当前个人RPM设置**：
- 默认: 60 RPM
- 实际可用: 取决于总用户数
- 建议: 降低到20-30 RPM

---

## 🛠️ 修改方案

### 方案1: 修改代码中的默认配置（推荐）

**直接修改 rate-limiter.ts**：

```bash
# 使用脚本修改
./modify-rate-limiter.sh

# 或手动修改
sed -i 's/requestsPerMinute: 60/requestsPerMinute: 20/' src/api/rate-limiter.ts

# 重新编译
npm run build
```

**修改后的配置**：
```typescript
const DEFAULT_CONFIG: RateLimiterConfig = {
  requestsPerMinute: 20,      // 20 RPM - 降低以减少429错误
  minIntervalMs: 0,
  cooldownBaseMs: 2000,
  cooldownMaxMs: 30000,
  cooldownMultiplier: 2,
  maxRetries: 3,
};
```

### 方案2: 运行时动态修改

在代码中调用：
```typescript
import { getGlobalRateLimiter } from './api/rate-limiter';

const limiter = getGlobalRateLimiter();
limiter.updateConfig({
  requestsPerMinute: 20,  // 设置为20 RPM
  minIntervalMs: 3000,    // 每次请求间隔3秒
});
```

### 方案3: 使用配置工具

```bash
# 交互式配置工具
./configure-rate-limit.sh

# 直接修改rate-limiter.ts
./modify-rate-limiter.sh
```

---

## 📊 推荐配置

### 场景1: 个人用户（低频使用）
```typescript
{
  requestsPerMinute: 10,      // 10 RPM
  minIntervalMs: 6000,        // 6秒间隔
  maxRetries: 5,              // 5次重试
}
```

### 场景2: 团队用户（中频使用）
```typescript
{
  requestsPerMinute: 20,      // 20 RPM
  minIntervalMs: 3000,        // 3秒间隔
  maxRetries: 3,              // 3次重试
}
```

### 场景3: 高频使用（开发环境）
```typescript
{
  requestsPerMinute: 30,      // 30 RPM
  minIntervalMs: 2000,        // 2秒间隔
  maxRetries: 3,              // 3次重试
}
```

### 场景4: 默认配置
```typescript
{
  requestsPerMinute: 60,      // 60 RPM
  minIntervalMs: 0,           // 无间隔
  maxRetries: 3,              // 3次重试
}
```

---

## 🚀 快速修改步骤

### 步骤1: 查看当前配置
```bash
grep "requestsPerMinute" src/api/rate-limiter.ts
```

### 步骤2: 修改配置

**方法A: 使用脚本（推荐）**
```bash
./modify-rate-limiter.sh
```

**方法B: 手动修改**
```bash
# 备份
cp src/api/rate-limiter.ts src/api/rate-limiter.ts.backup

# 修改为20 RPM
sed -i 's/requestsPerMinute: 60/requestsPerMinute: 20/' src/api/rate-limiter.ts

# 或修改为10 RPM
sed -i 's/requestsPerMinute: 60/requestsPerMinute: 10/' src/api/rate-limiter.ts
```

**方法C: 直接编辑**
```bash
nano src/api/rate-limiter.ts
# 找到 requestsPerMinute: 60
# 修改为 requestsPerMinute: 20
```

### 步骤3: 重新编译
```bash
npm run build
```

### 步骤4: 测试
```bash
npm run dev
```

---

## 📈 RPM对比表

| RPM | 间隔 | 适用场景 | 429风险 | 推荐度 |
|-----|------|----------|---------|--------|
| 5   | 12秒 | 极低频 | 极低 | ⭐⭐⭐⭐⭐ |
| 10  | 6秒  | 低频 | 低 | ⭐⭐⭐⭐⭐ |
| 20  | 3秒  | 平衡 | 中低 | ⭐⭐⭐⭐⭐ |
| 30  | 2秒  | 高频 | 中 | ⭐⭐⭐⭐ |
| 60  | 1秒  | 默认 | 高 | ⭐⭐⭐ |

---

## 🎯 推荐配置

### 最佳平衡（推荐）
```typescript
requestsPerMinute: 20
```

**理由**：
- ✅ 减少429错误
- ✅ 保持可用性
- ✅ 适合大多数场景
- ✅ 共享Key友好

### 最少错误
```typescript
requestsPerMinute: 10
```

**理由**：
- ✅ 极少429错误
- ✅ 稳定可靠
- ⚠️ 响应稍慢

### 快速响应
```typescript
requestsPerMinute: 30
```

**理由**：
- ✅ 快速响应
- ⚠️ 可能遇到429
- ⚠️ 需要更多重试

---

## 🔧 高级配置

### 完整配置示例
```typescript
const DEFAULT_CONFIG: RateLimiterConfig = {
  requestsPerMinute: 20,      // 20 RPM
  minIntervalMs: 3000,        // 3秒最小间隔
  cooldownBaseMs: 5000,       // 429 -> 等待5秒
  cooldownMaxMs: 60000,       // 最大等待60秒
  cooldownMultiplier: 2,      // 指数退避
  maxRetries: 5,              // 最多重试5次
};
```

### 动态调整
```typescript
import { getGlobalRateLimiter } from './api/rate-limiter';

// 根据错误率动态调整
const limiter = getGlobalRateLimiter();
const stats = limiter.getStats();

if (stats.total429s > 10) {
  limiter.updateConfig({
    requestsPerMinute: 10,
    minIntervalMs: 6000,
  });
}
```

---

## 📊 监控和调试

### 查看当前状态
```typescript
const limiter = getGlobalRateLimiter();
const stats = limiter.getStats();

console.log('RPM:', limiter.getConfig().requestsPerMinute);
console.log('请求窗口:', stats.requestsInWindow);
console.log('429错误:', stats.total429s);
console.log('成功率:', stats.successRate + '%');
```

### 在MIMO中查看
```bash
# 查看统计
/stats

# 输出示例
Token 使用统计
  输入: 1,234 tokens
  输出: 567 tokens
  总计: 1,801 tokens
```

---

## 🛡️ 最佳实践

### 1. 从低RPM开始
```bash
# 先用10 RPM测试
./modify-rate-limiter.sh  # 选择10

# 如果稳定，再增加到20
./modify-rate-limiter.sh  # 选择20
```

### 2. 监控429错误
```bash
# 查看错误日志
/audit report

# 查看统计
/stats
```

### 3. 使用缓存减少请求
```toml
[promptCaching]
enabled = true
cacheTtl = 600  # 10分钟缓存
```

### 4. 合理设置重试
```typescript
maxRetries: 5  // 增加重试次数
```

---

## 🎯 立即行动

### 最快修改（1分钟）
```bash
# 1. 修改为20 RPM
sed -i 's/requestsPerMinute: 60/requestsPerMinute: 20/' src/api/rate-limiter.ts

# 2. 重新编译
npm run build

# 3. 启动
npm run dev
```

### 使用脚本（推荐）
```bash
./modify-rate-limiter.sh
```

### 交互式配置
```bash
./configure-rate-limit.sh
```

---

## 📝 修改记录

### 2026-06-01
- 创建配置工具
- 添加预设配置
- 优化建议

---

## 💡 总结

**问题**：共享Key的RPM限制导致429错误

**解决方案**：
1. ✅ 修改 rate-limiter.ts 中的 requestsPerMinute
2. ✅ 推荐设置为 20 RPM
3. ✅ 重新编译并测试

**推荐配置**：
```typescript
requestsPerMinute: 20  // 20 RPM
```

**立即执行**：
```bash
./modify-rate-limiter.sh
npm run build
npm run dev
```

---

**版本**: v2.0.0
**更新时间**: 2026-06-01
**推荐RPM**: 20
