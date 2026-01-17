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