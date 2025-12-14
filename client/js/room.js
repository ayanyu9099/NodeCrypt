// Room management logic for NodeCrypt web client
// NodeCrypt 网页客户端的房间管理逻辑

import {
	createAvatarSVG
} from './util.avatar.js';
import {
	renderChatArea,
	addSystemMsg,
	addAnnouncementMsg,
	updateChatInputStyle
} from './chat.js';
import {
	handleAdminAction
} from './util.admin.js';
import {
	renderMainHeader,
	renderUserList
} from './ui.js';
import {
	escapeHTML
} from './util.string.js';
import {
	$id,
	createElement
} from './util.dom.js';
import { t } from './util.i18n.js';
let roomsData = [];
let activeRoomIndex = -1;

// User roles - 用户角色
export const USER_ROLES = {
	ADMIN: 'admin',
	USER: 'user'
};

// Get a new room data object
// 获取一个新的房间数据对象
export function getNewRoomData() {
	return {
		roomName: '',
		userList: [],
		userMap: {},
		myId: null,
		myUserName: '',
		myRole: USER_ROLES.USER,  // 用户角色
		chat: null,
		messages: [],
		prevUserList: [],
		knownUserIds: new Set(),
		unreadCount: 0,
		privateChatTargetId: null,
		privateChatTargetName: null,
		// 单聊模式：每个用户的独立聊天记录
		privateChats: {}  // { oderId: { messages: [], unreadCount: 0 } }
	}
}

// Switch to another room by index
// 切换到指定索引的房间
export function switchRoom(index) {
	if (index < 0 || index >= roomsData.length) return;
	activeRoomIndex = index;
	const rd = roomsData[index];
	if (typeof rd.unreadCount === 'number') rd.unreadCount = 0;
	const sidebarUsername = document.getElementById('sidebar-username');
	if (sidebarUsername) sidebarUsername.textContent = rd.myUserName;
	setSidebarAvatar(rd.myUserName);
	renderRooms(index);
	renderMainHeader();
	renderUserList(false);
	renderChatArea();
	updateChatInputStyle()
}

// Set the sidebar avatar
// 设置侧边栏头像
export function setSidebarAvatar(userName) {
	if (!userName) return;
	const svg = createAvatarSVG(userName);
	const el = $id('sidebar-user-avatar');
	if (el) {
		const cleanSvg = svg.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
		el.innerHTML = cleanSvg
	}
}

// Render the room list
// 渲染房间列表
export function renderRooms(activeId = 0) {
	const roomList = $id('room-list');
	roomList.innerHTML = '';
	roomsData.forEach((rd, i) => {
		const div = createElement('div', {
			class: 'room' + (i === activeId ? ' active' : ''),
			onclick: () => switchRoom(i)
		});
		const safeRoomName = escapeHTML(rd.roomName);
		let unreadHtml = '';
		if (rd.unreadCount && i !== activeId) {
			unreadHtml = `<span class="room-unread-badge">${rd.unreadCount>99?'99+':rd.unreadCount}</span>`
		}
		div.innerHTML = `<div class="info"><div class="title">#${safeRoomName}</div></div>${unreadHtml}`;
		roomList.appendChild(div)
	})
}

// Join a room
// 加入一个房间
export function joinRoom(userName, roomName, password, modal = null, onResult, userRole = USER_ROLES.USER) {
	const newRd = getNewRoomData();
	newRd.roomName = roomName;
	newRd.myUserName = userName;
	newRd.password = password;
	newRd.myRole = userRole;  // 保存用户角色
	roomsData.push(newRd);
	const idx = roomsData.length - 1;
	switchRoom(idx);
	const sidebarUsername = $id('sidebar-username');
	if (sidebarUsername) sidebarUsername.textContent = userName;
	setSidebarAvatar(userName);
	
	// 显示用户角色标识
	updateRoleBadge(userRole);
	
	let closed = false;
	const callbacks = {
		onServerClosed: () => {
			console.log('Node connection closed');
			// 连接关闭时，从房间列表中移除
			const roomIdx = roomsData.findIndex(r => r === newRd);
			if (roomIdx !== -1) {
				roomsData.splice(roomIdx, 1);
			}
			if (onResult && !closed) {
				closed = true;
				onResult(false)
			}
		},
		onServerSecured: () => {
			if (modal) modal.remove();
			else {
				const loginContainer = $id('login-container');
				if (loginContainer) loginContainer.style.display = 'none';
				const chatContainer = $id('chat-container');
				if (chatContainer) chatContainer.style.display = '';
			}
			if (onResult && !closed) {
				closed = true;
				onResult(true)
			}
			const roleText = userRole === USER_ROLES.ADMIN ? t('system.admin_login', '管理员身份登录') : '';
			addSystemMsg(t('system.secured', 'connection secured') + (roleText ? ' - ' + roleText : ''))
		},
		onClientSecured: (user) => handleClientSecured(idx, user),
		onClientList: (list, selfId) => handleClientList(idx, list, selfId),
		onClientLeft: (clientId) => handleClientLeft(idx, clientId),
		onClientMessage: (msg) => handleClientMessage(idx, msg)
	};
	const chatInst = new window.NodeCrypt(window.config, callbacks);
	chatInst.setCredentials(userName, roomName, password, userRole);  // 传递角色
	chatInst.connect();
	roomsData[idx].chat = chatInst
}

// 更新角色标识
function updateRoleBadge(role) {
	const sidebarUser = document.querySelector('.sidebar-user');
	if (!sidebarUser) return;
	
	// 移除旧的角色标识
	const oldBadge = sidebarUser.querySelector('.role-badge');
	if (oldBadge) oldBadge.remove();
	
	// 如果是管理员，添加标识
	if (role === USER_ROLES.ADMIN) {
		const badge = document.createElement('span');
		badge.className = 'role-badge admin-badge';
		badge.textContent = t('ui.admin', '管理员');
		sidebarUser.appendChild(badge);
	}
}

// Handle the client list update
// 处理客户端列表更新
export function handleClientList(idx, list, selfId) {
	const rd = roomsData[idx];
	if (!rd) return;
	const oldUserIds = new Set((rd.userList || []).map(u => u.clientId));
	const newUserIds = new Set(list.map(u => u.clientId));
	for (const oldId of oldUserIds) {
		if (!newUserIds.has(oldId)) {
			handleClientLeft(idx, oldId)
		}
	}
	rd.userList = list;
	rd.userMap = {};
	list.forEach(u => {
		rd.userMap[u.clientId] = u
	});
	rd.myId = selfId;
	if (activeRoomIndex === idx) {
		renderUserList(false);
		renderMainHeader()
	}
	rd.initCount = (rd.initCount || 0) + 1;
	if (rd.initCount === 2) {
		rd.isInitialized = true;
		rd.knownUserIds = new Set(list.map(u => u.clientId))
	}
}

// Handle client secured event
// 处理客户端安全连接事件
export function handleClientSecured(idx, user) {
	const rd = roomsData[idx];
	if (!rd) return;
	rd.userMap[user.clientId] = user;
	const existingUserIndex = rd.userList.findIndex(u => u.clientId === user.clientId);
	if (existingUserIndex === -1) {
		rd.userList.push(user)
	} else {
		rd.userList[existingUserIndex] = user
	}
	if (activeRoomIndex === idx) {
		renderUserList(false);
		renderMainHeader()
	}
	if (!rd.isInitialized) {
		return
	}
	const isNew = !rd.knownUserIds.has(user.clientId);
	if (isNew) {
		rd.knownUserIds.add(user.clientId);		const name = user.userName || user.username || user.name || t('ui.anonymous', 'Anonymous');
		const msg = `${name} ${t('system.joined', 'joined the conversation')}`;
		rd.messages.push({
			type: 'system',
			text: msg
		});
		if (activeRoomIndex === idx) addSystemMsg(msg, true);
		if (window.notifyMessage) {
			window.notifyMessage(rd.roomName, 'system', msg)
		}
	}
}

// Handle client left event
// 处理客户端离开事件
export function handleClientLeft(idx, clientId) {
	const rd = roomsData[idx];
	if (!rd) return;
	if (rd.privateChatTargetId === clientId) {
		rd.privateChatTargetId = null;
		rd.privateChatTargetName = null;
		if (activeRoomIndex === idx) {
			updateChatInputStyle()
		}
	}
	const user = rd.userMap[clientId];
	const name = user ? (user.userName || user.username || user.name || 'Anonymous') : 'Anonymous';
	const msg = `${name} ${t('system.left', 'left the conversation')}`;
	rd.messages.push({
		type: 'system',
		text: msg
	});
	if (activeRoomIndex === idx) addSystemMsg(msg, true);
	rd.userList = rd.userList.filter(u => u.clientId !== clientId);
	delete rd.userMap[clientId];
	if (activeRoomIndex === idx) {
		renderUserList(false);
		renderMainHeader()
	}
}

// Handle client message event
// 处理客户端消息事件
export function handleClientMessage(idx, msg) {
	const newRd = roomsData[idx];
	if (!newRd) return;

	// Prevent processing own messages unless it's a private message sent to oneself
	if (msg.clientId === newRd.myId && msg.userName === newRd.myUserName && !msg.type.includes('_private')) {
		return;
	}

	let msgType = msg.type || 'text';
	const isPrivateMessage = msgType.includes('_private');
	const senderId = msg.clientId;
	
	// 处理管理员操作消息
	// Handle admin action messages
	if (msgType === 'admin_action') {
		handleAdminAction(msg.data.action, msg.data);
		return;
	}
	
	// 处理公告消息
	// Handle announcement messages
	if (msgType === 'announcement') {
		const announcementData = msg.data;
		if (activeRoomIndex === idx) {
			addAnnouncementMsg(announcementData.text, announcementData.from);
		}
		if (window.notifyMessage) {
			window.notifyMessage(newRd.roomName, 'announcement', announcementData.text, announcementData.from);
		}
		return;
	}

	// Handle file messages
	if (msgType.startsWith('file_')) {
		// Part 1: Update message history and send notifications (for 'file_start' type)
		if (msgType === 'file_start' || msgType === 'file_start_private') {
			let realUserName = msg.userName;
			if (!realUserName && msg.clientId && newRd.userMap[msg.clientId]) {
				realUserName = newRd.userMap[msg.clientId].userName || newRd.userMap[msg.clientId].username || newRd.userMap[msg.clientId].name;
			}
			const historyMsgType = msgType === 'file_start_private' ? 'file_private' : 'file';
			
			const fileId = msg.data && msg.data.fileId;
			if (fileId) {
				const messageObj = {
					type: 'other',
					text: msg.data,
					userName: realUserName,
					avatar: realUserName,
					msgType: historyMsgType,
					timestamp: (msg.data && msg.data.timestamp) || Date.now()
				};
				
				// 单聊模式：存储到对应用户的私聊记录
				if (isPrivateMessage && senderId) {
					addToPrivateChat(newRd, senderId, messageObj);
				} else {
					newRd.messages.push(messageObj);
				}
			}

			const notificationMsgType = msgType.includes('_private') ? 'private file' : 'file';
			if (window.notifyMessage && msg.data && msg.data.fileName) {
				window.notifyMessage(newRd.roomName, notificationMsgType, `${msg.data.fileName}`, realUserName);
			}
		}

		// Part 2: Handle UI interaction
		if (activeRoomIndex === idx) {
			if (window.handleFileMessage) {
				window.handleFileMessage(msg.data, isPrivateMessage);
			}
		} else {
			if (msgType === 'file_start' || msgType === 'file_start_private') {
				newRd.unreadCount = (newRd.unreadCount || 0) + 1;
				renderRooms(activeRoomIndex);
			}
		}
		return;
	}

	// Handle image messages (both new and legacy formats)
	if (msgType === 'image' || msgType === 'image_private') {
		// Already has correct type
	} else if (!msgType.includes('_private')) {
		// Handle legacy image detection
		if (msg.data && typeof msg.data === 'string' && msg.data.startsWith('data:image/')) {
			msgType = 'image';
		} else if (msg.data && typeof msg.data === 'object' && msg.data.image) {
			msgType = 'image';
		}
	}
	
	let realUserName = msg.userName;
	if (!realUserName && msg.clientId && newRd.userMap[msg.clientId]) {
		realUserName = newRd.userMap[msg.clientId].userName || newRd.userMap[msg.clientId].username || newRd.userMap[msg.clientId].name;
	}

	const messageObj = {
		type: 'other',
		text: msg.data,
		userName: realUserName,
		avatar: realUserName,
		msgType: msgType,
		timestamp: Date.now()
	};

	// 单聊模式：私聊消息存储到对应用户的聊天记录
	if (isPrivateMessage && senderId) {
		addToPrivateChat(newRd, senderId, messageObj);
		
		// 如果当前不是和这个用户聊天，增加未读计数
		if (newRd.privateChatTargetId !== senderId) {
			if (!newRd.privateChats[senderId]) {
				newRd.privateChats[senderId] = { messages: [], unreadCount: 0 };
			}
			newRd.privateChats[senderId].unreadCount = (newRd.privateChats[senderId].unreadCount || 0) + 1;
		}
	} else {
		// 公共消息（群聊模式下使用）
		newRd.messages.push(messageObj);
	}

	// Only add message to chat display if it's for the active room and current chat target
	if (activeRoomIndex === idx) {
		// 单聊模式：只有当前正在和发送者聊天时才显示消息
		if (isPrivateMessage) {
			if (newRd.privateChatTargetId === senderId) {
				if (window.addOtherMsg) {
					window.addOtherMsg(msg.data, realUserName, realUserName, false, msgType);
				}
			}
			// 更新用户列表以显示未读消息
			renderUserList(false);
		} else {
			if (window.addOtherMsg) {
				window.addOtherMsg(msg.data, realUserName, realUserName, false, msgType);
			}
		}
	} else {
		roomsData[idx].unreadCount = (roomsData[idx].unreadCount || 0) + 1;
		renderRooms(activeRoomIndex);
	}

	const notificationMsgType = msgType.includes('_private') ? `private ${msgType.split('_')[0]}` : msgType;
	if (window.notifyMessage) {
		window.notifyMessage(newRd.roomName, notificationMsgType, msg.data, realUserName);
	}
}

// 添加消息到私聊记录
function addToPrivateChat(rd, oderId, messageObj) {
	if (!rd.privateChats[oderId]) {
		rd.privateChats[oderId] = { messages: [], unreadCount: 0 };
	}
	rd.privateChats[oderId].messages.push(messageObj);
}

// Toggle private chat with a user
// 切换与某用户的私聊（单聊模式）
export function togglePrivateChat(targetId, targetName) {
	const rd = roomsData[activeRoomIndex];
	if (!rd) return;
	
	const previousTarget = rd.privateChatTargetId;
	
	if (rd.privateChatTargetId === targetId) {
		// 再次点击同一用户，取消私聊模式
		rd.privateChatTargetId = null;
		rd.privateChatTargetName = null;
	} else {
		// 切换到新用户
		rd.privateChatTargetId = targetId;
		rd.privateChatTargetName = targetName;
		
		// 清除该用户的未读计数
		if (rd.privateChats[targetId]) {
			rd.privateChats[targetId].unreadCount = 0;
		}
	}
	
	// 重新渲染聊天区域以显示对应的聊天记录
	renderChatArea();
	renderUserList();
	updateChatInputStyle();
}


// Exit the current room
// 退出当前房间
export function exitRoom() {
	if (activeRoomIndex >= 0 && roomsData[activeRoomIndex]) {
		const chatInst = roomsData[activeRoomIndex].chat;
		if (chatInst && typeof chatInst.destruct === 'function') {
			chatInst.destruct()
		} else if (chatInst && typeof chatInst.disconnect === 'function') {
			chatInst.disconnect()
		}
		roomsData[activeRoomIndex].chat = null;
		roomsData.splice(activeRoomIndex, 1);
		if (roomsData.length > 0) {
			switchRoom(0);
			return true
		} else {
			return false
		}
	}
	return false
}

// 保存发送的消息到私聊记录（供 main.js 调用）
export function saveMyMessageToPrivateChat(targetId, messageObj) {
	const rd = roomsData[activeRoomIndex];
	if (!rd || !targetId) return;
	
	if (!rd.privateChats[targetId]) {
		rd.privateChats[targetId] = { messages: [], unreadCount: 0 };
	}
	
	rd.privateChats[targetId].messages.push({
		type: 'me',
		text: messageObj.text,
		msgType: messageObj.msgType,
		timestamp: messageObj.timestamp || Date.now()
	});
}

export { roomsData, activeRoomIndex };

// Listen for sidebar username update event
// 监听侧边栏用户名更新事件
window.addEventListener('updateSidebarUsername', () => {
	if (activeRoomIndex >= 0 && roomsData[activeRoomIndex]) {
		const rd = roomsData[activeRoomIndex];
		const sidebarUsername = document.getElementById('sidebar-username');
		if (sidebarUsername && rd.myUserName) {
			sidebarUsername.textContent = rd.myUserName;
		}
		// Also update the avatar to ensure consistency
		if (rd.myUserName) {
			setSidebarAvatar(rd.myUserName);
		}
	}
});