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