# Complete Frontend Files - Copy & Paste Guide

## Setup Instructions

```bash
# Navigate to your project root
cd aws-sso-manager

# Create frontend with Vite
npm create vite@latest frontend -- --template react
cd frontend
npm install
npm install lucide-react
```

## File 1: `frontend/src/App.jsx`

**Delete the existing App.jsx content and replace with:**

```jsx
import React, { useState } from 'react';
import { Shield, Key, Cloud, AlertCircle, ExternalLink } from 'lucide-react';

const API_BASE = '/api';

export default function AWSResourceManager() {
  const [ssoStartUrl, setSsoStartUrl] = useState('');
  const [ssoRegion, setSsoRegion] = useState('us-east-1');
  const [ssoAccountId, setSsoAccountId] = useState('');
  const [ssoRoleName, setSsoRoleName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const awsRegions = [
    'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
    'eu-west-1', 'eu-west-2', 'eu-central-1', 'eu-north-1',
    'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-south-1'
  ];

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!ssoStartUrl || !ssoAccountId || !ssoRoleName || !ssoRegion) {
      setError('All fields are required');
      setLoading(false);
      return;
    }

    if (!/^\d{12}$/.test(ssoAccountId)) {
      setError('Account ID must be a 12-digit number');
      setLoading(false);
      return;
    }

    if (!ssoStartUrl.startsWith('https://')) {
      setError('SSO Start URL must start with https://');
      setLoading(false);
      return;
    }

    try {
      const startResponse = await fetch(`${API_BASE}/sso/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ssoStartUrl, ssoRegion })
      });

      if (!startResponse.ok) {
        const errData = await startResponse.json();
        throw new Error(errData.error || 'Failed to start SSO');
      }

      const startData = await startResponse.json();
      window.open(startData.verificationUriComplete, '_blank');
      
      alert(`Please authenticate in the browser window.\n\nUser Code: ${startData.userCode}\n\nClick OK after you've completed authentication.`);

      let authenticated = false;
      const maxAttempts = 60;
      
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, 5000));

        const pollResponse = await fetch(`${API_BASE}/sso/poll`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: startData.sessionId })
        });

        if (pollResponse.status === 200) {
          authenticated = true;
          break;
        } else if (pollResponse.status === 401) {
          throw new Error('Authentication session expired');
        } else if (pollResponse.status !== 202 && pollResponse.status !== 429) {
          const errData = await pollResponse.json();
          throw new Error(errData.error || 'Authentication failed');
        }
      }

      if (!authenticated) {
        throw new Error('Authentication timeout. Please try again.');
      }

      const credResponse = await fetch(`${API_BASE}/sso/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: startData.sessionId,
          accountId: ssoAccountId,
          roleName: ssoRoleName
        })
      });

      if (!credResponse.ok) {
        const errData = await credResponse.json();
        throw new Error(errData.error || 'Failed to get credentials');
      }

      const creds = await credResponse.json();
      
      sessionStorage.setItem('awsSession', JSON.stringify({
        sessionId: startData.sessionId,
        credentials: creds,
        accountId: ssoAccountId,
        roleName: ssoRoleName,
        ssoRegion,
        ssoStartUrl
      }));
      
      window.open('/dashboard.html', '_blank');
      
    } catch (err) {
      console.error('Login error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <Cloud className="w-12 h-12 text-orange-400 mr-3" />
            <h1 className="text-4xl font-bold text-white">AWS SSO Manager</h1>
          </div>
          <p className="text-gray-300">Securely authenticate and manage AWS resources using SSO</p>
        </div>

        <div className="bg-white rounded-lg shadow-2xl overflow-hidden p-8">
          <div className="flex items-center mb-6">
            <Shield className="w-6 h-6 text-blue-600 mr-2" />
            <h2 className="text-2xl font-semibold text-gray-800">SSO Authentication</h2>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                SSO Start URL
              </label>
              <input
                type="text"
                value={ssoStartUrl}
                onChange={(e) => setSsoStartUrl(e.target.value)}
                placeholder="https://d-xxxxxxxxxx.awsapps.com/start"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="mt-1 text-sm text-gray-500">Your AWS SSO portal URL</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                SSO Region
              </label>
              <select
                value={ssoRegion}
                onChange={(e) => setSsoRegion(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {awsRegions.map(region => (
                  <option key={region} value={region}>{region}</option>
                ))}
              </select>
              <p className="mt-1 text-sm text-gray-500">AWS region where SSO is configured</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                AWS Account ID
              </label>
              <input
                type="text"
                value={ssoAccountId}
                onChange={(e) => setSsoAccountId(e.target.value.replace(/\D/g, '').slice(0, 12))}
                placeholder="123456789012"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                maxLength={12}
              />
              <p className="mt-1 text-sm text-gray-500">12-digit AWS account number</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                SSO Role Name
              </label>
              <input
                type="text"
                value={ssoRoleName}
                onChange={(e) => setSsoRoleName(e.target.value)}
                placeholder="AdministratorAccess"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="mt-1 text-sm text-gray-500">IAM role name for SSO access</p>
            </div>

            {error && (
              <div className="flex items-center p-4 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600 mr-2 flex-shrink-0" />
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Authenticating...
                </>
              ) : (
                <>
                  <Key className="w-5 h-5 mr-2" />
                  Login & Open Dashboard
                </>
              )}
            </button>
          </div>

          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start">
              <ExternalLink className="w-5 h-5 text-blue-600 mr-2 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm text-blue-800 font-medium mb-1">After clicking login:</p>
                <ol className="text-sm text-blue-700 list-decimal list-inside space-y-1">
                  <li>A browser window will open for AWS SSO authentication</li>
                  <li>Complete the SSO login process in that window</li>
                  <li>Return here and click OK on the alert</li>
                  <li>Dashboard will open in a new tab</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

## File 2: `frontend/src/Dashboard.jsx`

**Create this new file:**

```jsx
import React, { useState, useEffect } from 'react';
import { Cloud, Server, Layers, RefreshCw, AlertCircle, Copy, Check, Eye, EyeOff, LogOut } from 'lucide-react';

const API_BASE = '/api';

export default function AWSDashboard() {
  const [session, setSession] = useState(null);
  const [selectedRegion, setSelectedRegion] = useState('us-east-1');
  const [availableRegions, setAvailableRegions] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [ec2Instances, setEc2Instances] = useState([]);
  const [loadingEc2, setLoadingEc2] = useState(false);
  const [cfnStacks, setCfnStacks] = useState([]);
  const [loadingCfn, setLoadingCfn] = useState(false);
  const [error, setError] = useState('');
  const [copiedField, setCopiedField] = useState('');

  const awsRegions = [
    'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
    'eu-west-1', 'eu-west-2', 'eu-central-1', 'eu-north-1',
    'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-south-1',
    'sa-east-1', 'ca-central-1'
  ];

  useEffect(() => {
    const sessionData = sessionStorage.getItem('awsSession');
    if (sessionData) {
      const parsed = JSON.parse(sessionData);
      setSession(parsed);
      setSelectedRegion(parsed.ssoRegion);
      loadAvailableRegions(parsed.sessionId);
    } else {
      setError('No active session found. Please login first.');
    }
  }, []);

  const loadAvailableRegions = async (sessionId) => {
    try {
      const response = await fetch(`${API_BASE}/ec2/regions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });
      if (response.ok) {
        const data = await response.json();
        setAvailableRegions(data.regions.map(r => r.name));
      }
    } catch (err) {
      console.error('Failed to load regions:', err);
    }
  };

  const loadEc2Instances = async () => {
    if (!session) return;
    setLoadingEc2(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/ec2/instances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.sessionId, region: selectedRegion })
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to load EC2 instances');
      }
      const data = await response.json();
      setEc2Instances(data.instances);
      setActiveTab('ec2');
    } catch (err) {
      console.error('EC2 error:', err);
      setError(err.message);
    } finally {
      setLoadingEc2(false);
    }
  };

  const loadCloudFormationStacks = async () => {
    if (!session) return;
    setLoadingCfn(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/cloudformation/stacks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.sessionId, region: selectedRegion })
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to load CloudFormation stacks');
      }
      const data = await response.json();
      setCfnStacks(data.stacks);
      setActiveTab('cloudformation');
    } catch (err) {
      console.error('CloudFormation error:', err);
      setError(err.message);
    } finally {
      setLoadingCfn(false);
    }
  };

  const copyToClipboard = async (text, field) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(''), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('awsSession');
    window.location.href = '/';
  };

  const getStateColor = (state) => {
    const colors = {
      running: 'text-green-600 bg-green-50',
      stopped: 'text-red-600 bg-red-50',
      stopping: 'text-orange-600 bg-orange-50',
      pending: 'text-blue-600 bg-blue-50',
      terminated: 'text-gray-600 bg-gray-50'
    };
    return colors[state] || 'text-gray-600 bg-gray-50';
  };

  const getStackStatusColor = (status) => {
    if (status.includes('COMPLETE') && !status.includes('ROLLBACK')) {
      return 'text-green-600 bg-green-50';
    } else if (status.includes('FAILED') || status.includes('ROLLBACK')) {
      return 'text-red-600 bg-red-50';
    } else if (status.includes('IN_PROGRESS')) {
      return 'text-blue-600 bg-blue-50';
    }
    return 'text-gray-600 bg-gray-50';
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-6 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md">
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 text-center mb-2">No Active Session</h2>
          <p className="text-gray-600 text-center mb-6">Please login first to access the dashboard.</p>
          <button
            onClick={() => window.location.href = '/'}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <div className="bg-white shadow-lg">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Cloud className="w-8 h-8 text-orange-400 mr-3" />
              <div>
                <h1 className="text-2xl font-bold text-gray-800">AWS Dashboard</h1>
                <p className="text-sm text-gray-600">
                  Account: {session.accountId} | Role: {session.roleName}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">Region:</label>
                <select
                  value={selectedRegion}
                  onChange={(e) => setSelectedRegion(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {(availableRegions.length > 0 ? availableRegions : awsRegions).map(region => (
                    <option key={region} value={region}>{region}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={loadEc2Instances}
              disabled={loadingEc2}
              className="flex items-center justify-center gap-3 px-6 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingEc2 ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Loading EC2 Instances...
                </>
              ) : (
                <>
                  <Server className="w-5 h-5" />
                  List EC2 Instances
                </>
              )}
            </button>
            <button
              onClick={loadCloudFormationStacks}
              disabled={loadingCfn}
              className="flex items-center justify-center gap-3 px-6 py-4 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingCfn ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Loading Stacks...
                </>
              ) : (
                <>
                  <Layers className="w-5 h-5" />
                  List CloudFormation Stacks
                </>
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <div className="flex items-center p-4 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600 mr-2 flex-shrink-0" />
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          </div>
        )}

        {activeTab === 'overview' && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Session Information</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                <div>
                  <span className="text-sm font-medium text-gray-600">SSO Start URL:</span>
                  <p className="text-sm text-gray-900 break-all">{session.ssoStartUrl}</p>
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-600">SSO Region:</span>
                  <p className="text-sm text-gray-900">{session.ssoRegion}</p>
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-600">Account ID:</span>
                  <p className="text-sm text-gray-900">{session.accountId}</p>
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-600">Role Name:</span>
                  <p className="text-sm text-gray-900">{session.roleName}</p>
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-600">Expires:</span>
                  <p className="text-sm text-gray-900">
                    {new Date(session.credentials.expiration).toLocaleString()}
                  </p>
                </div>
              </div>
              <CredentialField
                label="Access Key ID"
                value={session.credentials.accessKeyId}
                field="accessKey"
                copiedField={copiedField}
                onCopy={copyToClipboard}
              />
              <CredentialField
                label="Secret Access Key"
                value={session.credentials.secretAccessKey}
                field="secretKey"
                copiedField={copiedField}
                onCopy={copyToClipboard}
                secret
              />
              <CredentialField
                label="Session Token"
                value={session.credentials.sessionToken}
                field="sessionToken"
                copiedField={copiedField}
                onCopy={copyToClipboard}
                secret
              />
            </div>
          </div>
        )}

        {activeTab === 'ec2' && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-800">
                EC2 Instances ({selectedRegion})
              </h2>
              <button
                onClick={loadEc2Instances}
                disabled={loadingEc2}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loadingEc2 ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
            {ec2Instances.length === 0 ? (
              <div className="text-center py-12">
                <Server className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No EC2 instances found in {selectedRegion}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Instance ID</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">State</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Private IP</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Public IP</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">AZ</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {ec2Instances.map((instance) => (
                      <tr key={instance.instanceId} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStackStatusColor(stack.stackStatus)}`}>
                            {stack.stackStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {new Date(stack.creationTime).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {stack.lastUpdatedTime ? new Date(stack.lastUpdatedTime).toLocaleDateString() : 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {stack.templateDescription || 'No description'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CredentialField({ label, value, field, copiedField, onCopy, secret = false }) {
  const [show, setShow] = useState(false);
  const displayValue = secret && !show ? '•'.repeat(40) : value;

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={displayValue}
          readOnly
          className="flex-1 px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg font-mono text-sm"
        />
        {secret && (
          <button
            onClick={() => setShow(!show)}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors flex items-center"
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
        <button
          onClick={() => onCopy(value, field)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center"
        >
          {copiedField === field ? (
            <>
              <Check className="w-4 h-4 mr-1" />
              Copied
            </>
          ) : (
            <>
              <Copy className="w-4 h-4 mr-1" />
              Copy
            </>
          )}
        </button>
      </div>
    </div>
  );
}
```

## File 3: `frontend/src/main.jsx`

**Replace the existing main.jsx content with:**

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import Dashboard from './Dashboard.jsx'
import './index.css'

// Determine which component to render based on the path
const path = window.location.pathname;
const Component = path === '/dashboard.html' ? Dashboard : App;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Component />
  </React.StrictMode>,
)
```

## File 4: `frontend/public/dashboard.html`

**Create this file in the `public` folder:**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AWS Dashboard</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

## File 5: `frontend/vite.config.js`

**Replace or create this file:**

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
})
```

## File 6: `frontend/index.html`

**Update the existing index.html if needed:**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AWS SSO Manager - Login</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

## Final Steps

After creating all files:

```bash
# Make sure you're in the frontend directory
cd frontend

# Install dependencies
npm install

# Start the dev server
npm run dev
```

The frontend should now be running on `http://localhost:3000`

Make sure your backend is also running on `http://localhost:3001`

## Directory Structure

Your final structure should look like:

```
frontend/
├── public/
│   └── dashboard.html
├── src/
│   ├── App.jsx
│   ├── Dashboard.jsx
│   ├── main.jsx
│   └── index.css (auto-generated by Vite)
├── index.html
├── vite.config.js
└── package.json
```-sm font-medium text-gray-900">{instance.name}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 font-mono">{instance.instanceId}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{instance.instanceType}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStateColor(instance.state)}`}>
                            {instance.state}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 font-mono">{instance.privateIp}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 font-mono">{instance.publicIp}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{instance.availabilityZone}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'cloudformation' && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-800">
                CloudFormation Stacks ({selectedRegion})
              </h2>
              <button
                onClick={loadCloudFormationStacks}
                disabled={loadingCfn}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loadingCfn ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
            {cfnStacks.length === 0 ? (
              <div className="text-center py-12">
                <Layers className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No CloudFormation stacks found in {selectedRegion}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stack Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Updated</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {cfnStacks.map((stack) => (
                      <tr key={stack.stackId} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{stack.stackName}</td>
                        <td className="px-4 py-3 text