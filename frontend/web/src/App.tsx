import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';
import { ethers } from 'ethers';

interface InheritanceData {
  id: string;
  name: string;
  encryptedAmount: string;
  beneficiary: string;
  triggerCondition: string;
  timestamp: number;
  creator: string;
  publicValue1: number;
  publicValue2: number;
  isVerified?: boolean;
  decryptedValue?: number;
}

interface InheritanceStats {
  totalAssets: number;
  verifiedAssets: number;
  pendingVerification: number;
  totalValue: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [inheritances, setInheritances] = useState<InheritanceData[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingInheritance, setCreatingInheritance] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending", 
    message: "" 
  });
  const [newInheritanceData, setNewInheritanceData] = useState({ 
    name: "", 
    amount: "", 
    beneficiary: "", 
    condition: "" 
  });
  const [selectedInheritance, setSelectedInheritance] = useState<InheritanceData | null>(null);
  const [decryptedAmount, setDecryptedAmount] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const [stats, setStats] = useState<InheritanceStats>({
    totalAssets: 0,
    verifiedAssets: 0,
    pendingVerification: 0,
    totalValue: 0
  });

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  const faqItems = [
    {
      question: "什么是隐私遗产协议？",
      answer: "隐私遗产协议是基于FHE全同态加密技术的去中心化遗产规划系统，确保遗产信息生前完全保密，触发条件满足后自动执行转移。"
    },
    {
      question: "FHE加密如何保护我的遗产？",
      answer: "使用Zama FHE技术，所有遗产金额数据在链上保持加密状态，只有通过生物特征验证后才能解密，确保生前隐私安全。"
    },
    {
      question: "触发条件有哪些？",
      answer: "支持多种触发条件包括：时间锁定、多签确认、生物特征验证、特定事件触发等智能合约条件。"
    },
    {
      question: "如何保证解密过程的安全？",
      answer: "采用FHE.checkSignatures验证机制，确保只有合法的受益人才能进行解密操作，防止未授权访问。"
    }
  ];

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected) return;
      if (isInitialized || fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        await initialize();
      } catch (error) {
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM初始化失败" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

  useEffect(() => {
    const loadDataAndContract = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        await loadData();
        const contract = await getContractReadOnly();
        if (contract) setContractAddress(await contract.getAddress());
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDataAndContract();
  }, [isConnected]);

  useEffect(() => {
    calculateStats();
  }, [inheritances]);

  const calculateStats = () => {
    const totalAssets = inheritances.length;
    const verifiedAssets = inheritances.filter(item => item.isVerified).length;
    const pendingVerification = totalAssets - verifiedAssets;
    const totalValue = inheritances.reduce((sum, item) => {
      return sum + (item.isVerified ? (item.decryptedValue || 0) : 0);
    }, 0);

    setStats({
      totalAssets,
      verifiedAssets,
      pendingVerification,
      totalValue
    });
  };

  const loadData = async () => {
    if (!isConnected) return;
    
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const inheritanceList: InheritanceData[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          inheritanceList.push({
            id: businessId,
            name: businessData.name,
            encryptedAmount: businessId,
            beneficiary: businessData.description,
            triggerCondition: "生物特征验证",
            timestamp: Number(businessData.timestamp),
            creator: businessData.creator,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          });
        } catch (e) {
          console.error('Error loading business data:', e);
        }
      }
      
      setInheritances(inheritanceList);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "加载数据失败" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const createInheritance = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "请先连接钱包" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingInheritance(true);
    setTransactionStatus({ visible: true, status: "pending", message: "使用Zama FHE创建加密遗产..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("获取合约失败");
      
      const amountValue = parseInt(newInheritanceData.amount) || 0;
      const businessId = `inheritance-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, amountValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newInheritanceData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        parseInt(newInheritanceData.condition) || 0,
        0,
        newInheritanceData.beneficiary
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "等待交易确认..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "遗产协议创建成功！" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowCreateModal(false);
      setNewInheritanceData({ name: "", amount: "", beneficiary: "", condition: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "用户取消交易" 
        : "提交失败: " + (e.message || "未知错误");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingInheritance(false); 
    }
  };

  const decryptData = async (businessId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "请先连接钱包" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(businessId);
      if (businessData.isVerified) {
        const storedValue = Number(businessData.decryptedValue) || 0;
        
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "数据已在链上验证" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        return storedValue;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(businessId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(businessId, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "在链上验证解密..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadData();
      
      setTransactionStatus({ visible: true, status: "success", message: "数据解密验证成功！" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "数据已在链上验证" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        await loadData();
        return null;
      }
      
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: "解密失败: " + (e.message || "未知错误") 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const filteredInheritances = inheritances.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.beneficiary.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderStatsDashboard = () => {
    return (
      <div className="stats-dashboard">
        <div className="stat-card gold-card">
          <div className="stat-icon">💰</div>
          <div className="stat-content">
            <h3>总资产数量</h3>
            <div className="stat-value">{stats.totalAssets}</div>
            <div className="stat-trend">加密遗产协议</div>
          </div>
        </div>
        
        <div className="stat-card silver-card">
          <div className="stat-icon">✅</div>
          <div className="stat-content">
            <h3>已验证资产</h3>
            <div className="stat-value">{stats.verifiedAssets}</div>
            <div className="stat-trend">链上验证完成</div>
          </div>
        </div>
        
        <div className="stat-card bronze-card">
          <div className="stat-icon">⏳</div>
          <div className="stat-content">
            <h3>待验证</h3>
            <div className="stat-value">{stats.pendingVerification}</div>
            <div className="stat-trend">等待解密验证</div>
          </div>
        </div>
        
        <div className="stat-card copper-card">
          <div className="stat-icon">💎</div>
          <div className="stat-content">
            <h3>总价值</h3>
            <div className="stat-value">{stats.totalValue}</div>
            <div className="stat-trend">FHE保护资产</div>
          </div>
        </div>
      </div>
    );
  };

  const renderFHEProcess = () => {
    return (
      <div className="fhe-process">
        <div className="process-step">
          <div className="step-number">1</div>
          <div className="step-content">
            <h4>资产加密</h4>
            <p>使用Zama FHE技术加密遗产金额 🔐</p>
          </div>
        </div>
        <div className="process-arrow">→</div>
        <div className="process-step">
          <div className="step-number">2</div>
          <div className="step-content">
            <h4>链上存储</h4>
            <p>加密数据安全存储在区块链上</p>
          </div>
        </div>
        <div className="process-arrow">→</div>
        <div className="process-step">
          <div className="step-number">3</div>
          <div className="step-content">
            <h4>触发解密</h4>
            <p>满足条件后通过生物特征验证解密</p>
          </div>
        </div>
        <div className="process-arrow">→</div>
        <div className="process-step">
          <div className="step-number">4</div>
          <div className="step-content">
            <h4>资产转移</h4>
            <p>验证成功后自动转移至受益人</p>
          </div>
        </div>
      </div>
    );
  };

  const renderFAQ = () => {
    return (
      <div className="faq-section">
        <h3>常见问题解答</h3>
        <div className="faq-list">
          {faqItems.map((item, index) => (
            <div key={index} className="faq-item">
              <div 
                className="faq-question"
                onClick={() => setFaqOpen(faqOpen === index ? null : index)}
              >
                <span>{item.question}</span>
                <span className="faq-icon">{faqOpen === index ? '−' : '+'}</span>
              </div>
              {faqOpen === index && (
                <div className="faq-answer">
                  {item.answer}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>隐私遗产协议 🔐</h1>
            <p>FHE全同态加密保护</p>
          </div>
          <div className="header-actions">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="metal-icon">⚱️</div>
            <h2>连接钱包开启加密遗产规划</h2>
            <p>使用Zama FHE技术，确保您的遗产信息生前完全保密，触发条件满足后自动安全转移</p>
            <div className="feature-grid">
              <div className="feature-item">
                <div className="feature-icon">🔒</div>
                <h4>生前完全保密</h4>
                <p>遗产金额全程加密，只有触发后才能解密</p>
              </div>
              <div className="feature-item">
                <div className="feature-icon">⚡</div>
                <h4>自动触发转移</h4>
                <p>满足预设条件后自动执行资产转移</p>
              </div>
              <div className="feature-item">
                <div className="feature-icon">🌐</div>
                <h4>去中心化信任</h4>
                <p>基于区块链技术，无需第三方信任</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="metal-spinner"></div>
        <p>初始化FHE加密系统...</p>
        <p className="loading-note">正在加载Zama FHE环境</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="metal-spinner"></div>
      <p>加载加密遗产系统...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>隐私遗产协议 ⚱️</h1>
          <p>FHE全同态加密 · 去中心化继承</p>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-btn metal-btn"
          >
            + 新建遗产协议
          </button>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>
      
      <main className="main-content">
        <section className="dashboard-section">
          <h2>加密遗产总览</h2>
          {renderStatsDashboard()}
          
          <div className="fhe-explanation metal-panel">
            <h3>FHE 🔐 加密继承流程</h3>
            {renderFHEProcess()}
          </div>
        </section>
        
        <section className="inheritances-section">
          <div className="section-header">
            <h2>我的遗产协议</h2>
            <div className="header-controls">
              <div className="search-box">
                <input 
                  type="text" 
                  placeholder="搜索协议名称或受益人..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                />
              </div>
              <button 
                onClick={loadData} 
                className="refresh-btn metal-btn" 
                disabled={isRefreshing}
              >
                {isRefreshing ? "刷新中..." : "刷新"}
              </button>
            </div>
          </div>
          
          <div className="inheritances-list">
            {filteredInheritances.length === 0 ? (
              <div className="no-inheritances">
                <div className="empty-icon">⚱️</div>
                <p>暂无遗产协议</p>
                <button 
                  className="create-btn metal-btn" 
                  onClick={() => setShowCreateModal(true)}
                >
                  创建第一个协议
                </button>
              </div>
            ) : filteredInheritances.map((item, index) => (
              <div 
                className={`inheritance-item ${selectedInheritance?.id === item.id ? "selected" : ""} ${item.isVerified ? "verified" : ""}`} 
                key={index}
                onClick={() => setSelectedInheritance(item)}
              >
                <div className="item-header">
                  <div className="item-title">{item.name}</div>
                  <div className={`status-badge ${item.isVerified ? "verified" : "pending"}`}>
                    {item.isVerified ? "✅ 已验证" : "⏳ 待验证"}
                  </div>
                </div>
                <div className="item-details">
                  <div className="detail-row">
                    <span>受益人:</span>
                    <strong>{item.beneficiary}</strong>
                  </div>
                  <div className="detail-row">
                    <span>触发条件:</span>
                    <span>{item.triggerCondition}</span>
                  </div>
                  <div className="detail-row">
                    <span>创建时间:</span>
                    <span>{new Date(item.timestamp * 1000).toLocaleDateString()}</span>
                  </div>
                </div>
                {item.isVerified && item.decryptedValue && (
                  <div className="decrypted-amount">
                    遗产金额: {item.decryptedValue}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
        
        <section className="faq-section-container">
          {renderFAQ()}
        </section>
      </main>
      
      {showCreateModal && (
        <CreateInheritanceModal 
          onSubmit={createInheritance} 
          onClose={() => setShowCreateModal(false)} 
          creating={creatingInheritance} 
          inheritanceData={newInheritanceData} 
          setInheritanceData={setNewInheritanceData}
          isEncrypting={isEncrypting}
        />
      )}
      
      {selectedInheritance && (
        <InheritanceDetailModal 
          inheritance={selectedInheritance} 
          onClose={() => { 
            setSelectedInheritance(null); 
            setDecryptedAmount(null); 
          }} 
          decryptedAmount={decryptedAmount} 
          setDecryptedAmount={setDecryptedAmount} 
          isDecrypting={isDecrypting || fheIsDecrypting} 
          decryptData={() => decryptData(selectedInheritance.id)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-toast">
          <div className={`toast-content ${transactionStatus.status}`}>
            <div className="toast-icon">
              {transactionStatus.status === "pending" && <div className="metal-spinner small"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
            </div>
            <div className="toast-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
    </div>
  );
};

const CreateInheritanceModal: React.FC<{
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  inheritanceData: any;
  setInheritanceData: (data: any) => void;
  isEncrypting: boolean;
}> = ({ onSubmit, onClose, creating, inheritanceData, setInheritanceData, isEncrypting }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === 'amount') {
      const intValue = value.replace(/[^\d]/g, '');
      setInheritanceData({ ...inheritanceData, [name]: intValue });
    } else {
      setInheritanceData({ ...inheritanceData, [name]: value });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal metal-modal">
        <div className="modal-header">
          <h2>新建隐私遗产协议</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice metal-notice">
            <strong>FHE 🔐 全同态加密</strong>
            <p>遗产金额将使用Zama FHE技术进行加密（仅支持整数）</p>
          </div>
          
          <div className="form-group">
            <label>协议名称 *</label>
            <input 
              type="text" 
              name="name" 
              value={inheritanceData.name} 
              onChange={handleChange} 
              placeholder="输入协议名称..." 
            />
          </div>
          
          <div className="form-group">
            <label>遗产金额（整数） *</label>
            <input 
              type="number" 
              name="amount" 
              value={inheritanceData.amount} 
              onChange={handleChange} 
              placeholder="输入遗产金额..." 
              step="1"
              min="0"
            />
            <div className="data-label">FHE加密整数</div>
          </div>
          
          <div className="form-group">
            <label>受益人地址 *</label>
            <input 
              type="text" 
              name="beneficiary" 
              value={inheritanceData.beneficiary} 
              onChange={handleChange} 
              placeholder="输入受益人钱包地址..." 
            />
          </div>
          
          <div className="form-group">
            <label>触发条件代码 *</label>
            <input 
              type="number" 
              min="1" 
              max="10" 
              name="condition" 
              value={inheritanceData.condition} 
              onChange={handleChange} 
              placeholder="输入条件代码..." 
            />
            <div className="data-label">公开数据</div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn metal-btn">取消</button>
          <button 
            onClick={onSubmit} 
            disabled={creating || isEncrypting || !inheritanceData.name || !inheritanceData.amount || !inheritanceData.beneficiary || !inheritanceData.condition} 
            className="submit-btn metal-btn"
          >
            {creating || isEncrypting ? "加密并创建中..." : "创建协议"}
          </button>
        </div>
      </div>
    </div>
  );
};

const InheritanceDetailModal: React.FC<{
  inheritance: InheritanceData;
  onClose: () => void;
  decryptedAmount: number | null;
  setDecryptedAmount: (value: number | null) => void;
  isDecrypting: boolean;
  decryptData: () => Promise<number | null>;
}> = ({ inheritance, onClose, decryptedAmount, setDecryptedAmount, isDecrypting, decryptData }) => {
  const handleDecrypt = async () => {
    if (decryptedAmount !== null) { 
      setDecryptedAmount(null); 
      return; 
    }
    
    const decrypted = await decryptData();
    if (decrypted !== null) {
      setDecryptedAmount(decrypted);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="detail-modal metal-modal">
        <div className="modal-header">
          <h2>遗产协议详情</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="inheritance-info">
            <div className="info-row">
              <span>协议名称:</span>
              <strong>{inheritance.name}</strong>
            </div>
            <div className="info-row">
              <span>创建者:</span>
              <strong>{inheritance.creator.substring(0, 6)}...{inheritance.creator.substring(38)}</strong>
            </div>
            <div className="info-row">
              <span>创建时间:</span>
              <strong>{new Date(inheritance.timestamp * 1000).toLocaleDateString()}</strong>
            </div>
            <div className="info-row">
              <span>受益人:</span>
              <strong>{inheritance.beneficiary}</strong>
            </div>
            <div className="info-row">
              <span>触发条件:</span>
              <strong>{inheritance.triggerCondition}</strong>
            </div>
          </div>
          
          <div className="data-section">
            <h3>加密遗产数据</h3>
            
            <div className="data-row">
              <div className="data-label">遗产金额:</div>
              <div className="data-value">
                {inheritance.isVerified && inheritance.decryptedValue ? 
                  `${inheritance.decryptedValue} (链上已验证)` : 
                  decryptedAmount !== null ? 
                  `${decryptedAmount} (本地解密)` : 
                  "🔒 FHE加密整数"
                }
              </div>
              <button 
                className={`decrypt-btn metal-btn ${(inheritance.isVerified || decryptedAmount !== null) ? 'decrypted' : ''}`}
                onClick={handleDecrypt} 
                disabled={isDecrypting}
              >
                {isDecrypting ? (
                  "🔓 验证中..."
                ) : inheritance.isVerified ? (
                  "✅ 已验证"
                ) : decryptedAmount !== null ? (
                  "🔄 重新验证"
                ) : (
                  "🔓 验证解密"
                )}
              </button>
            </div>
            
            <div className="fhe-info metal-notice">
              <div className="fhe-icon">🔐</div>
              <div>
                <strong>FHE 🔐 自中继解密</strong>
                <p>数据在链上保持加密状态。点击"验证解密"执行离线解密和链上验证。</p>
              </div>
            </div>
          </div>
          
          {(inheritance.isVerified || decryptedAmount !== null) && (
            <div className="verification-section">
              <h3>验证状态</h3>
              <div className="verification-status">
                <div className={`status-item ${inheritance.isVerified ? 'verified' : 'local'}`}>
                  <span>链上验证:</span>
                  <strong>{inheritance.isVerified ? '已完成' : '未完成'}</strong>
                </div>
                <div className="status-item">
                  <span>解密金额:</span>
                  <strong>
                    {inheritance.isVerified ? 
                      inheritance.decryptedValue : 
                      decryptedAmount
                    }
                  </strong>
                </div>
              </div>
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn metal-btn">关闭</button>
          {!inheritance.isVerified && (
            <button 
              onClick={handleDecrypt} 
              disabled={isDecrypting}
              className="verify-btn metal-btn"
            >
              {isDecrypting ? "链上验证中..." : "链上验证"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;


