import React, { useState } from 'react';
import { Shield, Key, Cloud, Copy, Check, AlertCircle, Server, RefreshCw, Eye, EyeOff } from 'lucide-react';

const API_BASE = '/api';

export default function AWSResourceManager() {
  const [step, setStep] = useState('login'); // login, authenticated, ec2
  const [ssoStartUrl, setSsoStartUrl] = useState('');
  const [ssoRegion, setSsoRegion] = useState('us-east-1');
  const [ssoAccountId, setSsoAccountId] = useState('');
  const [ssoRoleName, setSsoRoleName] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [credentials, setCredentials] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedField, setCopiedField] = useState('');
  
  // EC2 state
  const [ec2Region, setEc2Region] = useState('us-east-1');
  const [ec2Instances, setEc2Instances] = useState([]);
  const [availableRegions, setAvailableRegions] = useState([]);
  const [loadingEc2, setLoadingEc2] = useState(false);

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
      // Step 1: Start SSO authentication
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
      setSessionId(startData.sessionId);

      // Step 2: Open browser for authentication
      window.open(startData.verificationUriComplete, '_blank');
      
      alert(`Please authenticate in the browser window.\n\nUser Code: ${startData.userCode}\n\nClick OK after you've completed authentication.`);

      // Step 3: Poll for token
      let authenticated = false;
      const maxAttempts = 60;
      
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Poll every 5 seconds

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

      // Step 4: Get role credentials
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
      
      setCredentials({
        ...creds,
        region: ssoRegion,
        accountId: ssoAccountId,
        roleName: ssoRoleName,
        ssoStartUrl
      });
      
      setStep('authenticated');
      
      // Load available regions
      loadAvailableRegions(startData.sessionId);
      
    } catch (err) {
      console.error('Login error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableRegions = async (sid) => {
    try {
      const response = await fetch(`${API_BASE}/ec2/regions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid || sessionId })
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
    setLoadingEc2(true);
    setError('');
    
    try {
      const response = await fetch(`${API_BASE}/ec2/instances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, region: ec2Region })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to load EC2 instances');
      }

      const data = await response.json();
      setEc2Instances(data.instances);
      setStep('ec2');
    } catch (err) {
      console.error('EC2 error:', err);
      setError(err.message);
    } finally {
      setLoadingEc2(false);
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

  const handleReset = () => {
    setStep('login');
    setCredentials(null);
    setError('');
    setSsoStartUrl('');
    setSsoAccountId('');
    setSsoRoleName('');
    setSessionId(null);
    setEc2Instances([]);
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <Cloud className="w-12 h-12 text-orange-400 mr-3" />
            <h1 className="text-4xl font-bold text-white">AWS SSO Manager</h1>
          </div>
          <p className="text-gray-300">Securely authenticate and manage AWS resources using SSO</p>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-lg shadow-2xl overflow-hidden">
          {step === 'login' && (
            <div className="p-8">
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
                      Get SSO Credentials
                    </>
                  )}
                </button>
              </div>

              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Note:</strong> After clicking the button, a browser window will open for authentication. Complete the SSO login process there.
                </p>
              </div>
            </div>
          )}

          {step === 'authenticated' && (
            <div className="p-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center">
                  <Key className="w-6 h-6 text-green-600 mr-2" />
                  <h2 className="text-2xl font-semibold text-gray-800">Credentials Active</h2>
                </div>
                <button
                  onClick={handleReset}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors"
                >
                  Logout
                </button>
              </div>

              <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="col-span-2">
                    <span className="font-medium text-gray-700">SSO Start URL:</span>
                    <span className="ml-2 text-gray-900 break-all">{credentials.ssoStartUrl}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Account ID:</span>
                    <span className="ml-2 text-gray-900">{credentials.accountId}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Role:</span>
                    <span className="ml-2 text-gray-900">{credentials.roleName}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Region:</span>
                    <span className="ml-2 text-gray-900">{credentials.region}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Expires:</span>
                    <span className="ml-2 text-gray-900">
                      {new Date(credentials.expiration).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-4 mb-6">
                <CredentialField
                  label="Access Key ID"
                  value={credentials.accessKeyId}
                  field="accessKey"
                  copiedField={copiedField}
                  onCopy={copyToClipboard}
                />
                <CredentialField
                  label="Secret Access Key"
                  value={credentials.secretAccessKey}
                  field="secretKey"
                  copiedField={copiedField}
                  onCopy={copyToClipboard}
                  secret
                />
                <CredentialField
                  label="Session Token"
                  value={credentials.sessionToken}
                  field="sessionToken"
                  copiedField={copiedField}
                  onCopy={copyToClipboard}
                  secret
                />
              </div>

              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Manage EC2 Instances</h3>
                
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select Region
                    </label>
                    <select
                      value={ec2Region}
                      onChange={(e) => setEc2Region(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      {(availableRegions.length > 0 ? availableRegions : awsRegions).map(region => (
                        <option key={region} value={region}>{region}</option>
                      ))}
                    </select>
                  </div>
                  
                  <button
                    onClick={loadEc2Instances}
                    disabled={loadingEc2}
                    className="mt-7 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center"
                  >
                    {loadingEc2 ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Loading...
                      </>
                    ) : (
                      <>
                        <Server className="w-4 h-4 mr-2" />
                        List Instances
                      </>
                    )}
                  </button>
                </div>

                {error && (
                  <div className="flex items-center p-4 bg-red-50 border border-red-200 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-red-600 mr-2 flex-shrink-0" />
                    <p className="text-red-700 text-sm">{error}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 'ec2' && (
            <div className="p-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center">
                  <Server className="w-6 h-6 text-blue-600 mr-2" />
                  <h2 className="text-2xl font-semibold text-gray-800">
                    EC2 Instances ({ec2Region})
                  </h2>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setStep('authenticated')}
                    className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={loadEc2Instances}
                    disabled={loadingEc2}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center"
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${loadingEc2 ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                  <button
                    onClick={handleReset}
                    className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors"
                  >
                    Logout
                  </button>
                </div>
              </div>

              {ec2Instances.length === 0 ? (
                <div className="text-center py-12">
                  <Server className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No EC2 instances found in {ec2Region}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Instance ID</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">State</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Private IP</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Public IP</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">AZ</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {ec2Instances.map((instance) => (
                        <tr key={instance.instanceId} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{instance.name}</td>
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
        </div>
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
