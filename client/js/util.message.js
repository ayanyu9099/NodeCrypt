// Message utilities for NodeCrypt
// NodeCrypt 消息工具（已读回执、撤回、引用）

import { roomsData, activeRoomIndex } from './room.js';
import { t } from './util.i18n.js';
import { showToastMsg } from './chat.js';

// ============ 消息已读回执 ============

// 发送已读回执
export function sendReadReceipt(messageIds) {
	const rd = roomsData[activeRoomIndex];
	if (!rd || !rd.chat || !rd.privateChatTargetId) return;
	
	const targetClient = rd.chat.channel[rd.privateChatTargetId];
	if (!targetClient || !targetClient.shared) return;
	
	const payload = {
		a: 'm',
		t: 'read_receipt',
		d: { messageIds: Array.isArray(messageIds) ? messageIds : [messageIds] }
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

// 处理收到的已读回执
export function handleReadReceipt(senderId, messageIds) {
	const rd = roomsData[activeRoomIndex];
	if (!rd) return;
	
	// 更新消息的已读状态
	const privateChat = rd.privateChats[senderId];
	if (privateChat && privateChat.messages) {
		privateChat.messages.forEach(msg => {
			if (messageIds.includes(msg.id)) {
				msg.read = true;
				msg.readAt = Date.now();
			}
		});
	}
	
	// 更新 UI
	updateMessageReadStatus(messageIds);
}

// 更新消息已读状态 UI
function updateMessageReadStatus(messageIds) {
	messageIds.forEach(id => {
		const msgEl = document.querySelector(`[data-message-id="${id}"]`);
		if (msgEl) {
			const statusEl = msgEl.querySelector('.message-status');
			if (statusEl) {
				statusEl.innerHTML = '✓✓'; // 双勾表示已读
				statusEl.classList.add('read');
				statusEl.title = t('chat.read', '已读');
			}
		}
	});
}

// 标记消息为已读（当查看消息时调用）
export function markMessagesAsRead(targetId) {
	const rd = roomsData[activeRoomIndex];
	if (!rd || !targetId) return;
	
	const privateChat = rd.privateChats[targetId];
	if (!privateChat || !privateChat.messages) return;
	
	// 找出所有未读的对方消息
	const unreadMessageIds = privateChat.messages
		.filter(msg => msg.type === 'other' && !msg.read && msg.id)
		.map(msg => msg.id);
	
	if (unreadMessageIds.length > 0) {
		// 标记本地已读
		privateChat.messages.forEach(msg => {
			if (unreadMessageIds.includes(msg.id)) {
				msg.read = true;
			}
		});
		
		// 发送已读回执
		sendReadReceipt(unreadMessageIds);
	}
}

// ============ 消息撤回 ============

// 撤回消息（2分钟内）
export function recallMessage(messageId) {
	const rd = roomsData[activeRoomIndex];
	if (!rd || !rd.chat || !rd.privateChatTargetId) return false;
	
	// 查找消息
	const privateChat = rd.privateChats[rd.privateChatTargetId];
	if (!privateChat || !privateChat.messages) return false;
	
	const msgIndex = privateChat.messages.findIndex(m => m.id === messageId);
	if (msgIndex === -1) return false;
	
	const msg = privateChat.messages[msgIndex];
	
	// 检查是否是自己的消息
	if (msg.type !== 'me') {
		showToastMsg(t('chat.cannot_recall_others', '只能撤回自己的消息'), 'error');
		return false;
	}
	
	// 检查时间限制（2分钟）
	const timeDiff = Date.now() - (msg.timestamp || 0);
	if (timeDiff > 2 * 60 * 1000) {
		showToastMsg(t('chat.recall_timeout', '超过2分钟无法撤回'), 'error');
		return false;
	}
	
	// 发送撤回消息
	const targetClient = rd.chat.channel[rd.privateChatTargetId];
	if (!targetClient || !targetClient.shared) return false;
	
	const payload = {
		a: 'm',
		t: 'recall',
		d: { messageId: messageId }
	};
	
	const encryptedMessage = rd.chat.encryptClientMessage(payload, targetClient.shared);
	const serverPayload = {
		a: 'c',
		p: encryptedMessage,
		c: rd.privateChatTargetId
	};
	const encryptedServerMessage = rd.chat.encryptServerMessage(serverPayload, rd.chat.serverShared);
	rd.chat.sendMessage(encryptedServerMessage);
	
	// 本地标记为已撤回
	msg.recalled = true;
	msg.recalledAt = Date.now();
	
	// 更新 UI
	updateRecalledMessage(messageId);
	showToastMsg(t('chat.message_recalled', '消息已撤回'), 'success');
	
	return true;
}

// 处理收到的撤回消息
export function handleRecallMessage(senderId, messageId) {
	const rd = roomsData[activeRoomIndex];
	if (!rd) return;
	
	const privateChat = rd.privateChats[senderId];
	if (!privateChat || !privateChat.messages) return;
	
	const msg = privateChat.messages.find(m => m.id === messageId);
	if (msg) {
		msg.recalled = true;
		msg.recalledAt = Date.now();
		updateRecalledMessage(messageId);
	}
}

// 更新撤回消息 UI
function updateRecalledMessage(messageId) {
	const msgEl = document.querySelector(`[data-message-id="${messageId}"]`);
	if (msgEl) {
		const bubbleEl = msgEl.querySelector('.bubble');
		if (bubbleEl) {
			bubbleEl.innerHTML = `<span class="recalled-message">${t('chat.message_was_recalled', '消息已被撤回')}</span>`;
			bubbleEl.classList.add('recalled');
		}
	}
}

// ============ 消息引用/回复 ============

// 当前引用的消息
let quotedMessage = null;

// 设置引用消息
export function setQuotedMessage(message) {
	quotedMessage = message;
	updateQuotePreview();
}

// 获取引用消息
export function getQuotedMessage() {
	return quotedMessage;
}

// 清除引用消息
export function clearQuotedMessage() {
	quotedMessage = null;
	updateQuotePreview();
}

// 更新引用预览 UI
function updateQuotePreview() {
	let previewEl = document.getElementById('quote-preview');
	
	if (!quotedMessage) {
		if (previewEl) {
			previewEl.remove();
		}
		return;
	}
	
	if (!previewEl) {
		previewEl = document.createElement('div');
		previewEl.id = 'quote-preview';
		previewEl.className = 'quote-preview';
		
		const inputWrapper = document.querySelector('.chat-input-wrapper');
		if (inputWrapper) {
			inputWrapper.insertBefore(previewEl, inputWrapper.firstChild);
		}
	}
	
	const senderName = quotedMessage.userName || t('chat.me', '我');
	const previewText = getMessagePreview(quotedMessage.text, 50);
	
	previewEl.innerHTML = `
		<div class="quote-preview-content">
			<div class="quote-preview-sender">${senderName}</div>
			<div class="quote-preview-text">${previewText}</div>
		</div>
		<button class="quote-preview-close" onclick="window.clearQuotedMessage()">×</button>
	`;
}

// 获取消息预览文本
function getMessagePreview(text, maxLength = 50) {
	if (!text) return '';
	
	// 如果是对象（图片消息等）
	if (typeof text === 'object') {
		if (text.images && text.images.length > 0) {
			return `[${t('chat.image', '图片')}]`;
		}
		if (text.fileName) {
			return `[${t('chat.file', '文件')}] ${text.fileName}`;
		}
		return '[' + t('chat.message', '消息') + ']';
	}
	
	// 截断文本
	if (text.length > maxLength) {
		return text.substring(0, maxLength) + '...';
	}
	return text;
}

// 生成消息 ID
export function generateMessageId() {
	return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// 暴露到全局
window.clearQuotedMessage = clearQuotedMessage;
