# AWS SSO Manager - Local Deployment Guide

## Project Structure

```
aws-sso-manager/
├── backend/
│   ├── package.json
│   ├── server.js
│   └── .env
├── frontend/
│   ├── package.json
│   ├── src/
│   │   ├── App.jsx
│   │   └── index.jsx
│   ├── index.html
│   └── vite.config.js
└── README.md
```

## Step 1: Create Project Directory

```bash
mkdir aws-sso-manager
cd aws-sso-manager
```

## Step 2: Setup Backend

### Create Backend Directory

```bash
mkdir backend
cd backend
npm init -y
```

### Install Backend Dependencies

```bash
npm install express cors dotenv @aws-sdk/client-sso @aws-sdk/client-sso-oidc @aws-sdk/client-ec2
```

### Create `backend/server.js`

```javascript
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { 
  SSOOIDCClient, 
  RegisterClientCommand, 
  StartDeviceAuthorizationCommand, 
  CreateTokenCommand 
} = require('@aws-sdk/client-sso-oidc');

const { 
  SSOClient, 
  GetRoleCredentialsCommand,
  ListAccountsCommand,
  ListAccountRolesCommand
} = require('@aws-sdk/client-sso');

const { 
  EC2Client, 
  DescribeInstancesCommand,
  DescribeRegionsCommand 
} = require('@aws-sdk/client-ec2');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Store active sessions (in production, use Redis or similar)
const sessions = new Map();

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Step 1: Start SSO authentication flow
app.post('/api/sso/start', async (req, res) => {
  const { ssoStartUrl, ssoRegion } = req.body;
  
  console.log('Starting SSO flow:', { ssoStartUrl, ssoRegion });
  
  try {
    const ssoOidcClient = new SSOOIDCClient({ region: ssoRegion });
    
    // Register the client
    const registerCommand = new RegisterClientCommand({
      clientName: 'AWS-SSO-Manager',
      clientType: 'public'
    });
    const registerResponse = await ssoOidcClient.send(registerCommand);
    
    console.log('Client registered:', registerResponse.clientId);
    
    // Start device authorization
    const authCommand = new StartDeviceAuthorizationCommand({
      clientId: registerResponse.clientId,
      clientSecret: registerResponse.clientSecret,
      startUrl: ssoStartUrl
    });
    const authResponse = await ssoOidcClient.send(authCommand);
    
    console.log('Device authorization started:', authResponse.userCode);
    
    // Store session data
    const sessionId = `session_${Date.now()}`;
    sessions.set(sessionId, {
      clientId: registerResponse.clientId,
      clientSecret: registerResponse.clientSecret,
      deviceCode: authResponse.deviceCode,
      ssoRegion,
      createdAt: Date.now()
    });
    
    res.json({
      sessionId,
      userCode: authResponse.userCode,
      verificationUri: authResponse.verificationUri,
      verificationUriComplete: authResponse.verificationUriComplete,
      expiresIn: authResponse.expiresIn,
      interval: authResponse.interval
    });
  } catch (error) {
    console.error('SSO start error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Step 2: Poll for access token
app.post('/api/sso/poll', async (req, res) => {
  const { sessionId } = req.body;
  
  const session = sessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  try {
    const ssoOidcClient = new SSOOIDCClient({ region: session.ssoRegion });
    
    const tokenCommand = new CreateTokenCommand({
      clientId: session.clientId,
      clientSecret: session.clientSecret,
      grantType: 'urn:ietf:params:oauth:grant-type:device_code',
      deviceCode: session.deviceCode
    });
    
    const tokenResponse = await ssoOidcClient.send(tokenCommand);
    
    console.log('Token received successfully');
    
    // Store access token in session
    session.accessToken = tokenResponse.accessToken;
    session.tokenExpiresAt = Date.now() + (tokenResponse.expiresIn * 1000);
    
    res.json({
      status: 'success',
      accessToken: tokenResponse.accessToken,
      expiresIn: tokenResponse.expiresIn
    });
  } catch (error) {
    if (error.name === 'AuthorizationPendingException') {
      res.status(202).json({ status: 'pending' });
    } else if (error.name === 'SlowDownException') {
      res.status(429).json({ status: 'slow_down' });
    } else if (error.name === 'ExpiredTokenException') {
      sessions.delete(sessionId);
      res.status(401).json({ error: 'Session expired' });
    } else {
      console.error('Poll error:', error);
      res.status(500).json({ error: error.message });
    }
  }
});

// Step 3: List available accounts
app.post('/api/sso/accounts', async (req, res) => {
  const { sessionId } = req.body;
  
  const session = sessions.get(sessionId);
  if (!session || !session.accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  try {
    const ssoClient = new SSOClient({ region: session.ssoRegion });
    
    const listAccountsCommand = new ListAccountsCommand({
      accessToken: session.accessToken
    });
    const accountsResponse = await ssoClient.send(listAccountsCommand);
    
    res.json({
      accounts: accountsResponse.accountList || []
    });
  } catch (error) {
    console.error('List accounts error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Step 4: List available roles for an account
app.post('/api/sso/roles', async (req, res) => {
  const { sessionId, accountId } = req.body;
  
  const session = sessions.get(sessionId);
  if (!session || !session.accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  try {
    const ssoClient = new SSOClient({ region: session.ssoRegion });
    
    const listRolesCommand = new ListAccountRolesCommand({
      accessToken: session.accessToken,
      accountId
    });
    const rolesResponse = await ssoClient.send(listRolesCommand);
    
    res.json({
      roles: rolesResponse.roleList || []
    });
  } catch (error) {
    console.error('List roles error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Step 5: Get role credentials
app.post('/api/sso/credentials', async (req, res) => {
  const { sessionId, accountId, roleName } = req.body;
  
  const session = sessions.get(sessionId);
  if (!session || !session.accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  try {
    const ssoClient = new SSOClient({ region: session.ssoRegion });
    
    const credentialsCommand = new GetRoleCredentialsCommand({
      accessToken: session.accessToken,
      accountId,
      roleName
    });
    const credentialsResponse = await ssoClient.send(credentialsCommand);
    
    const credentials = credentialsResponse.roleCredentials;
    
    // Store credentials in session
    session.credentials = {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
      expiration: credentials.expiration
    };
    
    res.json({
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
      expiration: credentials.expiration
    });
  } catch (error) {
    console.error('Get credentials error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Step 6: List EC2 instances
app.post('/api/ec2/instances', async (req, res) => {
  const { sessionId, region } = req.body;
  
  const session = sessions.get(sessionId);
  if (!session || !session.credentials) {
    return res.status(401).json({ error: 'Not authenticated or no credentials' });
  }
  
  try {
    const ec2Client = new EC2Client({
      region: region || 'us-east-1',
      credentials: {
        accessKeyId: session.credentials.accessKeyId,
        secretAccessKey: session.credentials.secretAccessKey,
        sessionToken: session.credentials.sessionToken
      }
    });
    
    const command = new DescribeInstancesCommand({});
    const response = await ec2Client.send(command);
    
    const instances = [];
    
    if (response.Reservations) {
      for (const reservation of response.Reservations) {
        for (const instance of reservation.Instances) {
          const nameTag = instance.Tags?.find(tag => tag.Key === 'Name');
          
          instances.push({
            instanceId: instance.InstanceId,
            name: nameTag?.Value || 'N/A',
            instanceType: instance.InstanceType,
            state: instance.State.Name,
            privateIp: instance.PrivateIpAddress || 'N/A',
            publicIp: instance.PublicIpAddress || 'N/A',
            availabilityZone: instance.Placement.AvailabilityZone,
            launchTime: instance.LaunchTime,
            platform: instance.Platform || 'Linux',
            vpcId: instance.VpcId || 'N/A',
            subnetId: instance.SubnetId || 'N/A'
          });
        }
      }
    }
    
    console.log(`Found ${instances.length} EC2 instances in ${region}`);
    
    res.json({ instances });
  } catch (error) {
    console.error('List EC2 instances error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Step 7: Get available AWS regions
app.post('/api/ec2/regions', async (req, res) => {
  const { sessionId } = req.body;
  
  const session = sessions.get(sessionId);
  if (!session || !session.credentials) {
    return res.status(401).json({ error: 'Not authenticated or no credentials' });
  }
  
  try {
    const ec2Client = new EC2Client({
      region: 'us-east-1', // Use any region to get all regions
      credentials: {
        accessKeyId: session.credentials.accessKeyId,
        secretAccessKey: session.credentials.secretAccessKey,
        sessionToken: session.credentials.sessionToken
      }
    });
    
    const command = new DescribeRegionsCommand({});
    const response = await ec2Client.send(command);
    
    const regions = response.Regions.map(region => ({
      name: region.RegionName,
      endpoint: region.Endpoint,
      optInStatus: region.OptInStatus
    }));
    
    res.json({ regions });
  } catch (error) {
    console.error('List regions error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Clean up expired sessions every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    // Remove sessions older than 1 hour
    if (now - session.createdAt > 3600000) {
      sessions.delete(sessionId);
      console.log(`Cleaned up expired session: ${sessionId}`);
    }
  }
}, 600000);

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});
```

### Create `backend/.env`

```env
PORT=3001
NODE_ENV=development
```

### Create `backend/package.json` (if not exists)

```json
{
  "name": "aws-sso-backend",
  "version": "1.0.0",
  "description": "AWS SSO Manager Backend",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "keywords": ["aws", "sso", "ec2"],
  "author": "",
  "license": "MIT",
  "dependencies": {
    "@aws-sdk/client-ec2": "^3.0.0",
    "@aws-sdk/client-sso": "^3.0.0",
    "@aws-sdk/client-sso-oidc": "^3.0.0",
    "cors": "^2.8.5",
    "dotenv": "^16.0.0",
    "express": "^4.18.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.0"
  }
}
```

## Step 3: Setup Frontend

```bash
cd ..
mkdir frontend
cd frontend
npm create vite@latest . -- --template react
npm install
npm install lucide-react
```

### Update `frontend/src/App.jsx`

Use the React component from the next artifact (coming in next message).

### Create `frontend/vite.config.js`

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

## Step 4: Run the Application

### Terminal 1 - Start Backend

```bash
cd backend
npm start
```

### Terminal 2 - Start Frontend

```bash
cd frontend
npm run dev
```

## Step 5: Access the Application

Open your browser and navigate to:
```
http://localhost:3000
```

## Testing the SSO Flow

1. Enter your SSO Start URL (e.g., `https://d-xxxxxxxxxx.awsapps.com/start`)
2. Select your SSO Region
3. Enter your Account ID
4. Enter your Role Name
5. Click "Get SSO Credentials"
6. A browser window will open - authenticate there
7. After authentication, credentials will be displayed
8. Select a region to list EC2 instances

## Troubleshooting

### Backend won't start
- Check if port 3001 is available: `lsof -i :3001`
- Verify all dependencies are installed: `npm install`

### Frontend won't start
- Check if port 3000 is available: `lsof -i :3000`
- Clear cache: `rm -rf node_modules package-lock.json && npm install`

### SSO authentication fails
- Verify your SSO Start URL is correct
- Ensure you have access to the AWS account and role
- Check the backend logs for detailed error messages

### EC2 instances not showing
- Verify the region has EC2 instances
- Check IAM role has `ec2:DescribeInstances` permission
- Try a different region

## Production Deployment

For production deployment, consider:

1. **Environment Variables**: Use proper secrets management
2. **Session Storage**: Replace in-memory Map with Redis
3. **HTTPS**: Use SSL certificates
4. **Authentication**: Add proper user authentication
5. **Rate Limiting**: Implement API rate limiting
6. **Logging**: Add proper logging and monitoring
7. **Error Handling**: Improve error messages and handling
8. **Docker**: Containerize the application

## Docker Setup (Optional)

Create `docker-compose.yml`:

```yaml
version: '3.8'
services:
  backend:
    build: ./backend
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
    volumes:
      - ./backend:/app
  
  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    depends_on:
      - backend
```

Run with:
```bash
docker-compose up
```
