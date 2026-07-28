import React, { useState } from 'react';
import axios from 'axios';
import './App.css'; // Imports the glassmorphism design stylesheet

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [scanResult, setScanResult] = useState(null);
  const [loadingScan, setLoadingScan] = useState(false);

  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loadingChat, setLoadingChat] = useState(false);

  // Handle image selection
  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setScanResult(null);
    }
  };

  // Scan image via FastAPI backend
  const handleScan = async () => {
    if (!selectedFile) return;
    setLoadingScan(true);
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await axios.post(`${API_BASE_URL}/api/scan-image`, formData);
      setScanResult(response.data);
    } catch (err) {
      console.error(err);
      alert('Error connecting to backend scan API.');
    } finally {
      setLoadingScan(false);
    }
  };

  // Send message to FastAPI privacy chat backend
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    const userMsg = inputMessage;
    setInputMessage('');
    setMessages((prev) => [...prev, { sender: 'user', text: userMsg }]);

    setLoadingChat(true);
    const isFake = scanResult ? scanResult.is_ai_generated : false;

    const formData = new URLSearchParams();
    formData.append('user_message', userMsg);
    formData.append('is_fake', isFake);

    try {
      const response = await axios.post(`${API_BASE_URL}/api/chat`, formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      const aiReply = response.data.ai_response;
      const scrubbed = response.data.scrubbed_message_sent_to_cloud;

      setMessages((prev) => [
        ...prev,
        { sender: 'ai', text: aiReply, scrubbed: scrubbed }
      ]);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [...prev, { sender: 'ai', text: 'System error connecting to AI.' }]);
    } finally {
      setLoadingChat(false);
    }
  };

  return (
    <div className="app-container">
      <header>
        <h1>🛡️ Trust & Safety Assistant</h1>
        <p>Scan images for deepfakes and chat securely with local PII privacy masking.</p>
      </header>

      {/* Image Scanner Section */}
      <section className="glass-card scanner-ui">
        <h2 className="card-title">📸 Step 1: Upload & Scan Image</h2>
        
        <div className="file-upload-container">
          <label htmlFor="file-upload" className="custom-file-upload">
            {selectedFile ? selectedFile.name : "Click here to choose an image file..."}
          </label>
          <input id="file-upload" type="file" accept="image/*" onChange={handleImageChange} />
        </div>
        
        {previewUrl && (
          <div className="preview-box">
            <img src={previewUrl} alt="Preview" className="preview-image" />
            <button onClick={handleScan} disabled={loadingScan} className="btn-scan">
              {loadingScan ? 'Analyzing Image...' : 'Scan Image for Fakes'}
            </button>
          </div>
        )}

        {scanResult && (
          <div className={`result-box ${scanResult.is_ai_generated ? 'result-fake' : 'result-real'}`}>
            <p><strong>AI Generated:</strong> {scanResult.is_ai_generated ? '⚠️ Yes (Synthetic / Fake)' : '✅ No (Real Photograph)'}</p>
            <p><strong>Confidence:</strong> {(scanResult.confidence * 100).toFixed(0)}%</p>
            <p style={{ fontSize: '0.85rem', marginTop: '4px', opacity: 0.8 }}>Model: {scanResult.model_used}</p>
          </div>
        )}
      </section>

      {/* Chat Assistant Section */}
      <section className="glass-card chat-ui">
        <h2 className="card-title">💬 Step 2: Chat with Trust & Safety AI</h2>
        
        <div className="chat-window">
          {messages.length === 0 && (
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginTop: '40px' }}>
              Type a message below about a potential scam, message, or situation...
            </p>
          )}
          {messages.map((msg, index) => (
            <div key={index} className={`message ${msg.sender}`}>
              <span className="msg-sender">{msg.sender === 'user' ? 'You' : 'AI Assistant'}</span>
              <div>{msg.text}</div>
              {msg.scrubbed && (
                <span className="msg-scrubbed">
                  🔒 Scrubbed PII sent to cloud: {msg.scrubbed}
                </span>
              )}
            </div>
          ))}
          {loadingChat && <div className="typing-indicator">AI is analyzing context...</div>}
        </div>

        <form onSubmit={handleSendMessage} className="chat-input-form">
          <input 
            type="text" 
            value={inputMessage} 
            onChange={(e) => setInputMessage(e.target.value)} 
            placeholder="Ask about a scam or type your situation..." 
            className="chat-input"
          />
          <button type="submit" disabled={loadingChat} className="btn-send" title="Send message">
            ➤
          </button>
        </form>
      </section>
    </div>
  );
}

export default App;