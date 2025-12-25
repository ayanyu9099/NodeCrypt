// Connection management utilities for NodeCrypt
// NodeCrypt 连接管理工具

import { t } from './util.i18n.js';
import { roomsData, activeRoomIndex } from './room.js';

// 连接状态
let connectionStatus = 'disconnected'; // 'connected', 'connecting', 'disconnected', 'reconnecting'
let lastPongTime = 0;
let connectionCheckTimer = null;
let visibilityReconnectTimer = null;

// 连接状态变化回调
const statusCallbacks = [];

// 获取当前连接状态
export function getConnectionStatus() {
	return connectionStatus;
}

// 设置连接状态
export function setConnectionStatus(status) {
	if (connectionStatus !== status) {
		connectionStatus = status;
		updateConnectionIndicator();
		notifyStatusChange(status);
	}
}

// 注册状态变化回调
export function onConnectionStatusChange(callback) {
	statusCallbacks.push(callback);
}

// 通知状态变化
function notifyStatusChange(status) {
	statusCallbacks.forEach(cb => {
		try { cb(status); } catch (e) { console.error(e); }
	});
}

// 更新连接状态指示器
export function updateConnectionIndicator() {
	const indicator = document.getElementById('connection-indicator');
	if (!indicator) return;
	
	indicator.className = 'connection-indicator';
	
	switch (connectionStatus) {
		case 'connected':
			indicator.classList.add('connected');
			indicator.title = t('connection.connected', '已连接');
			indicator.innerHTML = '<span class="connection-dot"></span>';
			break;
		case 'connecting':
			indicator.classList.add('connecting');
			indicator.title = t('connection.connecting', '连接中...');
			indicator.innerHTML = '<span class="connection-dot"></span>';
			break;
		case 'reconnecting':
			indicator.classList.add('reconnecting');
			indicator.title = t('connection.reconnecting', '重新连接中...');
			indicator.innerHTML = '<span class="connection-dot"></span>';
			break;
		case 'disconnected':
		default:
			indicator.classList.add('disconnected');
			indicator.title = t('connection.disconnected', '已断开');
			indicator.innerHTML = '<span class="connection-dot"></span><span class="reconnect-btn" onclick="window.manualReconnect && window.manualReconnect()">🔄</span>';
			break;
	}
}

// 创建连接状态指示器
export function createConnectionIndicator() {
	// 检查是否已存在
	if (document.getElementById('connection-indicator')) return;
	
	const indicator = document.createElement('div');
	indicator.id = 'connection-indicator';
	indicator.className = 'connection-indicator disconnected';
	document.body.appendChild(indicator);
	
	updateConnectionIndicator();
}

// 手动重连
export function manualReconnect() {
	const rd = roomsData[activeRoomIndex];
	if (!rd || !rd.chat) {
		console.warn('No active room to reconnect');
		return;
	}
	
	setConnectionStatus('reconnecting');
	
	// 注意：不更新 joinTime，保持原来的加入时间
	// 这样重连用户会被识别为先加入者
	// Note: Don't update joinTime, keep original join time
	// This way reconnecting user will be identified as earlier joiner
	
	// 尝试重连
	if (rd.chat.isClosed()) {
		rd.chat.connect();
	} else if (!rd.chat.isOpen()) {
		// 连接状态异常，先断开再重连
		try {
			rd.chat.connection?.close();
		} catch (e) {}
		setTimeout(() => rd.chat.connect(), 500);
	}
}

// 暴露到全局
window.manualReconnect = manualReconnect;

// 检查连接健康状态
function checkConnectionHealth() {
	const rd = roomsData[activeRoomIndex];
	if (!rd || !rd.chat) return;
	
	if (rd.chat.isOpen()) {
		setConnectionStatus('connected');
	} else if (rd.chat.isClosed()) {
		setConnectionStatus('disconnected');
	}
}

// 页面可见性变化处理
function handleVisibilityChange() {
	if (document.visibilityState === 'visible') {
		// 页面变为可见，检查连接状态
		console.log('[Connection] Page became visible, checking connection...');
		
		// 清除之前的定时器
		if (visibilityReconnectTimer) {
			clearTimeout(visibilityReconnectTimer);
		}
		
		// 延迟一点检查，给浏览器恢复时间
		visibilityReconnectTimer = setTimeout(() => {
			const rd = roomsData[activeRoomIndex];
			if (!rd || !rd.chat) return;
			
			if (rd.chat.isClosed()) {
				console.log('[Connection] Connection lost while in background, reconnecting...');
				setConnectionStatus('reconnecting');
				// 注意：不更新 joinTime，保持原来的加入时间
				// Note: Don't update joinTime, keep original join time
				rd.chat.connect();
			} else if (rd.chat.isOpen()) {
				// 发送一个 ping 确认连接还活着
				rd.chat.sendMessage('ping');
				setConnectionStatus('connected');
			}
		}, 500);
	} else {
		// 页面变为不可见
		console.log('[Connection] Page became hidden');
	}
}

// 网络状态变化处理
function handleOnline() {
	console.log('[Connection] Network online');
	const rd = roomsData[activeRoomIndex];
	if (rd && rd.chat && rd.chat.isClosed()) {
		setConnectionStatus('reconnecting');
		// 注意：不更新 joinTime，保持原来的加入时间
		// Note: Don't update joinTime, keep original join time
		setTimeout(() => rd.chat.connect(), 1000);
	}
}

function handleOffline() {
	console.log('[Connection] Network offline');
	setConnectionStatus('disconnected');
}

// 初始化连接管理
export function initConnectionManager() {
	// 创建状态指示器
	createConnectionIndicator();
	
	// 监听页面可见性变化
	document.addEventListener('visibilitychange', handleVisibilityChange);
	
	// 监听网络状态变化
	window.addEventListener('online', handleOnline);
	window.addEventListener('offline', handleOffline);
	
	// 定期检查连接状态
	connectionCheckTimer = setInterval(checkConnectionHealth, 5000);
	
	console.log('[Connection] Connection manager initialized');
}

// 清理连接管理
export function destroyConnectionManager() {
	document.removeEventListener('visibilitychange', handleVisibilityChange);
	window.removeEventListener('online', handleOnline);
	window.removeEventListener('offline', handleOffline);
	
	if (connectionCheckTimer) {
		clearInterval(connectionCheckTimer);
		connectionCheckTimer = null;
	}
	
	if (visibilityReconnectTimer) {
		clearTimeout(visibilityReconnectTimer);
		visibilityReconnectTimer = null;
	}
}

// 记录 pong 响应时间（用于检测连接质量）
export function recordPong() {
	lastPongTime = Date.now();
}

// 获取上次 pong 时间
export function getLastPongTime() {
	return lastPongTime;
}
