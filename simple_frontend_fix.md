# Fixed Frontend Setup - Single File Approach

## Step 1: Create Fresh Vite Project

```bash
cd aws-sso-manager
rm -rf frontend
npm create vite@latest frontend -- --template react
cd frontend
npm install
npm install lucide-react
```

## Step 2: Replace `frontend/src/App.jsx`

**IMPORTANT: Delete everything in App.jsx and paste ONLY this:**

```javascript
import { useState, useEffect } from 'react'
import { Shield, Key, Cloud, AlertCircle, ExternalLink, Server, Layers, RefreshCw, Copy, Check, Eye, EyeOff, LogOut } from 'lucide-react'

const API_BASE = '/api'

function App() {
  const [page, setPage] = useState('login')
  const [session, setSession] = useState(null)
  const [ssoStartUrl, setSsoStartUrl] = useState('')
  const [ssoRegion, setSsoRegion] = useState('us-east-1')
  const [ssoAccountId, setSsoAccountId] = useState('')
  const [ssoRoleName, setSsoRoleName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedRegion, setSelectedRegion] = useState('us-east-1')
  const [availableRegions, setAvailableRegions] = useState([])
  const [activeTab, setActiveTab] = useState('overview')
  const [ec2Instances, setEc2Instances] = useState([])
  const [loadingEc2, setLoadingEc2] = useState(false)
  const [cfnStacks, setCfnStacks] = useState([])
  const [loadingCfn, setLoadingCfn] = useState(false)
  const [copiedField, setCopiedField] = useState('')

  const awsRegions = [
    'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
    'eu-west-1', 'eu-west-2', 'eu-central-1', 'eu-north-1',
    'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-south-1'
  ]

  useEffect(() => {
    const path = window.location.pathname
    if (path === '/dashboard' || path === '/dashboard.html') {
      const sessionData = sessionStorage.getItem('awsSession')
      if (sessionData) {
        const parsed = JSON.parse(sessionData)
        setSession(parsed)
        setSelectedRegion(parsed.ssoRegion)
        setPage('dashboard')
        loadAvailableRegions(parsed.sessionId)
      }
    }
  }, [])

  const loadAvailableRegions = async (sessionId) => {
    try {
      const response = await fetch(`${API_BASE}/ec2/regions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      })
      if (response.ok) {
        const data = await response.json()
        setAvailableRegions(data.regions.map(r => r.name))
      }
    } catch (err) {
      console.error('Failed to load regions:', err)
    }
  }

  const handleLogin = async () => {
    setError('')
    setLoading(true)

    if (!ssoStartUrl || !ssoAccountId || !ssoRoleName || !ssoRegion) {
      setError('All fields are required')
      setLoading(false)
      return
    }

    if (!/^\d{12}$/.test(ssoAccountId)) {
      setError('Account ID must be a 12-digit number')
      setLoading(false)
      return
    }

    if (!ssoStartUrl.startsWith('https://')) {
      setError('SSO Start URL must start with https://')
      setLoading(false)
      return
    }

    try {
      const startResponse = await fetch(`${API_BASE}/sso/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ssoStartUrl, ssoRegion })
      })

      if (!startResponse.ok) {
        const errData = await startResponse.json()
        throw new Error(errData.error || 'Failed to start SSO')
      }

      const startData = await startResponse.json()
      window.open(startData.verificationUriComplete, '_blank')
      
      alert(`Please authenticate in the browser window.\n\nUser Code: ${startData.userCode}\n\nClick OK after authentication.`)

      let authenticated = false
      const maxAttempts = 60
      
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, 5000))

        const pollResponse = await fetch(`${API_BASE}/sso/poll`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: startData.sessionId })
        })

        if (pollResponse.status === 200) {
          authenticated = true
          break
        } else if (pollResponse.status === 401) {
          throw new Error('Authentication session expired')
        }
      }

      if (!authenticated) {
        throw new Error('Authentication timeout')
      }

      const credResponse = await fetch(`${API_BASE}/sso/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: startData.sessionId,
          accountId: ssoAccountId,
          roleName: ssoRoleName
        })
      })

      if (!credResponse.ok) {
        const errData = await credResponse.json()
        throw new Error(errData.error || 'Failed to get credentials')
      }

      const creds = await credResponse.json()
      
      const sessionData = {
        sessionId: startData.sessionId,
        credentials: creds,
        accountId: ssoAccountId,
        roleName: ssoRoleName,
        ssoRegion,
        ssoStartUrl
      }
      
      sessionStorage.setItem('awsSession', JSON.stringify(sessionData))
      setSession(sessionData)
      setSelectedRegion(ssoRegion)
      setPage('dashboard')
      loadAvailableRegions(startData.sessionId)
      
    } catch (err) {
      console.error('Login error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const loadEc2Instances = async () => {
    if (!session) return
    setLoadingEc2(true)
    setError('')
    try {
      const response = await fetch(`${API_BASE}/ec2/instances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.sessionId, region: selectedRegion })
      })
      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.error || 'Failed to load EC2 instances')
      }
      const data = await response.json()
      setEc2Instances(data.instances)
      setActiveTab('ec2')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingEc2(false)
    }
  }

  const loadCloudFormationStacks = async () => {
    if (!session) return
    setLoadingCfn(true)
    setError('')
    try {
      const response = await fetch(`${API_BASE}/cloudformation/stacks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.sessionId, region: selectedRegion })
      })
      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.error || 'Failed to load stacks')
      }
      const data = await response.json()
      setCfnStacks(data.stacks)
      setActiveTab('cloudformation')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingCfn(false)
    }
  }

  const copyToClipboard = async (text, field) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(field)
      setTimeout(() => setCopiedField(''), 2000)
    } catch (err) {
      console.error('Copy failed:', err)
    }
  }

  const handleLogout = () => {
    sessionStorage.removeItem('awsSession')
    setSession(null)
    setPage('login')
  }

  const getStateColor = (state) => {
    const colors = {
      running: 'text-green-600 bg-green-50',
      stopped: 'text-red-600 bg-red-50',
      stopping: 'text-orange-600 bg-orange-50',
      pending: 'text-blue-600 bg-blue-50'
    }
    return colors[state] || 'text-gray-600 bg-gray-50'
  }

  const getStackStatusColor = (status) => {
    if (status.includes('COMPLETE') && !status.includes('ROLLBACK')) {
      return 'text-green-600 bg-green-50'
    } else if (status.includes('FAILED') || status.includes('ROLLBACK')) {
      return 'text-red-600 bg-red-50'
    } else if (status.includes('IN_PROGRESS')) {
      return 'text-blue-600 bg-blue-50'
    }
    return 'text-gray-600 bg-gray-50'
  }

  if (page === 'login') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-6">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center mb-4">
              <Cloud className="w-12 h-12 text-orange-400 mr-3" />
              <h1 className="text-4xl font-bold text-white">AWS SSO Manager</h1>
            </div>
            <p className="text-gray-300">Securely authenticate and manage AWS resources</p>
          </div>

          <div className="bg-white rounded-lg shadow-2xl p-8">
            <div className="flex items-center mb-6">
              <Shield className="w-6 h-6 text-blue-600 mr-2" />
              <h2 className="text-2xl font-semibold text-gray-800">SSO Authentication</h2>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">SSO Start URL</label>
                <input
                  type="text"
                  value={ssoStartUrl}
                  onChange={(e) => setSsoStartUrl(e.target.value)}
                  placeholder="https://d-xxxxxxxxxx.awsapps.com/start"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">SSO Region</label>
                <select
                  value={ssoRegion}
                  onChange={(e) => setSsoRegion(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {awsRegions.map(region => (
                    <option key={region} value={region}>{region}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">AWS Account ID</label>
                <input
                  type="text"
                  value={ssoAccountId}
                  onChange={(e) => setSsoAccountId(e.target.value.replace(/\D/g, '').slice(0, 12))}
                  placeholder="123456789012"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  maxLength={12}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">SSO Role Name</label>
                <input
                  type="text"
                  value={ssoRoleName}
                  onChange={(e) => setSsoRoleName(e.target.value)}
                  placeholder="AdministratorAccess"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {error && (
                <div className="flex items-center p-4 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              )}

              <button
                onClick={handleLogin}
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg disabled:opacity-50 flex items-center justify-center"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Authenticating...
                  </>
                ) : (
                  <>
                    <Key className="w-5 h-5 mr-2" />
                    Login to Dashboard
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
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
                <p className="text-sm text-gray-600">Account: {session.accountId} | Role: {session.roleName}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <select
                value={selectedRegion}
                onChange={(e) => setSelectedRegion(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg"
              >
                {(availableRegions.length > 0 ? availableRegions : awsRegions).map(region => (
                  <option key={region} value={region}>{region}</option>
                ))}
              </select>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"
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
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={loadEc2Instances}
              disabled={loadingEc2}
              className="flex items-center justify-center gap-3 px-6 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
            >
              {loadingEc2 ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : <Server className="w-5 h-5" />}
              List EC2 Instances
            </button>
            <button
              onClick={loadCloudFormationStacks}
              disabled={loadingCfn}
              className="flex items-center justify-center gap-3 px-6 py-4 bg-purple-600 hover:bg-purple-700 text-white rounded-lg disabled:opacity-50"
            >
              {loadingCfn ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : <Layers className="w-5 h-5" />}
              List CloudFormation Stacks
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <div className="flex items-center p-4 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          </div>
        )}

        {activeTab === 'ec2' && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold">EC2 Instances ({selectedRegion})</h2>
              <button onClick={loadEc2Instances} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
                <RefreshCw className={`w-4 h-4 ${loadingEc2 ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
            {ec2Instances.length === 0 ? (
              <div className="text-center py-12">
                <Server className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No EC2 instances in {selectedRegion}</p>
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {ec2Instances.map((inst) => (
                      <tr key={inst.instanceId} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium">{inst.name}</td>
                        <td className="px-4 py-3 text-sm font-mono">{inst.instanceId}</td>
                        <td className="px-4 py-3 text-sm">{inst.instanceType}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-1 rounded-full text-xs ${getStateColor(inst.state)}`}>
                            {inst.state}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm font-mono">{inst.privateIp}</td>
                        <td className="px-4 py-3 text-sm font-mono">{inst.publicIp}</td>
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
              <h2 className="text-xl font-semibold">CloudFormation Stacks ({selectedRegion})</h2>
              <button onClick={loadCloudFormationStacks} className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg">
                <RefreshCw className={`w-4 h-4 ${loadingCfn ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
            {cfnStacks.length === 0 ? (
              <div className="text-center py-12">
                <Layers className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No stacks in {selectedRegion}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stack Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {cfnStacks.map((stack) => (
                      <tr key={stack.stackId} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium">{stack.stackName}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-1 rounded-full text-xs ${getStackStatusColor(stack.stackStatus)}`}>
                            {stack.stackStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">{new Date(stack.creationTime).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-sm">{stack.templateDescription || 'No description'}</td>
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
  )
}

export default App
```

## Step 3: Update `frontend/vite.config.js`

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

## Step 4: Run

```bash
npm run dev
```

This single-file approach combines everything into one component and should avoid the Vite preamble detection error completely.
