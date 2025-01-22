require('dotenv').config();
const { ethers } = require('ethers');

// ERC-20 代币标准ABI (只需要Transfer事件)
const ERC20_ABI = [
    "event Transfer(address indexed from, address indexed to, uint256 value)"
];

class TokenMonitor {
    constructor() {
        this.provider = null;
        this.contract = null;
        this.isMonitoring = false;
    }

    async initialize() {
        try {
            // 连接到RPC节点
            this.provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
            
            // 测试连接
            const network = await this.provider.getNetwork();
            console.log(`✅ 已连接到网络: ${network.name} (Chain ID: ${network.chainId})`);
            
            // 创建合约实例
            if (!process.env.TOKEN_CONTRACT_ADDRESS) {
                throw new Error('请在.env文件中设置TOKEN_CONTRACT_ADDRESS');
            }
            
            this.contract = new ethers.Contract(
                process.env.TOKEN_CONTRACT_ADDRESS,
                ERC20_ABI,
                this.provider
            );
            
            console.log(`📄 监听合约地址: ${process.env.TOKEN_CONTRACT_ADDRESS}`);
            
            // 获取代币基本信息
            await this.getTokenInfo();
            
        } catch (error) {
            console.error('❌ 初始化失败:', error.message);
            process.exit(1);
        }
    }

    async getTokenInfo() {
        try {
            // 尝试获取代币信息 (某些代币可能没有这些函数)
            const code = await this.provider.getCode(process.env.TOKEN_CONTRACT_ADDRESS);
            if (code === '0x') {
                console.warn('⚠️ 警告: 指定地址不是合约地址');
                return;
            }
            
            console.log('🔍 代币合约验证成功');
        } catch (error) {
            console.warn('⚠️ 无法获取代币详细信息:', error.message);
        }
    }

    async startMonitoring() {
        if (this.isMonitoring) {
            console.log('📡 监听已在运行中...');
            return;
        }

        this.isMonitoring = true;
        console.log('🚀 开始监听代币转移事件...');
        
        // 设置事件过滤器
        let filter = this.contract.filters.Transfer();
        
        // 如果指定了特定地址，添加过滤条件
        if (process.env.WATCH_ADDRESS) {
            console.log(`👀 专门监听地址: ${process.env.WATCH_ADDRESS}`);
            // 监听该地址作为发送方或接收方的转账
            filter = [
                this.contract.filters.Transfer(process.env.WATCH_ADDRESS, null),
                this.contract.filters.Transfer(null, process.env.WATCH_ADDRESS)
            ];
        }

        // 监听新的Transfer事件
        if (Array.isArray(filter)) {
            // 监听多个过滤器
            filter.forEach((f, index) => {
                this.contract.on(f, this.handleTransfer.bind(this));
            });
        } else {
            // 监听单个过滤器
            this.contract.on(filter, this.handleTransfer.bind(this));
        }

        // 监听错误
        this.contract.on('error', (error) => {
            console.error('❌ 监听错误:', error);
        });

        console.log('✅ 监听已启动，等待转账事件...');
        console.log('按 Ctrl+C 停止监听\n');
    }

    async handleTransfer(from, to, value, event) {
        try {
            // 获取交易详情
            const tx = await event.getTransaction();
            const receipt = await event.getTransactionReceipt();
            
            // 格式化金额 (假设18位小数，大多数ERC20代币使用18位)
            const formattedValue = ethers.formatEther(value);
            
            // 检查最小金额阈值
            if (process.env.MIN_AMOUNT_THRESHOLD) {
                const threshold = parseFloat(process.env.MIN_AMOUNT_THRESHOLD);
                if (parseFloat(formattedValue) < threshold) {
                    return; // 忽略小额转账
                }
            }

            // 获取当前时间
            const timestamp = new Date().toLocaleString();
            
            console.log('🔄 检测到代币转移:');
            console.log(`   时间: ${timestamp}`);
            console.log(`   从: ${from}`);
            console.log(`   到: ${to}`);
            console.log(`   数量: ${formattedValue} tokens`);
            console.log(`   交易哈希: ${tx.hash}`);
            console.log(`   区块号: ${receipt.blockNumber}`);
            console.log(`   Gas 使用: ${receipt.gasUsed.toString()}`);
            console.log('   ' + '─'.repeat(50));
            
            // 可以在这里添加更多处理逻辑，比如:
            // - 发送通知
            // - 写入数据库
            // - 触发其他操作
            
        } catch (error) {
            console.error('❌ 处理转账事件时出错:', error.message);
        }
    }

    async getHistoricalTransfers(fromBlock = 'latest', toBlock = 'latest', limit = 10) {
        try {
            console.log(`🔍 查询历史转账记录 (从区块 ${fromBlock} 到 ${toBlock})...`);
            
            const filter = this.contract.filters.Transfer();
            const events = await this.contract.queryFilter(filter, fromBlock, toBlock);
            
            console.log(`📊 找到 ${events.length} 条转账记录\n`);
            
            // 显示最近的几条记录
            const recentEvents = events.slice(-limit);
            
            for (const event of recentEvents) {
                const { from, to, value } = event.args;
                const formattedValue = ethers.formatEther(value);
                
                console.log(`从: ${from}`);
                console.log(`到: ${to}`);
                console.log(`数量: ${formattedValue} tokens`);
                console.log(`交易: ${event.transactionHash}`);
                console.log(`区块: ${event.blockNumber}\n`);
            }
            
        } catch (error) {
            console.error('❌ 查询历史记录失败:', error.message);
        }
    }

    stop() {
        if (this.contract) {
            this.contract.removeAllListeners();
        }
        this.isMonitoring = false;
        console.log('⏹️ 监听已停止');
    }
}

// 主函数
async function main() {
    const monitor = new TokenMonitor();
    
    // 处理程序退出
    process.on('SIGINT', () => {
        console.log('\n📴 正在停止监听...');
        monitor.stop();
        process.exit(0);
    });

    try {
        await monitor.initialize();
        
        // 如果需要查看历史记录，取消下面的注释
        // await monitor.getHistoricalTransfers(-100); // 查看最近100个区块的转账
        
        await monitor.startMonitoring();
        
    } catch (error) {
        console.error('❌ 程序运行失败:', error.message);
        process.exit(1);
    }
}

// 运行主函数
if (require.main === module) {
    main();
}