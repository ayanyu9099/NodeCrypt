// Typing indicator utilities for NodeCrypt
// NodeCrypt 正在输入提示工具

import { roomsData, activeRoomIndex } from './room.js';
import { t } from './util.i18n.js';

// 正在输入的用户列表 { oderId: { odername, timestamp } }
const typingUsers = new Map();

// 输入超时时间（毫秒）
const TYPING_TIMEOUT = 3000;

// 清理定时器
let cleanupTimer = null;

// 发送正在输入状态
export function sendTypingStatus(isTyping = true) {
	const rd = roomsData[activeRoomIndex];
	if (!rd || !rd.chat || !rd.privateChatTargetId) return;
	
	const targetClient = rd.chat.channel[rd.privateChatTargetId];
	if (!targetClient || !targetClient.shared) return;
	
	const payload = {
		a: 'm',
		t: 'typing',
		d: { typing: isTyping }
	};
	
	const encryptedMessage = rd.chat.encryptClientMessage(payload, targetClient.shared);
	const serverPayload = {
		a: 'c',
		p: encryptedMessage,
		c: rd.privateChatTargetId
	};
	const encryptedServerMessage = rd.chat.encryptServerMessage(serverPayload, rd.chat.serverShared);
	rd.chat.sendMessage(encryptedServerMessage);
}

// 处理收到的输入状态
export function handleTypingStatus(senderId, senderName, isTyping) {
	if (isTyping) {
		typingUsers.set(senderId, {
			name: senderName,
			timestamp: Date.now()
		});
	} else {
		typingUsers.delete(senderId);
	}
	
	updateTypingIndicator();
	
	// 启动清理定时器
	if (!cleanupTimer) {
		cleanupTimer = setInterval(cleanupExpiredTyping, 1000);
	}
}

// 清理过期的输入状态
function cleanupExpiredTyping() {
	const now = Date.now();
	let hasChanges = false;
	
	for (const [userId, data] of typingUsers) {
		if (now - data.timestamp > TYPING_TIMEOUT) {
			typingUsers.delete(userId);
			hasChanges = true;
		}
	}
	
	if (hasChanges) {
		updateTypingIndicator();
	}
	
	// 如果没有正在输入的用户，停止定时器
	if (typingUsers.size === 0 && cleanupTimer) {
		clearInterval(cleanupTimer);
		cleanupTimer = null;
	}
}

// 更新输入指示器显示
export function updateTypingIndicator() {
	const rd = roomsData[activeRoomIndex];
	if (!rd) return;
	
	// 只显示当前聊天对象的输入状态
	const targetTyping = rd.privateChatTargetId ? typingUsers.get(rd.privateChatTargetId) : null;
	
	const indicator = document.getElementById('typing-indicator');
	if (!indicator) return;
	
	if (targetTyping) {
		indicator.textContent = `${targetTyping.name} ${t('chat.typing', '正在输入...')}`;
		indicator.style.display = 'block';
	} else {
		indicator.style.display = 'none';
	}
}

// 获取当前聊天对象是否正在输入
export function isTargetTyping() {
	const rd = roomsData[activeRoomIndex];
	if (!rd || !rd.privateChatTargetId) return false;
	return typingUsers.has(rd.privateChatTargetId);
}

// 输入防抖处理
let typingDebounceTimer = null;
let lastTypingSent = 0;

export function handleInputChange() {
	const now = Date.now();
	
	// 每 2 秒最多发送一次输入状态
	if (now - lastTypingSent > 2000) {
		sendTypingStatus(true);
		lastTypingSent = now;
	}
	
	// 停止输入后 2 秒发送停止状态
	if (typingDebounceTimer) {
		clearTimeout(typingDebounceTimer);
	}
	
	typingDebounceTimer = setTimeout(() => {
		sendTypingStatus(false);
		typingDebounceTimer = null;
	}, 2000);
}

// 清除输入状态（发送消息后调用）
export function clearTypingStatus() {
	if (typingDebounceTimer) {
		clearTimeout(typingDebounceTimer);
		typingDebounceTimer = null;
	}
	sendTypingStatus(false);
}
