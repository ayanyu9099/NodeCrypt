// Admin utilities for NodeCrypt
// NodeCrypt 管理员工具

import { roomsData, activeRoomIndex } from './room.js';
import { addSystemMsg, renderChatArea, showToastMsg, addAnnouncementMsg } from './chat.js';
import { t } from './util.i18n.js';

// 被禁言的用户列表 { oderId: { oderId, odername, mutedAt, mutedUntil } }
const mutedUsers = new Map();

// 检查当前用户是否是管理员
export function isCurrentUserAdmin() {
	const rd = roomsData[activeRoomIndex];
	return rd && rd.myRole === 'admin';
}

// 检查用户是否被禁言
export function isUserMuted(userId) {
	const muted = mutedUsers.get(userId);
	if (!muted) return false;
	
	// 检查禁言是否过期
	if (muted.mutedUntil && Date.now() > muted.mutedUntil) {
		mutedUsers.delete(userId);
		return false;
	}
	return true;
}

// 禁言用户
export function muteUser(userId, userName, duration = 0, banIP = false) {
	const rd = roomsData[activeRoomIndex];
	if (!rd || rd.myRole !== 'admin') return false;
	
	const mutedUntil = duration > 0 ? Date.now() + duration * 60 * 1000 : 0; // duration 为分钟
	mutedUsers.set(userId, {
		userId,
		userName,
		mutedAt: Date.now(),
		mutedUntil
	});
	
	// 发送禁言通知给被禁言用户
	sendAdminAction(userId, 'mute', { duration });
	
	// 如果选择了 IP 禁言，发送请求到服务器
	if (banIP && rd.chat) {
		sendIPBanRequest(userId, duration);
	}
	
	const durationText = duration > 0 ? `${duration}${t('admin.minutes', '分钟')}` : t('admin.permanent', '永久');
	const ipText = banIP ? ` (${t('admin.ip_banned', 'IP已禁止')})` : '';
	addSystemMsg(`${t('admin.muted_user', '已禁言用户')} ${userName} (${durationText})${ipText}`);
	
	return true;
}

// 发送 IP 禁言请求到服务器
function sendIPBanRequest(targetId, duration) {
	const rd = roomsData[activeRoomIndex];
	if (!rd || !rd.chat) return;
	
	const payload = {
		a: 'ban_ip',
		t: targetId,
		d: duration
	};
	const encryptedMessage = rd.chat.encryptServerMessage(payload, rd.chat.serverShared);
	rd.chat.sendMessage(encryptedMessage);
}

// 解除禁言
export function unmuteUser(userId, userName) {
	const rd = roomsData[activeRoomIndex];
	if (!rd || rd.myRole !== 'admin') return false;
	
	mutedUsers.delete(userId);
	
	// 发送解除禁言通知
	sendAdminAction(userId, 'unmute', {});
	
	addSystemMsg(`${t('admin.unmuted_user', '已解除禁言')} ${userName}`);
	
	return true;
}

// 踢出用户
export function kickUser(userId, userName) {
	const rd = roomsData[activeRoomIndex];
	if (!rd || rd.myRole !== 'admin') return false;
	
	// 发送踢出通知给被踢用户
	sendAdminAction(userId, 'kick', {});
	
	addSystemMsg(`${t('admin.kicked_user', '已踢出用户')} ${userName}`);
	
	return true;
}

// 发送公告/广播
export function sendAnnouncement(message) {
	const rd = roomsData[activeRoomIndex];
	if (!rd || !rd.chat || rd.myRole !== 'admin') return false;
	
	// 向所有用户发送公告
	const announcementData = {
		type: 'announcement',
		text: message,
		from: rd.myUserName,
		timestamp: Date.now()
	};
	
	rd.chat.sendChannelMessage('announcement', announcementData);
	
	// 本地显示公告
	addAnnouncementMsg(message, rd.myUserName);
	showToastMsg(t('admin.announcement_sent', '公告已发送'), 'success');
	
	return true;
}

// 清空聊天记录
export function clearChatHistory() {
	const rd = roomsData[activeRoomIndex];
	if (!rd || rd.myRole !== 'admin') return false;
	
	// 清空当前私聊对象的聊天记录
	if (rd.privateChatTargetId && rd.privateChats[rd.privateChatTargetId]) {
		rd.privateChats[rd.privateChatTargetId].messages = [];
		rd.privateChats[rd.privateChatTargetId].unreadCount = 0;
	}
	
	// 重新渲染聊天区域
	renderChatArea();
	showToastMsg(t('admin.chat_cleared', '聊天记录已清空'), 'success');
	
	return true;
}

// 发送管理员操作给指定用户
function sendAdminAction(targetId, action, data) {
	const rd = roomsData[activeRoomIndex];
	if (!rd || !rd.chat) return;
	
	const targetClient = rd.chat.channel[targetId];
	if (targetClient && targetClient.shared) {
		const payload = {
			a: 'm',
			t: 'admin_action',
			d: {
				action,
				...data
			}
		};
		const encryptedMessage = rd.chat.encryptClientMessage(payload, targetClient.shared);
		const serverPayload = {
			a: 'c',
			p: encryptedMessage,
			c: targetId
		};
		const encryptedServerMessage = rd.chat.encryptServerMessage(serverPayload, rd.chat.serverShared);
		rd.chat.sendMessage(encryptedServerMessage);
	}
}

// 处理收到的管理员操作
export function handleAdminAction(action, data) {
	switch (action) {
		case 'kick':
			addSystemMsg(t('admin.you_were_kicked', '您已被管理员踢出房间'));
			// 延迟后断开连接
			setTimeout(() => {
				const rd = roomsData[activeRoomIndex];
				if (rd && rd.chat) {
					rd.chat.disconnect();
				}
				location.reload();
			}, 2000);
			break;
			
		case 'mute':
			const duration = data.duration || 0;
			const durationText = duration > 0 ? `${duration}${t('admin.minutes', '分钟')}` : t('admin.permanent', '永久');
			addSystemMsg(`${t('admin.you_were_muted', '您已被禁言')} (${durationText})`);
			// 设置本地禁言状态
			window.isMuted = true;
			window.mutedUntil = duration > 0 ? Date.now() + duration * 60 * 1000 : 0;
			break;
			
		case 'unmute':
			addSystemMsg(t('admin.you_were_unmuted', '您的禁言已被解除'));
			window.isMuted = false;
			window.mutedUntil = 0;
			break;
	}
}

// 显示管理员操作菜单
export function showAdminMenu(user, event) {
	event.stopPropagation();
	
	// 移除已存在的菜单
	const existingMenu = document.querySelector('.admin-menu');
	if (existingMenu) existingMenu.remove();
	
	const rd = roomsData[activeRoomIndex];
	if (!rd || rd.myRole !== 'admin') return;
	
	const isMuted = isUserMuted(user.clientId);
	const userName = user.userName || user.username || user.name || '';
	
	const menu = document.createElement('div');
	menu.className = 'admin-menu';
	menu.innerHTML = `
		<div class="admin-menu-header">${t('admin.manage_user', '管理用户')}: ${userName}</div>
		<div class="admin-menu-item" data-action="kick">
			<span class="admin-menu-icon">🚫</span>
			${t('admin.kick', '踢出房间')}
		</div>
		<div class="admin-menu-item" data-action="${isMuted ? 'unmute' : 'mute'}">
			<span class="admin-menu-icon">${isMuted ? '🔊' : '🔇'}</span>
			${isMuted ? t('admin.unmute', '解除禁言') : t('admin.mute', '禁言')}
		</div>
		<div class="admin-menu-item" data-action="mute_ip">
			<span class="admin-menu-icon">🌐</span>
			${t('admin.mute_ip', 'IP禁言')}
		</div>
	`;
	
	// 定位菜单 - 确保不超出屏幕
	menu.style.position = 'fixed';
	document.body.appendChild(menu);
	
	// 获取菜单尺寸
	const menuRect = menu.getBoundingClientRect();
	const menuWidth = menuRect.width || 180;
	const menuHeight = menuRect.height || 120;
	
	// 计算位置，确保不超出屏幕
	let left = event.clientX;
	let top = event.clientY;
	
	// 如果超出右边界，向左偏移
	if (left + menuWidth > window.innerWidth) {
		left = window.innerWidth - menuWidth - 10;
	}
	// 如果超出下边界，向上偏移
	if (top + menuHeight > window.innerHeight) {
		top = window.innerHeight - menuHeight - 10;
	}
	
	menu.style.left = left + 'px';
	menu.style.top = top + 'px';
	
	// 点击菜单项
	menu.addEventListener('click', (e) => {
		const item = e.target.closest('.admin-menu-item');
		if (!item) return;
		
		const action = item.dataset.action;
		switch (action) {
			case 'kick':
				if (confirm(`${t('admin.confirm_kick', '确定要踢出用户')} ${userName}?`)) {
					kickUser(user.clientId, userName);
				}
				break;
			case 'mute':
				const muteDuration = prompt(t('admin.mute_duration', '请输入禁言时长（分钟，0为永久）:'), '10');
				if (muteDuration !== null) {
					muteUser(user.clientId, userName, parseInt(muteDuration) || 0, false);
				}
				break;
			case 'mute_ip':
				const ipDuration = prompt(t('admin.mute_ip_duration', '请输入IP禁言时长（分钟，0为永久）:\n此操作将禁止该用户及其所有相同IP的用户'), '10');
				if (ipDuration !== null) {
					muteUser(user.clientId, userName, parseInt(ipDuration) || 0, true);
				}
				break;
			case 'unmute':
				unmuteUser(user.clientId, userName);
				break;
		}
		menu.remove();
	});
	
	// 点击其他地方关闭菜单
	setTimeout(() => {
		document.addEventListener('click', function closeMenu() {
			menu.remove();
			document.removeEventListener('click', closeMenu);
		});
	}, 10);
}

// 显示管理员工具栏
export function renderAdminToolbar() {
	const rd = roomsData[activeRoomIndex];
	if (!rd || rd.myRole !== 'admin') return '';
	
	return `
		<div class="admin-toolbar">
			<button class="admin-btn" id="admin-announce-btn" title="${t('admin.send_announcement', '发送公告')}">
				📢
			</button>
			<button class="admin-btn" id="admin-clear-btn" title="${t('admin.clear_chat', '清空聊天')}">
				🗑️
			</button>
		</div>
	`;
}

// 初始化管理员工具栏事件
export function initAdminToolbar() {
	const announceBtn = document.getElementById('admin-announce-btn');
	const clearBtn = document.getElementById('admin-clear-btn');
	
	if (announceBtn) {
		announceBtn.onclick = () => {
			const message = prompt(t('admin.enter_announcement', '请输入公告内容:'));
			if (message && message.trim()) {
				sendAnnouncement(message.trim());
			}
		};
	}
	
	if (clearBtn) {
		clearBtn.onclick = () => {
			if (confirm(t('admin.confirm_clear', '确定要清空当前聊天记录吗？'))) {
				clearChatHistory();
			}
		};
	}
}

// 获取禁言剩余时间的格式化文本
export function getMuteRemainingTime() {
	if (!window.isMuted) return null;
	
	// 永久禁言
	if (!window.mutedUntil || window.mutedUntil === 0) {
		return t('admin.permanent', '永久');
	}
	
	const remaining = window.mutedUntil - Date.now();
	if (remaining <= 0) {
		return null; // 已过期
	}
	
	// 计算剩余时间
	const totalSeconds = Math.ceil(remaining / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	
	if (hours > 0) {
		return `${hours}${t('admin.hours', '小时')}${minutes}${t('admin.minutes', '分钟')}`;
	} else if (minutes > 0) {
		return `${minutes}${t('admin.minutes', '分钟')}${seconds}${t('admin.seconds', '秒')}`;
	} else {
		return `${seconds}${t('admin.seconds', '秒')}`;
	}
}

// 获取禁言解除时间的格式化文本
export function getMuteEndTime() {
	if (!window.isMuted || !window.mutedUntil || window.mutedUntil === 0) {
		return null;
	}
	
	const endDate = new Date(window.mutedUntil);
	const hours = endDate.getHours().toString().padStart(2, '0');
	const minutes = endDate.getMinutes().toString().padStart(2, '0');
	const seconds = endDate.getSeconds().toString().padStart(2, '0');
	
	return `${hours}:${minutes}:${seconds}`;
}

// 导出禁言检查函数供发送消息时使用
export function checkMuteStatus() {
	if (window.isMuted) {
		if (window.mutedUntil && window.mutedUntil > 0 && Date.now() > window.mutedUntil) {
			window.isMuted = false;
			window.mutedUntil = 0;
			return false;
		}
		return true;
	}
	return false;
}
