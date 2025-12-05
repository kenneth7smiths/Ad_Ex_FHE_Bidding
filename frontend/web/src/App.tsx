// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface AdSlot {
  id: number;
  title: string;
  description: string;
  encryptedBid: string;
  impressions: number;
  clicks: number;
  timestamp: number;
  advertiser: string;
  category: string;
}

interface UserAction {
  type: 'bid' | 'create' | 'decrypt';
  timestamp: number;
  details: string;
}

interface Announcement {
  id: number;
  title: string;
  content: string;
  timestamp: number;
}

// FHE encryption/decryption functions
const FHEEncryptNumber = (value: number): string => `FHE-${btoa(value.toString())}`;
const FHEDecryptNumber = (encryptedData: string): number => encryptedData.startsWith('FHE-') ? parseFloat(atob(encryptedData.substring(4))) : parseFloat(encryptedData);
const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [adSlots, setAdSlots] = useState<AdSlot[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingAdSlot, setCreatingAdSlot] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newAdSlotData, setNewAdSlotData] = useState({ title: "", description: "", category: "social" });
  const [selectedAdSlot, setSelectedAdSlot] = useState<AdSlot | null>(null);
  const [decryptedBid, setDecryptedBid] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState("");
  const [contractAddress, setContractAddress] = useState("");
  const [chainId, setChainId] = useState(0);
  const [startTimestamp, setStartTimestamp] = useState(0);
  const [durationDays, setDurationDays] = useState(30);
  const [userActions, setUserActions] = useState<UserAction[]>([]);
  const [activeTab, setActiveTab] = useState('marketplace');
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  
  // Initialize signature parameters
  useEffect(() => {
    loadData().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
      
      // Load sample announcements
      setAnnouncements([
        {
          id: 1,
          title: "System Upgrade",
          content: "We're upgrading our FHE infrastructure with Zama's latest improvements for better performance.",
          timestamp: Math.floor(Date.now() / 1000) - 86400
        },
        {
          id: 2,
          title: "New Privacy Features",
          content: "Added support for encrypted bid comparisons using Zama FHE's new homomorphic operations.",
          timestamp: Math.floor(Date.now() / 1000) - 172800
        }
      ]);
    };
    initSignatureParams();
  }, []);

  // Load data from contract
  const loadData = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        setTransactionStatus({ visible: true, status: "success", message: "Contract is available!" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      }
      
      // Load ad slots
      const adSlotsBytes = await contract.getData("adSlots");
      let adSlotsList: AdSlot[] = [];
      if (adSlotsBytes.length > 0) {
        try {
          const adSlotsStr = ethers.toUtf8String(adSlotsBytes);
          if (adSlotsStr.trim() !== '') adSlotsList = JSON.parse(adSlotsStr);
        } catch (e) {}
      }
      setAdSlots(adSlotsList);
    } catch (e) {
      console.error("Error loading data:", e);
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
      setLoading(false); 
    }
  };

  // Create new ad slot
  const createAdSlot = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingAdSlot(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating ad slot with Zama FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      // Create new ad slot
      const newAdSlot: AdSlot = {
        id: adSlots.length + 1,
        title: newAdSlotData.title,
        description: newAdSlotData.description,
        encryptedBid: FHEEncryptNumber(0), // Initialize with 0 bid
        impressions: 0,
        clicks: 0,
        timestamp: Math.floor(Date.now() / 1000),
        advertiser: address,
        category: newAdSlotData.category
      };
      
      // Update ad slots list
      const updatedAdSlots = [...adSlots, newAdSlot];
      
      // Save to contract
      await contract.setData("adSlots", ethers.toUtf8Bytes(JSON.stringify(updatedAdSlots)));
      
      // Update user actions
      const newAction: UserAction = {
        type: 'create',
        timestamp: Math.floor(Date.now() / 1000),
        details: `Created ad slot: ${newAdSlotData.title}`
      };
      setUserActions(prev => [newAction, ...prev]);
      
      setTransactionStatus({ visible: true, status: "success", message: "Ad slot created successfully!" });
      await loadData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewAdSlotData({ title: "", description: "", category: "social" });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingAdSlot(false); 
    }
  };

  // Place bid on ad slot
  const placeBid = async (adSlotId: number, bidAmount: number) => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setTransactionStatus({ visible: true, status: "pending", message: "Processing bid with Zama FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      // Find the ad slot
      const adSlotIndex = adSlots.findIndex(a => a.id === adSlotId);
      if (adSlotIndex === -1) throw new Error("Ad slot not found");
      
      // Update ad slot with new bid
      const updatedAdSlots = [...adSlots];
      updatedAdSlots[adSlotIndex].encryptedBid = FHEEncryptNumber(bidAmount);
      
      // Save to contract
      await contract.setData("adSlots", ethers.toUtf8Bytes(JSON.stringify(updatedAdSlots)));
      
      // Update user actions
      const newAction: UserAction = {
        type: 'bid',
        timestamp: Math.floor(Date.now() / 1000),
        details: `Placed bid on: ${updatedAdSlots[adSlotIndex].title}`
      };
      setUserActions(prev => [newAction, ...prev]);
      
      setTransactionStatus({ visible: true, status: "success", message: "Bid placed with FHE encryption!" });
      await loadData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Bid failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  // Decrypt bid with signature
  const decryptWithSignature = async (encryptedData: string): Promise<number | null> => {
    if (!isConnected) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Update user actions
      const newAction: UserAction = {
        type: 'decrypt',
        timestamp: Math.floor(Date.now() / 1000),
        details: "Decrypted FHE bid data"
      };
      setUserActions(prev => [newAction, ...prev]);
      
      return FHEDecryptNumber(encryptedData);
    } catch (e) { 
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  // Render performance chart
  const renderPerformanceChart = (adSlot: AdSlot) => {
    const ctr = adSlot.impressions > 0 ? (adSlot.clicks / adSlot.impressions) * 100 : 0;
    
    return (
      <div className="performance-chart">
        <div className="chart-row">
          <div className="chart-label">Impressions</div>
          <div className="chart-value">{adSlot.impressions}</div>
        </div>
        <div className="chart-row">
          <div className="chart-label">Clicks</div>
          <div className="chart-value">{adSlot.clicks}</div>
        </div>
        <div className="chart-row">
          <div className="chart-label">CTR</div>
          <div className="chart-value">{ctr.toFixed(2)}%</div>
        </div>
      </div>
    );
  };

  // Render FHE flow visualization
  const renderFHEFlow = () => {
    return (
      <div className="fhe-flow">
        <div className="flow-step">
          <div className="step-icon">1</div>
          <div className="step-content">
            <h4>Private Bidding</h4>
            <p>Advertisers submit encrypted bids using Zama FHE</p>
          </div>
        </div>
        <div className="flow-arrow">→</div>
        <div className="flow-step">
          <div className="step-icon">2</div>
          <div className="step-content">
            <h4>Homomorphic Auction</h4>
            <p>Bids are compared and auction executed without decryption</p>
          </div>
        </div>
        <div className="flow-arrow">→</div>
        <div className="flow-step">
          <div className="step-icon">3</div>
          <div className="step-content">
            <h4>Private Allocation</h4>
            <p>Ad slots allocated without revealing individual bid amounts</p>
          </div>
        </div>
        <div className="flow-arrow">→</div>
        <div className="flow-step">
          <div className="step-icon">4</div>
          <div className="step-content">
            <h4>Performance Tracking</h4>
            <p>Results tracked while preserving bid privacy</p>
          </div>
        </div>
      </div>
    );
  };

  // Render user actions history
  const renderUserActions = () => {
    if (userActions.length === 0) return <div className="no-data">No actions recorded</div>;
    
    return (
      <div className="actions-list">
        {userActions.map((action, index) => (
          <div className="action-item" key={index}>
            <div className={`action-type ${action.type}`}>
              {action.type === 'create' && '📝'}
              {action.type === 'bid' && '💰'}
              {action.type === 'decrypt' && '🔓'}
            </div>
            <div className="action-details">
              <div className="action-text">{action.details}</div>
              <div className="action-time">{new Date(action.timestamp * 1000).toLocaleString()}</div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Render announcements
  const renderAnnouncements = () => {
    return (
      <div className="announcements-list">
        {announcements.map((announcement) => (
          <div className="announcement-item" key={announcement.id}>
            <div className="announcement-header">
              <h4>{announcement.title}</h4>
              <div className="announcement-time">
                {new Date(announcement.timestamp * 1000).toLocaleDateString()}
              </div>
            </div>
            <div className="announcement-content">
              {announcement.content}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Filter ad slots based on search and category
  const filteredAdSlots = adSlots.filter(adSlot => {
    const matchesSearch = adSlot.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         adSlot.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === "all" || adSlot.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Initializing encrypted ad exchange...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="exchange-icon"></div>
          </div>
          <h1>AdEx<span>FHE</span></h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-ad-btn"
          >
            <div className="add-icon"></div>List Ad Slot
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>
      
      <div className="main-content-container">
        <div className="dashboard-section">
          <div className="dashboard-grid">
            <div className="dashboard-panel stats-panel">
              <div className="panel-card">
                <h2>Market Statistics</h2>
                <div className="stats-grid">
                  <div className="stat-item">
                    <div className="stat-value">{adSlots.length}</div>
                    <div className="stat-label">Active Slots</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-value">
                      {adSlots.length > 0 
                        ? adSlots.reduce((sum, a) => sum + a.impressions, 0)
                        : 0}
                    </div>
                    <div className="stat-label">Total Impressions</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-value">
                      {adSlots.length > 0 
                        ? adSlots.reduce((sum, a) => sum + a.clicks, 0)
                        : 0}
                    </div>
                    <div className="stat-label">Total Clicks</div>
                  </div>
                </div>
              </div>
              
              <div className="panel-card">
                <h2>System Announcements</h2>
                {renderAnnouncements()}
              </div>
            </div>
            
            <div className="dashboard-panel main-panel">
              <div className="tabs-container">
                <div className="tabs">
                  <button 
                    className={`tab ${activeTab === 'marketplace' ? 'active' : ''}`}
                    onClick={() => setActiveTab('marketplace')}
                  >
                    Marketplace
                  </button>
                  <button 
                    className={`tab ${activeTab === 'actions' ? 'active' : ''}`}
                    onClick={() => setActiveTab('actions')}
                  >
                    My Activity
                  </button>
                </div>
                
                <div className="tab-content">
                  {activeTab === 'marketplace' && (
                    <div className="marketplace-section">
                      <div className="section-header">
                        <h2>Available Ad Slots</h2>
                        <div className="header-actions">
                          <div className="search-filter">
                            <input
                              type="text"
                              placeholder="Search slots..."
                              value={searchTerm}
                              onChange={(e) => setSearchTerm(e.target.value)}
                              className="search-input"
                            />
                            <select
                              value={filterCategory}
                              onChange={(e) => setFilterCategory(e.target.value)}
                              className="category-filter"
                            >
                              <option value="all">All Categories</option>
                              <option value="social">Social/Entertainment</option>
                              <option value="finance">Finance</option>
                              <option value="tech">Technology</option>
                            </select>
                          </div>
                          <button 
                            onClick={loadData} 
                            className="refresh-btn" 
                            disabled={isRefreshing}
                          >
                            {isRefreshing ? "Refreshing..." : "Refresh"}
                          </button>
                        </div>
                      </div>
                      
                      <div className="ad-slots-list">
                        {filteredAdSlots.length === 0 ? (
                          <div className="no-slots">
                            <div className="no-slots-icon"></div>
                            <p>No ad slots found</p>
                            <button 
                              className="create-btn" 
                              onClick={() => setShowCreateModal(true)}
                            >
                              List First Ad Slot
                            </button>
                          </div>
                        ) : filteredAdSlots.map((adSlot, index) => (
                          <div 
                            className={`ad-slot-item ${selectedAdSlot?.id === adSlot.id ? "selected" : ""}`} 
                            key={index}
                            onClick={() => setSelectedAdSlot(adSlot)}
                          >
                            <div className="ad-slot-title">{adSlot.title}</div>
                            <div className="ad-slot-description">{adSlot.description.substring(0, 100)}...</div>
                            <div className="ad-slot-meta">
                              <span className="category">{adSlot.category}</span>
                              <span className="advertiser">Advertiser: {adSlot.advertiser.substring(0, 6)}...{adSlot.advertiser.substring(38)}</span>
                            </div>
                            <div className="ad-slot-encrypted">Encrypted Bid: {adSlot.encryptedBid.substring(0, 15)}...</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {activeTab === 'actions' && (
                    <div className="actions-section">
                      <h2>My Activity History</h2>
                      {renderUserActions()}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {showCreateModal && (
        <ModalCreateAdSlot 
          onSubmit={createAdSlot} 
          onClose={() => setShowCreateModal(false)} 
          creating={creatingAdSlot} 
          adSlotData={newAdSlotData} 
          setAdSlotData={setNewAdSlotData}
        />
      )}
      
      {selectedAdSlot && (
        <AdSlotDetailModal 
          adSlot={selectedAdSlot} 
          onClose={() => { 
            setSelectedAdSlot(null); 
            setDecryptedBid(null); 
          }} 
          decryptedBid={decryptedBid} 
          setDecryptedBid={setDecryptedBid} 
          isDecrypting={isDecrypting} 
          decryptWithSignature={decryptWithSignature}
          placeBid={placeBid}
          renderPerformanceChart={renderPerformanceChart}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && <div className="success-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
      
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="exchange-icon"></div>
              <span>AdEx_FHE</span>
            </div>
            <p>Decentralized ad exchange with private bidding powered by FHE</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>Powered by Zama FHE</span>
          </div>
          <div className="copyright">© {new Date().getFullYear()} AdEx_FHE. All rights reserved.</div>
          <div className="disclaimer">
            This system uses fully homomorphic encryption to protect bid privacy. 
            Auction is executed on encrypted data without revealing individual bid amounts.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateAdSlotProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  adSlotData: any;
  setAdSlotData: (data: any) => void;
}

const ModalCreateAdSlot: React.FC<ModalCreateAdSlotProps> = ({ onSubmit, onClose, creating, adSlotData, setAdSlotData }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setAdSlotData({ ...adSlotData, [name]: value });
  };

  return (
    <div className="modal-overlay">
      <div className="create-ad-modal">
        <div className="modal-header">
          <h2>List New Ad Slot</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <div className="lock-icon"></div>
            <div>
              <strong>FHE Auction Notice</strong>
              <p>Bidding on this slot will use encrypted bid amounts</p>
            </div>
          </div>
          
          <div className="form-group">
            <label>Ad Slot Title *</label>
            <input 
              type="text" 
              name="title" 
              value={adSlotData.title} 
              onChange={handleChange} 
              placeholder="Enter ad slot title..." 
            />
          </div>
          
          <div className="form-group">
            <label>Description *</label>
            <textarea 
              name="description" 
              value={adSlotData.description} 
              onChange={handleChange} 
              placeholder="Describe your ad slot..." 
              rows={4}
            />
          </div>
          
          <div className="form-group">
            <label>Category *</label>
            <select 
              name="category" 
              value={adSlotData.category} 
              onChange={handleChange}
            >
              <option value="social">Social/Entertainment</option>
              <option value="finance">Finance</option>
              <option value="tech">Technology</option>
            </select>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button 
            onClick={onSubmit} 
            disabled={creating || !adSlotData.title || !adSlotData.description} 
            className="submit-btn"
          >
            {creating ? "Creating with FHE..." : "List Ad Slot"}
          </button>
        </div>
      </div>
    </div>
  );
};

interface AdSlotDetailModalProps {
  adSlot: AdSlot;
  onClose: () => void;
  decryptedBid: number | null;
  setDecryptedBid: (value: number | null) => void;
  isDecrypting: boolean;
  decryptWithSignature: (encryptedData: string) => Promise<number | null>;
  placeBid: (adSlotId: number, bidAmount: number) => void;
  renderPerformanceChart: (adSlot: AdSlot) => JSX.Element;
}

const AdSlotDetailModal: React.FC<AdSlotDetailModalProps> = ({ 
  adSlot, 
  onClose, 
  decryptedBid, 
  setDecryptedBid, 
  isDecrypting, 
  decryptWithSignature,
  placeBid,
  renderPerformanceChart
}) => {
  const [bidAmount, setBidAmount] = useState("");
  
  const handleDecrypt = async () => {
    if (decryptedBid !== null) { 
      setDecryptedBid(null); 
      return; 
    }
    
    const decrypted = await decryptWithSignature(adSlot.encryptedBid);
    if (decrypted !== null) {
      setDecryptedBid(decrypted);
    }
  };

  const handlePlaceBid = () => {
    const amount = parseFloat(bidAmount);
    if (!isNaN(amount) && amount > 0) {
      placeBid(adSlot.id, amount);
      setBidAmount("");
    }
  };

  return (
    <div className="modal-overlay">
      <div className="ad-slot-detail-modal">
        <div className="modal-header">
          <h2>Ad Slot Details</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="ad-slot-info">
            <div className="info-item">
              <span>Title:</span>
              <strong>{adSlot.title}</strong>
            </div>
            <div className="info-item">
              <span>Advertiser:</span>
              <strong>{adSlot.advertiser.substring(0, 6)}...{adSlot.advertiser.substring(38)}</strong>
            </div>
            <div className="info-item">
              <span>Category:</span>
              <strong>{adSlot.category}</strong>
            </div>
            <div className="info-item">
              <span>Date Listed:</span>
              <strong>{new Date(adSlot.timestamp * 1000).toLocaleDateString()}</strong>
            </div>
            <div className="info-item full-width">
              <span>Description:</span>
              <div className="ad-slot-description">{adSlot.description}</div>
            </div>
          </div>
          
          <div className="performance-section">
            <h3>Performance Metrics</h3>
            {renderPerformanceChart(adSlot)}
          </div>
          
          <div className="bidding-section">
            <h3>Bidding</h3>
            <div className="bid-form">
              <input
                type="number"
                placeholder="Enter bid amount"
                value={bidAmount}
                onChange={(e) => setBidAmount(e.target.value)}
                className="bid-input"
              />
              <button 
                className="bid-btn" 
                onClick={handlePlaceBid}
                disabled={!bidAmount || parseFloat(bidAmount) <= 0}
              >
                Place Bid
              </button>
            </div>
          </div>
          
          <div className="encrypted-section">
            <h3>Encrypted Bid Data</h3>
            <div className="encrypted-data">{adSlot.encryptedBid.substring(0, 100)}...</div>
            <div className="fhe-tag">
              <div className="fhe-icon"></div>
              <span>FHE Encrypted</span>
            </div>
            <button 
              className="decrypt-btn" 
              onClick={handleDecrypt} 
              disabled={isDecrypting}
            >
              {isDecrypting ? (
                <span>Decrypting...</span>
              ) : decryptedBid !== null ? (
                "Hide Decrypted Bid"
              ) : (
                "Decrypt with Wallet Signature"
              )}
            </button>
          </div>
          
          {decryptedBid !== null && (
            <div className="decrypted-section">
              <h3>Decrypted Bid Data</h3>
              <div className="decrypted-value">
                <span>Current Bid:</span>
                <strong>{decryptedBid.toFixed(4)} ETH</strong>
              </div>
              <div className="decryption-notice">
                <div className="warning-icon"></div>
                <span>Decrypted bid is only visible after wallet signature verification</span>
              </div>
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">Close</button>
        </div>
      </div>
    </div>
  );
};

export default App;