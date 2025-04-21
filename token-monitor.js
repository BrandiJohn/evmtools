require('dotenv').config();
const { ethers } = require('ethers');
const winston = require('winston');
const path = require('path');

// ERC-20 代币标准ABI (只需要Transfer事件)
const ERC20_ABI = [
    "event Transfer(address indexed from, address indexed to, uint256 value)"
];

// 配置日志系统
const createLogger = () => {
    const logDir = process.env.LOG_DIR || './logs';
    const logLevel = process.env.LOG_LEVEL || 'info';
    const enableFileLogging = process.env.ENABLE_FILE_LOGGING === 'true';
    
    const transports = [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ];

    if (enableFileLogging) {
        // 确保日志目录存在
        const fs = require('fs');
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }

        // 添加文件日志传输器
        transports.push(
            // 所有日志
            new winston.transports.File({
                filename: path.join(logDir, 'all.log'),
                format: winston.format.combine(
                    winston.format.timestamp(),
                    winston.format.json()
                )
            }),
            // 错误日志
            new winston.transports.File({
                filename: path.join(logDir, 'error.log'),
                level: 'error',
                format: winston.format.combine(
                    winston.format.timestamp(),
                    winston.format.json()
                )
            }),
            // 交易日志
            new winston.transports.File({
                filename: path.join(logDir, 'transactions.log'),
                level: 'info',
                format: winston.format.combine(
                    winston.format.timestamp(),
                    winston.format.json()
                )
            })
        );
    }

    return winston.createLogger({
        level: logLevel,
        transports: transports
    });
};

const logger = createLogger();

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
            logger.info(`✅ 已连接到网络: ${network.name} (Chain ID: ${network.chainId})`);
            
            // 创建合约实例
            if (!process.env.TOKEN_CONTRACT_ADDRESS) {
                throw new Error('请在.env文件中设置TOKEN_CONTRACT_ADDRESS');
            }
            
            this.contract = new ethers.Contract(
                process.env.TOKEN_CONTRACT_ADDRESS,
                ERC20_ABI,
                this.provider
            );
            
            logger.info(`📄 监听合约地址: ${process.env.TOKEN_CONTRACT_ADDRESS}`);
            
            // 获取代币基本信息
            await this.getTokenInfo();
            
        } catch (error) {
            logger.error('❌ 初始化失败:', { error: error.message, stack: error.stack });
            process.exit(1);
        }
    }

    async getTokenInfo() {
        try {
            // 尝试获取代币信息 (某些代币可能没有这些函数)
            const code = await this.provider.getCode(process.env.TOKEN_CONTRACT_ADDRESS);
            if (code === '0x') {
                logger.warn('⚠️ 警告: 指定地址不是合约地址');
                return;
            }
            
            logger.info('🔍 代币合约验证成功');
        } catch (error) {
            logger.warn('⚠️ 无法获取代币详细信息:', { error: error.message });
        }
    }

    async startMonitoring() {
        if (this.isMonitoring) {
            logger.info('📡 监听已在运行中...');
            return;
        }

        this.isMonitoring = true;
        logger.info('🚀 开始监听代币转移事件...');
        
        // 设置事件过滤器
        let filter = this.contract.filters.Transfer();
        
        // 如果指定了特定地址，添加过滤条件
        if (process.env.WATCH_ADDRESS) {
            logger.info(`👀 专门监听地址: ${process.env.WATCH_ADDRESS}`);
            
            if (process.env.MONITOR_OUTGOING_ONLY === 'true') {
                logger.info('📤 只监听发送交易');
                filter = this.contract.filters.Transfer(process.env.WATCH_ADDRESS, null);
            } else if (process.env.MONITOR_INCOMING_ONLY === 'true') {
                logger.info('📥 只监听接收交易');
                filter = this.contract.filters.Transfer(null, process.env.WATCH_ADDRESS);
            } else {
                logger.info('🔄 监听发送和接收交易');
                // 监听该地址作为发送方或接收方的转账
                filter = [
                    this.contract.filters.Transfer(process.env.WATCH_ADDRESS, null),
                    this.contract.filters.Transfer(null, process.env.WATCH_ADDRESS)
                ];
            }
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
            logger.error('❌ 监听错误:', { error: error.message, stack: error.stack });
        });

        // 如果启用ETH转账监控
        if (process.env.MONITOR_ETH_TRANSFERS === 'true' && process.env.WATCH_ADDRESS) {
            await this.startEthMonitoring();
        }

        logger.info('✅ 监听已启动，等待转账事件...');
        logger.info('按 Ctrl+C 停止监听\n');
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
            
            // 判断交易类型
            const isOutgoing = process.env.WATCH_ADDRESS && from.toLowerCase() === process.env.WATCH_ADDRESS.toLowerCase();
            const isIncoming = process.env.WATCH_ADDRESS && to.toLowerCase() === process.env.WATCH_ADDRESS.toLowerCase();
            
            let transactionType = '🔄';
            let typeText = '代币转移';
            
            if (isOutgoing) {
                transactionType = '📤';
                typeText = '发送代币';
            } else if (isIncoming) {
                transactionType = '📥';
                typeText = '接收代币';
            }
            
            // 构造交易信息对象
            const transactionInfo = {
                type: typeText,
                timestamp: timestamp,
                from: from,
                to: to,
                amount: formattedValue,
                hash: tx.hash,
                blockNumber: receipt.blockNumber.toString(),
                gasPrice: ethers.formatUnits(tx.gasPrice || 0, 'gwei'),
                gasUsed: receipt.gasUsed.toString(),
                isOutgoing: isOutgoing,
                isIncoming: isIncoming
            };

            // 控制台输出
            logger.info(`${transactionType} 检测到${typeText}:`);
            logger.info(`   时间: ${timestamp}`);
            logger.info(`   从: ${from}`);
            logger.info(`   到: ${to}`);
            logger.info(`   数量: ${formattedValue} tokens`);
            logger.info(`   交易哈希: ${tx.hash}`);
            logger.info(`   区块号: ${receipt.blockNumber}`);
            logger.info(`   Gas 价格: ${ethers.formatUnits(tx.gasPrice || 0, 'gwei')} Gwei`);
            logger.info(`   Gas 使用: ${receipt.gasUsed.toString()}`);
            logger.info('   ' + '─'.repeat(50));

            // 如果是发送交易，记录特殊日志
            if (isOutgoing) {
                logger.info('🚨 发送交易警报', {
                    alert: 'OUTGOING_TRANSACTION',
                    watchAddress: process.env.WATCH_ADDRESS,
                    transaction: transactionInfo,
                    network: (await this.provider.getNetwork()).name
                });
            }

            // 记录到交易日志文件
            logger.info('交易记录', {
                category: 'TOKEN_TRANSFER', 
                transaction: transactionInfo
            });
            
            // 可以在这里添加更多处理逻辑，比如:
            // - 发送通知
            // - 写入数据库
            // - 触发其他操作
            
        } catch (error) {
            logger.error('❌ 处理转账事件时出错:', { error: error.message, stack: error.stack });
        }
    }

    async getHistoricalTransfers(fromBlock = 'latest', toBlock = 'latest', limit = 10) {
        try {
            logger.info(`🔍 查询历史转账记录 (从区块 ${fromBlock} 到 ${toBlock})...`);
            
            const filter = this.contract.filters.Transfer();
            const events = await this.contract.queryFilter(filter, fromBlock, toBlock);
            
            logger.info(`📊 找到 ${events.length} 条转账记录\n`);
            
            // 显示最近的几条记录
            const recentEvents = events.slice(-limit);
            
            for (const event of recentEvents) {
                const { from, to, value } = event.args;
                const formattedValue = ethers.formatEther(value);
                
                logger.info(`从: ${from}`);
                logger.info(`到: ${to}`);
                logger.info(`数量: ${formattedValue} tokens`);
                logger.info(`交易: ${event.transactionHash}`);
                logger.info(`区块: ${event.blockNumber}\n`);
                
                // 记录历史交易
                logger.info('历史交易记录', {
                    category: 'HISTORICAL_TRANSFER',
                    from: from,
                    to: to,
                    amount: formattedValue,
                    hash: event.transactionHash,
                    blockNumber: event.blockNumber
                });
            }
            
        } catch (error) {
            logger.error('❌ 查询历史记录失败:', { error: error.message, stack: error.stack });
        }
    }

    async startEthMonitoring() {
        if (this.ethMonitoring) {
            return;
        }

        this.ethMonitoring = true;
        logger.info('💰 启动ETH转账监听...');
        
        // 监听新区块
        this.provider.on('block', async (blockNumber) => {
            try {
                const block = await this.provider.getBlock(blockNumber, true);
                if (!block || !block.transactions) return;

                // 检查区块中的交易
                for (const tx of block.transactions) {
                    if (typeof tx === 'string') continue;
                    
                    // 检查是否涉及监听地址
                    const watchAddress = process.env.WATCH_ADDRESS.toLowerCase();
                    const isOutgoing = tx.from && tx.from.toLowerCase() === watchAddress;
                    const isIncoming = tx.to && tx.to.toLowerCase() === watchAddress;
                    
                    if (isOutgoing || isIncoming) {
                        // 只监听普通ETH转账 (不是合约调用)
                        if (tx.data === '0x' && tx.value && tx.value > 0) {
                            await this.handleEthTransfer(tx, isOutgoing);
                        }
                    }
                }
            } catch (error) {
                logger.error('❌ ETH转账监听错误:', { error: error.message, stack: error.stack });
            }
        });
    }

    async handleEthTransfer(tx, isOutgoing) {
        try {
            const ethAmount = ethers.formatEther(tx.value);
            
            // 检查最小金额阈值
            if (process.env.MIN_ETH_THRESHOLD) {
                const threshold = parseFloat(process.env.MIN_ETH_THRESHOLD);
                if (parseFloat(ethAmount) < threshold) {
                    return;
                }
            }

            const timestamp = new Date().toLocaleString();
            const transactionType = isOutgoing ? '📤' : '📥';
            const typeText = isOutgoing ? '发送ETH' : '接收ETH';

            // 构造ETH交易信息对象
            const ethTransactionInfo = {
                type: typeText,
                timestamp: timestamp,
                from: tx.from,
                to: tx.to,
                amount: ethAmount,
                hash: tx.hash,
                gasPrice: ethers.formatUnits(tx.gasPrice || 0, 'gwei'),
                gasLimit: tx.gasLimit ? tx.gasLimit.toString() : 'N/A',
                isOutgoing: isOutgoing
            };

            // 控制台输出
            logger.info(`${transactionType} 检测到${typeText}:`);
            logger.info(`   时间: ${timestamp}`);
            logger.info(`   从: ${tx.from}`);
            logger.info(`   到: ${tx.to}`);
            logger.info(`   数量: ${ethAmount} ETH`);
            logger.info(`   交易哈希: ${tx.hash}`);
            logger.info(`   Gas 价格: ${ethers.formatUnits(tx.gasPrice || 0, 'gwei')} Gwei`);
            logger.info(`   Gas 限制: ${tx.gasLimit ? tx.gasLimit.toString() : 'N/A'}`);
            logger.info('   ' + '─'.repeat(50));

            // 如果是发送ETH交易，记录特殊日志
            if (isOutgoing) {
                logger.info('🚨 ETH发送交易警报', {
                    alert: 'OUTGOING_ETH_TRANSACTION',
                    watchAddress: process.env.WATCH_ADDRESS,
                    transaction: ethTransactionInfo,
                    network: (await this.provider.getNetwork()).name
                });
            }

            // 记录到交易日志文件
            logger.info('ETH交易记录', {
                category: 'ETH_TRANSFER',
                transaction: ethTransactionInfo
            });

        } catch (error) {
            logger.error('❌ 处理ETH转账时出错:', { error: error.message, stack: error.stack });
        }
    }

    stop() {
        if (this.contract) {
            this.contract.removeAllListeners();
        }
        if (this.provider && this.ethMonitoring) {
            this.provider.removeAllListeners('block');
        }
        this.isMonitoring = false;
        this.ethMonitoring = false;
        logger.info('⏹️ 监听已停止');
    }
}

// 主函数
async function main() {
    const monitor = new TokenMonitor();
    
    // 处理程序退出
    process.on('SIGINT', () => {
        logger.info('\n📴 正在停止监听...');
        monitor.stop();
        process.exit(0);
    });

    try {
        await monitor.initialize();
        
        // 如果需要查看历史记录，取消下面的注释
        // await monitor.getHistoricalTransfers(-100); // 查看最近100个区块的转账
        
        await monitor.startMonitoring();
        
    } catch (error) {
        logger.error('❌ 程序运行失败:', { error: error.message, stack: error.stack });
        process.exit(1);
    }
}

// 运行主函数
if (require.main === module) {
    main();
}