  import CryptoJS from 'crypto-js';
  import React, { useState, useEffect } from 'react';
  import Web3 from 'web3';
  import FileStorage from './contracts/FileStorage.json';
  import ipfs from './ipfs';
  import { Buffer } from 'buffer';
  import './App.css';
  import logo from './assets/logo.png'; // Or from 'public/logo.png'
  window.Buffer = Buffer;

  function App() {
    const [account, setAccount] = useState('');
    const [contract, setContract] = useState(null);
    const [fileName, setFileName] = useState('');
    const [fileBuffer, setFileBuffer] = useState(null);
    const [encryptionKey, setEncryptionKey] = useState('');
    const [myFiles, setMyFiles] = useState([]);
    const [sharedFiles, setSharedFiles] = useState([]);
    const [shareAddress, setShareAddress] = useState('');
    const [shareHash, setShareHash] = useState('');
    const [accessLogs, setAccessLogs] = useState([]);
    const [selectedFile, setSelectedFile] = useState(null);
    const [activeTab, setActiveTab] = useState('upload');
    const [showMyFiles, setShowMyFiles] = useState(false);
    const [showSharedFiles, setShowSharedFiles] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState('disconnected');
    const [web3Instance, setWeb3Instance] = useState(null);
    const [loadingFiles, setLoadingFiles] = useState(false);

    // New state variables for individual file decryption keys
    const [fileDecryptionKeys, setFileDecryptionKeys] = useState({});
    const [showDecryptionFields, setShowDecryptionFields] = useState({});

    // Helper functions for key management
    const updateDecryptionKey = (ipfsHash, key) => {
      setFileDecryptionKeys(prev => ({
        ...prev,
        [ipfsHash]: key
      }));
    };

    const toggleDecryptionField = (ipfsHash) => {
      setShowDecryptionFields(prev => ({
        ...prev,
        [ipfsHash]: !prev[ipfsHash]
      }));
    };

    const clearDecryptionKey = (ipfsHash) => {
      setFileDecryptionKeys(prev => {
        const updated = { ...prev };
        delete updated[ipfsHash];
        return updated;
      });
      setShowDecryptionFields(prev => ({
        ...prev,
        [ipfsHash]: false
      }));
    };

    // Initial blockchain setup
    useEffect(() => {
      const loadBlockchain = async () => {
        setIsLoading(true);
        setConnectionStatus('connecting');
        try {
          if (window.ethereum) {
            const web3 = new Web3(window.ethereum);
            setWeb3Instance(web3);
            await window.ethereum.request({ method: 'eth_requestAccounts' });
            const accounts = await web3.eth.getAccounts();
            if (accounts.length > 0) {
              setAccount(accounts[0]);
              const contractAddress = process.env.REACT_APP_CONTRACT_ADDRESS;
              if (!contractAddress) {
                alert('Contract address not found in environment variables.');
                setConnectionStatus('error');
                return;
              }
              const contractInstance = new web3.eth.Contract(
                FileStorage.abi,
                contractAddress
              );
              setContract(contractInstance);
              setConnectionStatus('connected');
            } else {
              setConnectionStatus('error');
              alert('No accounts found. Please connect your wallet.');
            }
          } else {
            alert('Please install MetaMask!');
            setConnectionStatus('no-metamask');
          }
        } catch (error) {
          console.error("Blockchain connection error:", error);
          setConnectionStatus('error');
          alert("Error connecting to blockchain: " + error.message);
        } finally {
          setIsLoading(false);
        }
      };

      loadBlockchain();
    }, []);

    // Load files when contract and account are available
    useEffect(() => {
      const loadAllFiles = async () => {
        if (contract && account && connectionStatus === 'connected') {
          setLoadingFiles(true);
          try {
            await Promise.all([
              loadMyFiles(),
              loadSharedFiles()
            ]);
          } catch (error) {
            console.error("Error loading files:", error);
          } finally {
            setLoadingFiles(false);
          }
        }
      };

      loadAllFiles();
    }, [contract, account, connectionStatus]);

    // Listen for account changes
    useEffect(() => {
      if (window.ethereum) {
        const handleAccountsChanged = async (accounts) => {
          if (accounts.length > 0) {
            setAccount(accounts[0]);
            // Clear decryption keys when account changes
            setFileDecryptionKeys({});
            setShowDecryptionFields({});
          } else {
            setAccount('');
            setContract(null);
            setMyFiles([]);
            setSharedFiles([]);
            setFileDecryptionKeys({});
            setShowDecryptionFields({});
            setConnectionStatus('disconnected');
          }
        };

        window.ethereum.on('accountsChanged', handleAccountsChanged);

        return () => {
          window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        };
      }
    }, []);

    const captureFile = (e) => {
      e.preventDefault();
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.readAsArrayBuffer(file);
      reader.onloadend = () => {
        setFileBuffer(Buffer(reader.result));
        setFileName(file.name);
      };
    };

    const handleDragOver = (e) => {
      e.preventDefault();
      setIsDragging(true);
    };

    const handleDragLeave = (e) => {
      e.preventDefault();
      setIsDragging(false);
    };

    const handleDrop = (e) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.readAsArrayBuffer(file);
      reader.onloadend = () => {
        setFileBuffer(Buffer(reader.result));
        setFileName(file.name);
      };
    };

    const encryptData = (buffer, key) => {
      const wordArray = CryptoJS.lib.WordArray.create(buffer);
      const encrypted = CryptoJS.AES.encrypt(wordArray, key).toString();
      return Buffer.from(encrypted);
    };

    const decryptData = (encryptedData, key) => {
      try {
        const decrypted = CryptoJS.AES.decrypt(encryptedData, key);
        const typedArray = new Uint8Array(decrypted.sigBytes);
        for (let i = 0; i < decrypted.sigBytes; i++) {
          typedArray[i] = decrypted.words[i >>> 2] >>> (24 - (i % 4) * 8) & 0xff;
        }
        return new Blob([typedArray]);
      } catch (error) {
        throw new Error('Decryption failed. Check your key.');
      }
    };

        const uploadFile = async () => {
      if (!fileBuffer || !fileName || !encryptionKey) {
        return alert("Please choose a file, enter name and encryption key");
      }
      if (!contract || !account) {
        return alert("Please connect your wallet first");
      }

      setIsLoading(true);

      const originalSizeKB = (fileBuffer.length / 1024).toFixed(2);
      const encryptStart = performance.now();
      let encrypted;
      let encryptTime = 0;

      try {
        encrypted = encryptData(fileBuffer, encryptionKey);
        encryptTime = (performance.now() - encryptStart).toFixed(2);
      } catch (err) {
        console.error("Encryption failed:", err);
        alert("Encryption failed: " + err.message);
        setIsLoading(false);
        return;
      }

      const encryptedSizeKB = (encrypted.length / 1024).toFixed(2);
      const uploadStart = performance.now();

      try {
        const ipfsResult = await ipfs.add(encrypted);
        const ipfsHash = ipfsResult.path;
        const uploadTime = performance.now() - uploadStart;

        const tx = await contract.methods.uploadFile(ipfsHash, fileName).send({
          from: account,
          gas: 300000
        });

        const totalTime = (performance.now() - encryptStart).toFixed(2);
        const gasUsed = tx.gasUsed || 'N/A';

        // ✅ Final console test output
        console.log("================= Blockchain File Upload Test Report =================");
        console.log("File Name:", fileName);
        console.log("Original File Size (KB):", originalSizeKB);
        console.log("Encrypted File Size (KB):", encryptedSizeKB);
        console.log("File Encrypted:", encrypted ? "Yes" : "No");
        console.log("Time Taken to Encrypt (ms):", encryptTime);
        console.log("Time Taken to Upload (ms):", uploadTime.toFixed(2));
        console.log("Total Time Taken (ms):", totalTime);
        console.log("Gas Used:", gasUsed);
        console.log("IPFS Hash:", ipfsHash);
        console.log("======================================================================");

        alert("Encrypted file uploaded and stored successfully!");
        
        // Reset form
        setFileBuffer(null);
        setFileName('');
        setEncryptionKey('');
        document.getElementById('fileInput').value = '';
        await loadMyFiles();

      } catch (error) {
        console.error("Upload error:", error);
        alert("Upload failed: " + (error.message || "Please try again"));
      } finally {
        setIsLoading(false);
      }
    };


    const shareFile = async () => {
      if (!shareHash || !shareAddress) {
        return alert("Please enter both IPFS hash and recipient address");
      }
      if (!contract || !account) {
        return alert("Please connect your wallet first");
      }

      setIsLoading(true);
      try {
        await contract.methods.shareFile(shareHash, shareAddress).send({
          from: account,
          gas: 200000
        });

        alert("File shared successfully!");
        setShareHash('');
        setShareAddress('');

        // Reload shared files
        await loadSharedFiles();
      } catch (err) { 
        console.error("Share error:", err);
        alert("Failed to share file: " + (err.message || "Please try again"));
      } finally {
        setIsLoading(false);
      }
    };

    const loadMyFiles = async () => {
      if (!contract || !account) {
        console.log("Contract or account not available for loading my files");
        return;
      }

      try {
        console.log("Loading my files for account:", account);
        const hashes = await contract.methods.getMyFiles().call({ from: account });
        console.log("Retrieved hashes:", hashes);

        if (!hashes || hashes.length === 0) {
          setMyFiles([]);
          return;
        }

        const filePromises = hashes.map(async (hash) => {
          try {
            const file = await contract.methods.getFile(hash).call({ from: account });
            return {
              ipfsHash: file[0],
              fileName: file[1],
              owner: file[2]
            };
          } catch (error) {
            console.error(`Error loading file with hash ${hash}:`, error);
            return null;
          }
        });

        const files = await Promise.all(filePromises);
        const validFiles = files.filter(Boolean);
        console.log("Loaded my files:", validFiles);
        setMyFiles(validFiles);
      } catch (err) {
        console.error("Error loading my files:", err);
        setMyFiles([]);
      }
    };

    const loadSharedFiles = async () => {
      if (!contract || !account) {
        console.log("Contract or account not available for loading shared files");
        return;
      }

      try {
        console.log("Loading shared files for account:", account);
        const hashes = await contract.methods.getSharedFiles().call({ from: account });
        console.log("Retrieved shared hashes:", hashes);

        if (!hashes || hashes.length === 0) {
          setSharedFiles([]);
          return;
        }

        const filePromises = hashes.map(async (hash) => {
          try {
            const file = await contract.methods.getFile(hash).call({ from: account });
            return {
              ipfsHash: file[0],
              fileName: file[1],
              owner: file[2]
            };
          } catch (error) {
            console.error(`Error loading shared file with hash ${hash}:`, error);
            return null;
          }
        });

        const files = await Promise.all(filePromises);
        const validFiles = files.filter(Boolean);
        console.log("Loaded shared files:", validFiles);
        setSharedFiles(validFiles);
      } catch (err) {
        console.error("Error loading shared files:", err);
        setSharedFiles([]);
      }
    };

    // Updated handleDecrypt function to use individual file keys
    const handleDecrypt = async (ipfsHash, fileName) => {
      const decryptionKey = fileDecryptionKeys[ipfsHash];
      
      if (!decryptionKey) {
        return alert("Please enter the decryption key for this file first");
      }
      
      setIsLoading(true);
      const downloadStart = performance.now();
      
      try {
        const response = await fetch(`https://ipfs.io/ipfs/${ipfsHash}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch file: ${response.statusText}`);
        }
        
        const text = await response.text();
        const blob = decryptData(text, decryptionKey);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        window.URL.revokeObjectURL(url);
        
        const downloadEnd = performance.now();
        console.log(`Downloaded "${fileName}" in ${(downloadEnd - downloadStart).toFixed(2)}ms`);
        alert("File downloaded and decrypted successfully!");
        
        // Clear the decryption key after successful download
        clearDecryptionKey(ipfsHash);
        
      } catch (err) {
        console.error("Decryption error:", err);
        alert("Failed to decrypt: " + (err.message || "Please check your decryption key"));
      } finally {
        setIsLoading(false);
      }
    };

    const handleViewFile = (ipfsHash, fileName) => {
      const ipfsUrl = `https://ipfs.io/ipfs/${ipfsHash}`;
      window.open(ipfsUrl, '_blank');
      console.log(`Viewing file "${fileName}" at: ${ipfsUrl}`);
      alert(`Opening "${fileName}" in IPFS viewer`);
    };

    const fetchAccessLogs = async (ipfsHash, fileName) => {
      if (!contract || !account) {
        return alert("Please connect your wallet first");
      }

      // Additional check: ensure user is the file owner
      try {
        const file = await contract.methods.getFile(ipfsHash).call({ from: account });
        if (file[2].toLowerCase() !== account.toLowerCase()) {
          return alert("Access logs are only available for files you own");
        }
      } catch (error) {
        return alert("Error verifying file ownership");
      }

      setIsLoading(true);
      try {
        await contract.methods.logAccess(ipfsHash).send({
          from: account,
          gas: 100000
        });

        const logs = await contract.getPastEvents("FileAccessed", {
          filter: { ipfsHash },
          fromBlock: 0,
          toBlock: "latest",
        });

        const logList = logs.map((log) => {
          const rawTimestamp = log.returnValues.timestamp;
          const timestamp = new Date(Number(rawTimestamp) * 1000).toLocaleString();
          return {
            user: log.returnValues.accessor,
            timestamp,
          };
        });

        setSelectedFile(fileName);
        setAccessLogs(logList);
        alert(`Found ${logList.length} access log(s) for "${fileName}"`);
      } catch (err) {
        console.error("Error fetching logs:", err);
        alert("Could not fetch access logs: " + (err.message || "Please try again"));
      } finally {
        setIsLoading(false);
      }
    };

    const getPasswordStrength = (password) => {
      if (password.length >= 12) return { text: 'Strong', color: '#22c55e' };
      if (password.length >= 8) return { text: 'Medium', color: '#f59e0b' };
      return { text: 'Weak', color: '#ef4444' };
    };

    const getConnectionStatusColor = () => {
      switch (connectionStatus) {
        case 'connected': return '#22c55e';
        case 'connecting': return '#f59e0b';
        case 'error': return '#ef4444';
        default: return '#64748b';
      }
    };

    const getConnectionStatusText = () => {
      switch (connectionStatus) {
        case 'connected': return 'Connected';
        case 'connecting': return 'Connecting...';
        case 'error': return 'Error';
        case 'no-metamask': return 'Install MetaMask';
        default: return 'Disconnected';
      }
    };

    // Updated renderFileActions function with individual decryption key fields
    const renderFileActions = (file, isMyFile) => {
      const showKeyField = showDecryptionFields[file.ipfsHash];
      const hasKey = fileDecryptionKeys[file.ipfsHash];
      
      return (
        <div className="file-actions">
          <button 
            className="action-button view" 
            onClick={() => handleViewFile(file.ipfsHash, file.fileName)}
            disabled={isLoading}
          >
            View
          </button>
          
          {showKeyField ? (
            <div className="decrypt-key-container">
              <input
                type="password"
                placeholder="Enter decryption key"
                value={fileDecryptionKeys[file.ipfsHash] || ''}
                onChange={(e) => updateDecryptionKey(file.ipfsHash, e.target.value)}
                className="decrypt-key-input"
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && hasKey) {
                    handleDecrypt(file.ipfsHash, file.fileName);
                  }
                }}
              />
              <button 
                className="action-button download" 
                onClick={() => handleDecrypt(file.ipfsHash, file.fileName)}
                disabled={isLoading || !hasKey}
              >
                Download
              </button>
              <button 
                className="action-button cancel" 
                onClick={() => clearDecryptionKey(file.ipfsHash)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button 
              className="action-button download" 
              onClick={() => toggleDecryptionField(file.ipfsHash)}
              disabled={isLoading}
            >
              Download
            </button>
          )}
          
          {isMyFile && (
            <button 
              className="action-button logs" 
              onClick={() => fetchAccessLogs(file.ipfsHash, file.fileName)}
              disabled={isLoading}
            >
              Logs
            </button>
          )}
        </div>
      );
    };

    if (isLoading && !contract) {
      return (
        <div className="loading-screen">
          <div className="loading-spinner"></div>
          <h2>Connecting to Web3...</h2>
          <div className="loading-details">
            <p>Please wait while we connect to your wallet...</p>
            <p>Make sure MetaMask is installed and unlocked</p>
          </div>
        </div>
      );
    }

    return (
      <div className="dashboard-root">
        {isLoading && (
          <div className="loading-overlay">
            <div className="loading-spinner"></div>
          </div>
        )}

        <header className="top-nav">
          
        

          <div className="nav-brand">
            <img src={logo} alt="Block Storage Logo" style={{
              height: '40px',
              width: 'auto',
              borderRadius: '1px',
              boxShadow: '0 0 8px rgba(0,0,0,0.4)'
            }} />
            <span>Block Storage</span>
            
          </div>

          

          <div className="nav-actions">
            <div className="connection-indicator">
              <div 
                className="status-dot" 
                style={{ backgroundColor: getConnectionStatusColor() }}
              ></div>
              <span className="status-text">{getConnectionStatusText()}</span>
            </div>

            {account && (
              <div className="wallet-indicator">
                <span className="wallet-short">
                  {account.slice(0, 6)}...{account.slice(-4)}
                </span>
              </div>
            )}

            <button 
              className="nav-btn refresh-btn" 
              onClick={() => window.location.reload()}
              disabled={isLoading}
            >
              Refresh
            </button>
          </div>
        </header>

        <aside className="sidebar">
          <div className="sidebar-header">
            <div className="sidebar-stats">
              <div className="stat-item">
                <span className="stat-number">{myFiles.length}</span>
                <span className="stat-label">My Files</span>
              </div>
              <div className="stat-divider"></div>
              <div className="stat-item">
                <span className="stat-number">{sharedFiles.length}</span>
                <span className="stat-label">Shared</span>
              </div>
            </div>
          </div>

          <nav className="sidebar-nav">
            <button
              className={`sidebar-btn ${activeTab === 'upload' ? 'active' : ''}`}
              onClick={() => setActiveTab('upload')}
            >
              <span className="sidebar-text">Upload Files</span>
              <span className="nav-indicator"></span>
            </button>

            <button
              className={`sidebar-btn ${activeTab === 'share' ? 'active' : ''}`}
              onClick={() => setActiveTab('share')}
            >
              <span className="sidebar-text">File Access</span>
              <span className="nav-indicator"></span>
            </button>

            <button
              className={`sidebar-btn ${activeTab === 'myfiles' ? 'active' : ''}`}
              onClick={() => setActiveTab('myfiles')}
            >
              <span className="sidebar-text">My Files</span>
              <span className="nav-indicator"></span>
            </button>

            <button
              className={`sidebar-btn ${activeTab === 'shared' ? 'active' : ''}`}
              onClick={() => setActiveTab('shared')}
            >
              <span className="sidebar-text">Shared Files</span>
              <span className="nav-indicator"></span>
            </button>
          </nav>

          <div className="sidebar-footer">
            <div className="network-info">
              <span className="network-label">Network:</span>
              <span className="network-name">Ethereum</span>
            </div>
          </div>
        </aside>

        <main className="main-content-wrapper">
          <div className="main-content">
            {account && (
              <div className="wallet-info">
                <div className="wallet-details">
                  <strong>Connected Wallet</strong>
                  <span className="wallet-address">{account}</span>
                </div>
                <div className="wallet-balance">
                  <span className="balance-label">Status</span>
                  <span className="balance-value" style={{ color: getConnectionStatusColor() }}>
                    {getConnectionStatusText()}
                  </span>
                </div>
              </div>
            )}

            <div className="tab-content">
              {activeTab === 'upload' && (
                <>
                  <div className="tab-header">
                    <h3>Upload & Encrypt</h3>
                    <p>Securely upload your files with AES encryption</p>
                  </div>

                  <div
                    className={`file-drop ${isDragging ? 'dragging' : ''} ${fileBuffer ? 'has-file' : ''}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => document.getElementById('fileInput').click()}
                  >
                    <div className="drop-content">
                      {!fileBuffer ? (
                        <>
                          <div className="upload-icon-wrapper">UPLOAD</div>
                          <div className="upload-text">
                            Drop your file here or <button className="browse-btn">browse</button>
                          </div>
                          <div className="upload-subtitle">Supports all file types • Max 100MB</div>
                        </>
                      ) : (
                        <>
                          <div className="upload-icon-wrapper">✓</div>
                          <div className="file-name">{fileName}</div>
                          <button className="change-file-btn">Change File</button>
                        </>
                      )}
                    </div>
                    <input
                      type="file"
                      id="fileInput"
                      onChange={captureFile}
                      style={{ display: 'none' }}
                    />
                  </div>

                  <div className="input-group">
                    <label className="input-label">
                      Encryption Key
                      {encryptionKey && (
                        <span 
                          className="password-strength"
                          style={{ color: getPasswordStrength(encryptionKey).color }}
                        >
                          ({getPasswordStrength(encryptionKey).text})
                        </span>
                      )}
                    </label>
                    <input
                      type="password"
                      placeholder="Enter a strong encryption key..."
                      value={encryptionKey}
                      onChange={(e) => setEncryptionKey(e.target.value)}
                      className="input-field"
                    />
                  </div>

                  <button 
                    className="action-btn primary" 
                    onClick={uploadFile} 
                    disabled={isLoading || !fileBuffer || !encryptionKey}
                  >
                    {isLoading ? ' Uploading...' : ' Encrypt & Upload'}
                  </button>
                </>
              )}

              {activeTab === 'share' && (
                <>
                  <div className="tab-header">
                    <h3>File Access</h3>
                    <p>Share your files securely with other users</p>
                  </div>

                  <div className="input-group">
                    <label>IPFS Hash</label>
                    <input
                      type="text"
                      placeholder="Enter IPFS hash of the file to share"
                      value={shareHash}
                      onChange={(e) => setShareHash(e.target.value)}
                      className="input-field"
                    />
                  </div>

                  <div className="input-group">
                    <label>Recipient Address</label>
                    <input
                      type="text"
                      placeholder="Enter Ethereum address (0x...)"
                      value={shareAddress}
                      onChange={(e) => setShareAddress(e.target.value)}
                      className="input-field"
                    />
                  </div>

                  <button 
                    className="action-btn secondary" 
                    onClick={shareFile}
                    disabled={isLoading || !shareHash || !shareAddress}
                  >
                    {isLoading ? ' Sharing...' : ' Share File'}
                  </button>
                </>
              )}

              {activeTab === 'myfiles' && (
                <>
                  <div className="tab-header">
                    <h3>My Files</h3>
                    <p>Manage and access your encrypted files</p>
                  </div>

                  <div className="files-section">
                    <div 
                      className="files-header" 
                      onClick={() => setShowMyFiles(!showMyFiles)}
                    >
                      <h4>Your Uploaded Files ({myFiles.length})</h4>
                      <span className={`toggle-icon ${showMyFiles ? 'open' : ''}`}>
                        ▼
                      </span>
                    </div>
                    
                    {showMyFiles && (
                      <div className="files-list">
                        {loadingFiles ? (
                          <div className="empty-state">Loading files...</div>
                        ) : myFiles.length === 0 ? (
                          <div className="empty-state">No files uploaded yet</div>
                        ) : (
                          myFiles.map((file, index) => (
                            <div key={index} className="file-item">
                              <div className="file-info">
                                <div className="file-type-indicator">
                                  {file.fileName.split('.').pop()?.toUpperCase() || 'FILE'}
                                </div>
                                <div>
                                  <div className="filename">{file.fileName}</div>
                                  <span className="file-owner">Owner: {file.owner}</span>
                                </div>
                              </div>
                              {renderFileActions(file, true)}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}

              {activeTab === 'shared' && (
                <>
                  <div className="tab-header">
                    <h3>Shared Files</h3>
                    <p>Files that have been shared with you</p>
                  </div>

                  <div className="files-section">
                    <div 
                      className="files-header" 
                      onClick={() => setShowSharedFiles(!showSharedFiles)}
                    >
                      <h4>Shared With You ({sharedFiles.length})</h4>
                      <span className={`toggle-icon ${showSharedFiles ? 'open' : ''}`}>
                        ▼
                      </span>
                    </div>
                    
                    {showSharedFiles && (
                      <div className="files-list">
                        {loadingFiles ? (
                          <div className="empty-state">Loading shared files...</div>
                        ) : sharedFiles.length === 0 ? (
                          <div className="empty-state">No files shared with you</div>
                        ) : (
                          sharedFiles.map((file, index) => (
                            <div key={index} className="file-item">
                              <div className="file-info">
                                <div className="file-type-indicator">
                                  {file.fileName.split('.').pop()?.toUpperCase() || 'FILE'}
                                </div>
                                <div>
                                  <div className="filename">{file.fileName}</div>
                                  <span className="file-owner">Shared by: {file.owner}</span>
                                </div>
                              </div>
                              {renderFileActions(file, false)}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {selectedFile && accessLogs.length > 0 && (
              <div className="access-logs">
                <h4>Access Logs for "{selectedFile}"</h4>
                <div className="logs-list">
                  {accessLogs.map((log, index) => (
                    <div key={index} className="log-item">
                      <span className="log-user">{log.user}</span>
                      <span className="log-time">{log.timestamp}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  export default App;
