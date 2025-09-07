// WebSocket connection
let ws = null;
let containers = [];
let selectedContainerId = null;
let autoScroll = true;

// Initialize WebSocket connection
function initWebSocket() {
    ws = new WebSocket('ws://localhost:8081');
    
    ws.onopen = () => {
        console.log('Connected to monitor server');
        updateConnectionStatus(true);
        ws.send(JSON.stringify({ type: 'getStatus' }));
    };
    
    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        handleMessage(message);
    };
    
    ws.onclose = () => {
        console.log('Disconnected from monitor server');
        updateConnectionStatus(false);
        // Attempt to reconnect after 3 seconds
        setTimeout(initWebSocket, 3000);
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

// Handle incoming WebSocket messages
function handleMessage(message) {
    switch (message.type) {
        case 'status':
        case 'statusUpdate':
            updateContainerStatus(message.data);
            break;
        case 'log':
            appendLog(message.containerId, message.data);
            break;
        case 'success':
            showNotification(message.message, 'success');
            break;
        case 'error':
            showNotification(message.message, 'error');
            break;
    }
}

// Update connection status indicator
function updateConnectionStatus(connected) {
    const statusDot = document.getElementById('connection-status');
    const statusText = document.getElementById('connection-text');
    
    if (connected) {
        statusDot.classList.add('connected');
        statusDot.classList.remove('disconnected');
        statusText.textContent = 'Connected';
    } else {
        statusDot.classList.remove('connected');
        statusDot.classList.add('disconnected');
        statusText.textContent = 'Disconnected';
    }
}

// Update container status display
function updateContainerStatus(data) {
    containers = data;
    renderServiceCards();
    updateLogContainerSelect();
}

// Render service cards
function renderServiceCards() {
    const container = document.getElementById('services-container');
    container.innerHTML = '';
    
    containers.forEach(service => {
        const template = document.getElementById('service-card-template');
        const card = template.content.cloneNode(true);
        
        // Set container ID as data attribute
        const cardElement = card.querySelector('.service-card');
        cardElement.dataset.containerId = service.id;
        
        // Update card content
        card.querySelector('.service-name').textContent = service.name;
        card.querySelector('.image-name').textContent = service.image;
        card.querySelector('.status-text').textContent = service.state;
        card.querySelector('.cpu-usage').textContent = `${service.cpu}%`;
        card.querySelector('.memory-usage').textContent = `${service.memory.used} / ${service.memory.limit}`;
        card.querySelector('.health-status').textContent = service.health;
        
        // Update status badge
        const statusBadge = card.querySelector('.service-status');
        statusBadge.textContent = service.status;
        statusBadge.className = `service-status ${service.status.toLowerCase()}`;
        
        // Update button states
        const isRunning = service.status === 'running';
        card.querySelector('.start-btn').disabled = isRunning;
        card.querySelector('.stop-btn').disabled = !isRunning;
        card.querySelector('.restart-btn').disabled = !isRunning;
        
        container.appendChild(card);
    });
}

// Update log container select
function updateLogContainerSelect() {
    const select = document.getElementById('log-container-select');
    const currentValue = select.value;
    
    select.innerHTML = '<option value="">Select container...</option>';
    containers.forEach(container => {
        const option = document.createElement('option');
        option.value = container.id;
        option.textContent = container.name;
        select.appendChild(option);
    });
    
    // Restore previous selection if it still exists
    if (currentValue) {
        select.value = currentValue;
    }
}

// Container control functions
function restartContainer(button) {
    const card = button.closest('.service-card');
    const containerId = card.dataset.containerId;
    ws.send(JSON.stringify({ type: 'restart', containerId }));
}

function stopContainer(button) {
    const card = button.closest('.service-card');
    const containerId = card.dataset.containerId;
    ws.send(JSON.stringify({ type: 'stop', containerId }));
}

function startContainer(button) {
    const card = button.closest('.service-card');
    const containerId = card.dataset.containerId;
    ws.send(JSON.stringify({ type: 'start', containerId }));
}

function viewLogs(button) {
    const card = button.closest('.service-card');
    const containerId = card.dataset.containerId;
    const container = containers.find(c => c.id === containerId);
    
    // Switch to logs tab
    showTab('logs');
    
    // Select the container
    document.getElementById('log-container-select').value = containerId;
    
    // Fetch logs
    fetchLogs();
}

// Fetch logs for selected container
function fetchLogs() {
    const select = document.getElementById('log-container-select');
    const containerId = select.value;
    const lines = document.getElementById('log-lines').value;
    
    if (!containerId) {
        showNotification('Please select a container', 'error');
        return;
    }
    
    selectedContainerId = containerId;
    
    // Clear existing logs
    document.getElementById('log-content').innerHTML = 'Loading logs...';
    
    // Request logs
    ws.send(JSON.stringify({ 
        type: 'getLogs', 
        containerId,
        tail: parseInt(lines)
    }));
}

// Append log to viewer
function appendLog(containerId, logData) {
    if (containerId !== selectedContainerId) return;
    
    const logContent = document.getElementById('log-content');
    
    // Clear loading message if present
    if (logContent.textContent === 'Loading logs...') {
        logContent.innerHTML = '';
    }
    
    // Parse and format log
    const logLine = document.createElement('div');
    logLine.className = 'log-line';
    
    // Detect log level
    if (logData.includes('ERROR') || logData.includes('error')) {
        logLine.classList.add('error');
    } else if (logData.includes('WARN') || logData.includes('warning')) {
        logLine.classList.add('warning');
    } else if (logData.includes('INFO') || logData.includes('info')) {
        logLine.classList.add('info');
    }
    
    logLine.textContent = logData;
    logContent.appendChild(logLine);
    
    // Auto-scroll if enabled
    if (document.getElementById('auto-scroll').checked) {
        logContent.scrollTop = logContent.scrollHeight;
    }
}

// Clear logs
function clearLogs() {
    document.getElementById('log-content').innerHTML = 'Select a container to view logs...';
}

// Tab switching
function showTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`).classList.add('active');
}

// Show notification
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        background: ${type === 'success' ? '#9ece6a' : type === 'error' ? '#f7768e' : '#7aa2f7'};
        color: white;
        border-radius: 8px;
        z-index: 1000;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initWebSocket();
    
    // Set up auto-scroll checkbox
    document.getElementById('auto-scroll').addEventListener('change', (e) => {
        autoScroll = e.target.checked;
    });
});