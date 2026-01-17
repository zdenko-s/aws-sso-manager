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