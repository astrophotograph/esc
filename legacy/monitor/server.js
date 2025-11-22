const express = require('express');
const WebSocket = require('ws');
const Docker = require('dockerode');
const Tail = require('tail').Tail;
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const PORT = process.env.MONITOR_PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Store active log tails
const logTails = new Map();
const wsClients = new Set();

// WebSocket server for real-time updates
const wss = new WebSocket.Server({ port: 8081 });

wss.on('connection', (ws) => {
  wsClients.add(ws);
  console.log('New WebSocket client connected');
  
  // Send initial status
  sendContainerStatus(ws);
  
  ws.on('close', () => {
    wsClients.delete(ws);
    console.log('WebSocket client disconnected');
  });
  
  ws.on('message', (message) => {
    const data = JSON.parse(message);
    handleWebSocketMessage(ws, data);
  });
});

// Send status updates to all connected clients
function broadcastUpdate(type, data) {
  const message = JSON.stringify({ type, data });
  wsClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Get container status
async function getContainerStatus() {
  try {
    const containers = await docker.listContainers({ all: true });
    const escContainers = containers.filter(c => 
      c.Names.some(name => name.includes('esc') || name.includes('server') || name.includes('ui'))
    );
    
    return await Promise.all(escContainers.map(async (container) => {
      const containerInfo = docker.getContainer(container.Id);
      const stats = await containerInfo.stats({ stream: false });
      
      return {
        id: container.Id,
        name: container.Names[0].replace('/', ''),
        image: container.Image,
        status: container.State,
        state: container.Status,
        ports: container.Ports,
        created: container.Created,
        cpu: calculateCPUPercent(stats),
        memory: calculateMemoryUsage(stats),
        health: container.Status.includes('healthy') ? 'healthy' : 
                container.Status.includes('unhealthy') ? 'unhealthy' : 'unknown'
      };
    }));
  } catch (error) {
    console.error('Error getting container status:', error);
    return [];
  }
}

// Calculate CPU percentage
function calculateCPUPercent(stats) {
  if (!stats || !stats.cpu_stats || !stats.precpu_stats) return 0;
  
  const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
  const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
  const cpuCount = stats.cpu_stats.online_cpus || 1;
  
  if (systemDelta > 0 && cpuDelta > 0) {
    return ((cpuDelta / systemDelta) * cpuCount * 100).toFixed(2);
  }
  return 0;
}

// Calculate memory usage
function calculateMemoryUsage(stats) {
  if (!stats || !stats.memory_stats) return { used: 0, limit: 0, percent: 0 };
  
  const used = stats.memory_stats.usage || 0;
  const limit = stats.memory_stats.limit || 0;
  const percent = limit > 0 ? ((used / limit) * 100).toFixed(2) : 0;
  
  return {
    used: formatBytes(used),
    limit: formatBytes(limit),
    percent
  };
}

// Format bytes to human readable
function formatBytes(bytes) {
  const sizes = ['B', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 B';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

// Send container status to WebSocket client
async function sendContainerStatus(ws) {
  const status = await getContainerStatus();
  ws.send(JSON.stringify({ type: 'status', data: status }));
}

// Handle WebSocket messages
async function handleWebSocketMessage(ws, data) {
  switch (data.type) {
    case 'getLogs':
      await streamContainerLogs(ws, data.containerId, data.tail || 100);
      break;
    case 'restart':
      await restartContainer(ws, data.containerId);
      break;
    case 'stop':
      await stopContainer(ws, data.containerId);
      break;
    case 'start':
      await startContainer(ws, data.containerId);
      break;
    case 'getStatus':
      await sendContainerStatus(ws);
      break;
  }
}

// Stream container logs
async function streamContainerLogs(ws, containerId, tail = 100) {
  try {
    const container = docker.getContainer(containerId);
    const stream = await container.logs({
      stdout: true,
      stderr: true,
      follow: true,
      tail: tail,
      timestamps: true
    });
    
    stream.on('data', (chunk) => {
      const log = chunk.toString('utf8');
      ws.send(JSON.stringify({ 
        type: 'log', 
        containerId,
        data: log 
      }));
    });
    
    // Store stream reference for cleanup
    ws.logStream = stream;
    
  } catch (error) {
    ws.send(JSON.stringify({ 
      type: 'error', 
      message: `Failed to get logs: ${error.message}` 
    }));
  }
}

// Container control functions
async function restartContainer(ws, containerId) {
  try {
    const container = docker.getContainer(containerId);
    await container.restart();
    ws.send(JSON.stringify({ 
      type: 'success', 
      message: 'Container restarted successfully' 
    }));
    // Send updated status to all clients
    setTimeout(() => {
      broadcastUpdate('statusUpdate', getContainerStatus());
    }, 2000);
  } catch (error) {
    ws.send(JSON.stringify({ 
      type: 'error', 
      message: `Failed to restart: ${error.message}` 
    }));
  }
}

async function stopContainer(ws, containerId) {
  try {
    const container = docker.getContainer(containerId);
    await container.stop();
    ws.send(JSON.stringify({ 
      type: 'success', 
      message: 'Container stopped successfully' 
    }));
    broadcastUpdate('statusUpdate', await getContainerStatus());
  } catch (error) {
    ws.send(JSON.stringify({ 
      type: 'error', 
      message: `Failed to stop: ${error.message}` 
    }));
  }
}

async function startContainer(ws, containerId) {
  try {
    const container = docker.getContainer(containerId);
    await container.start();
    ws.send(JSON.stringify({ 
      type: 'success', 
      message: 'Container started successfully' 
    }));
    broadcastUpdate('statusUpdate', await getContainerStatus());
  } catch (error) {
    ws.send(JSON.stringify({ 
      type: 'error', 
      message: `Failed to start: ${error.message}` 
    }));
  }
}

// REST API endpoints
app.get('/api/status', async (req, res) => {
  const status = await getContainerStatus();
  res.json(status);
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Update status periodically
setInterval(async () => {
  if (wsClients.size > 0) {
    const status = await getContainerStatus();
    broadcastUpdate('statusUpdate', status);
  }
}, 5000);

app.listen(PORT, () => {
  console.log(`ESC Monitor running on http://localhost:${PORT}`);
  console.log(`WebSocket server running on ws://localhost:8081`);
});