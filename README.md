# EVM Tools - 代币转移监听工具

这是一个用于监听EVM兼容区块链上ERC-20代币转移的工具。

## 功能特性

- 🔄 实时监听ERC-20代币转移事件
- 💰 支持监听ETH原生转账
- 📤 专门监听某个地址的发送交易
- 📥 专门监听某个地址的接收交易
- 📊 查询历史转账记录  
- 🎯 支持监听特定地址
- 💰 支持设置最小金额阈值
- 🔍 显示详细的交易信息（Gas价格、区块号等）

## 安装和配置

1. 安装依赖：
```bash
npm install
```

2. 配置环境变量：
```bash
cp .env.example .env
```

3. 编辑 `.env` 文件，设置以下参数：

### 基础配置
- `RPC_URL`: RPC节点URL (如 Infura、Alchemy)
- `TOKEN_CONTRACT_ADDRESS`: 要监听的代币合约地址
- `WATCH_ADDRESS`: (可选) 特定监听地址

### 监听模式配置
- `MONITOR_OUTGOING_ONLY`: 只监听发送交易 (true/false)
- `MONITOR_INCOMING_ONLY`: 只监听接收交易 (true/false)  
- `MONITOR_ETH_TRANSFERS`: 是否同时监听ETH转账 (true/false)

### 金额阈值配置
- `MIN_AMOUNT_THRESHOLD`: 最小代币转账金额阈值
- `MIN_ETH_THRESHOLD`: 最小ETH转账金额阈值

## 使用方法

### 启动监听
```bash
npm start
```

### 开发模式
```bash
npm run dev
```

## 使用示例

### 示例1：监听特定地址的所有USDT发送交易
```bash
# .env 配置
RPC_URL=https://mainnet.infura.io/v3/YOUR_PROJECT_ID
TOKEN_CONTRACT_ADDRESS=0xdAC17F958D2ee523a2206206994597C13D831ec7
WATCH_ADDRESS=0x1234567890123456789012345678901234567890
MONITOR_OUTGOING_ONLY=true
MIN_AMOUNT_THRESHOLD=100
```

### 示例2：监听特定地址的ETH和代币接收
```bash  
# .env 配置
RPC_URL=https://mainnet.infura.io/v3/YOUR_PROJECT_ID
TOKEN_CONTRACT_ADDRESS=0xA0b86a33E6441b4b6F44863a8a1d9B08d88a1f52
WATCH_ADDRESS=0x1234567890123456789012345678901234567890
MONITOR_INCOMING_ONLY=true
MONITOR_ETH_TRANSFERS=true
MIN_ETH_THRESHOLD=0.1
```

### 示例3：监听所有USDC转账（无地址限制）
```bash
# .env 配置
RPC_URL=https://mainnet.infura.io/v3/YOUR_PROJECT_ID
TOKEN_CONTRACT_ADDRESS=0xA0b86a33E6441b4b6F44863a8a1d9B08d88a1f52
# WATCH_ADDRESS 留空
MIN_AMOUNT_THRESHOLD=1000
```

## 配置说明

### RPC_URL 示例
- Ethereum 主网 (Infura): `https://mainnet.infura.io/v3/YOUR_PROJECT_ID`
- Ethereum 主网 (Alchemy): `https://eth-mainnet.alchemyapi.io/v2/YOUR_API_KEY`
- BSC 主网: `https://bsc-dataseed.binance.org/`
- Polygon 主网: `https://polygon-rpc.com/`

### 代币合约地址示例
- USDT (Ethereum): `0xdAC17F958D2ee523a2206206994597C13D831ec7`
- USDC (Ethereum): `0xA0b86a33E6441b4b6F44863a8a1d9B08d88a1f52`

## 输出信息

### 代币转账输出示例
```
📤 检测到发送代币:
   时间: 2024/1/15 下午3:45:30
   从: 0x1234567890123456789012345678901234567890
   到: 0x0987654321098765432109876543210987654321
   数量: 1000.0 tokens
   交易哈希: 0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890
   区块号: 18850000
   Gas 价格: 25.5 Gwei
   Gas 使用: 65000
```

### ETH转账输出示例
```
📥 检测到接收ETH:
   时间: 2024/1/15 下午3:46:12
   从: 0x0987654321098765432109876543210987654321
   到: 0x1234567890123456789012345678901234567890
   数量: 0.5 ETH
   交易哈希: 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
   Gas 价格: 23.2 Gwei
   Gas 限制: 21000
```

## 注意事项

- 确保RPC节点稳定可用
- 某些RPC节点可能有请求限制
- 大量转账的代币可能产生大量日志输出
- ETH转账监听会消耗更多RPC请求（每个区块都要检查）
- 建议在生产环境中添加日志文件和错误处理
- 使用MONITOR_OUTGOING_ONLY可以减少不必要的事件处理

## 扩展功能

可以在 `handleTransfer` 函数中添加更多处理逻辑：
- 发送邮件/短信通知
- 写入数据库存储
- 触发其他自动化操作
- 集成第三方API

## 故障排除

如果遇到问题，请检查：
1. RPC_URL 是否正确且可访问
2. TOKEN_CONTRACT_ADDRESS 是否为有效的ERC-20合约
3. 网络连接是否稳定
4. 是否有足够的API请求配额