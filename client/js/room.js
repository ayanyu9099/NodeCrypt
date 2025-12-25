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
import {
	handleTypingStatus
} from './util.typing.js';
import {
	handleReadReceipt,
	handleRecallMessage
} from './util.message.js';
import {
	setConnectionStatus
} from './util.connection.js';

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
	newRd.joinTime = Date.now();  // 记录加入时间，用于用户名唯一性检查
	roomsData.push(newRd);
	const idx = roomsData.length - 1;
	switchRoom(idx);
	const sidebarUsername = $id('sidebar-username');
	if (sidebarUsername) sidebarUsername.textContent = userName;
	setSidebarAvatar(userName);
	
	// 显示用户角色标识
	updateRoleBadge(userRole);
	
	// 设置连接状态为连接中
	setConnectionStatus('connecting');
	
	let closed = false;
	const callbacks = {
		onServerClosed: () => {
			console.log('Node connection closed');
			setConnectionStatus('disconnected');
			// 不要在连接关闭时移除房间数据，保留以便重连
			// Don't remove room data on connection close, keep it for reconnection
			// 只有在首次连接失败时才通知失败
			if (onResult && !closed) {
				closed = true;
				onResult(false)
			}
		},
		onServerSecured: () => {
			setConnectionStatus('connected');
			
			// 更新 joinTime，用于重复用户名检测（重连时也会更新）
			// Update joinTime for duplicate username detection (also updated on reconnect)
			if (roomsData[idx]) {
				roomsData[idx].joinTime = Date.now();
			}
			
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
	
	console.log('[Room] handleClientList called, list:', list.length, 'selfId:', selfId,
		'raw list:', list.map(u => ({ id: u.clientId?.substring(0, 8), name: u.userName || u.username, role: u.role })));
	
	const oldUserIds = new Set((rd.userList || []).map(u => u.clientId));
	const newUserIds = new Set(list.map(u => u.clientId));
	
	// 处理离开的用户
	// Handle users who left
	for (const oldId of oldUserIds) {
		if (!newUserIds.has(oldId)) {
			handleClientLeft(idx, oldId)
		}
	}
	
	// 标准化用户对象属性名，确保 userName 和 role 正确设置
	// Normalize user object properties, ensure userName and role are set correctly
	const newUserList = list.map(u => ({
		clientId: u.clientId,
		userName: u.userName || u.username || u.name || '',
		username: u.userName || u.username || u.name || '',
		role: u.role || 'user'
	}));
	
	console.log('[Room] New user list:', newUserList.map(u => ({ id: u.clientId, name: u.userName, role: u.role })));
	
	rd.userList = newUserList;
	rd.userMap = {};
	rd.userList.forEach(u => {
		rd.userMap[u.clientId] = u
	});
	
	// 如果传入了 selfId 则使用，否则尝试通过用户名匹配找到自己
	// If selfId is provided use it, otherwise try to find self by username match
	if (selfId) {
		rd.myId = selfId;
	} else if (!rd.myId && rd.myUserName) {
		// 尝试通过用户名找到自己的 clientId
		const me = rd.userList.find(u => u.userName === rd.myUserName);
		if (me) {
			rd.myId = me.clientId;
		}
	}
	
	// 存储自己的 clientId 到 IP 的映射（用于 IP 禁言功能）
	// 每个用户只存储自己的映射，管理员通过查询获取
	if (selfId && !rd.ipMappingStored) {
		rd.ipMappingStored = true;
		fetch('/api/client-ip/set', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ clientId: selfId })
		})
		.then(res => res.json())
		.then(data => console.log('My IP mapping stored:', selfId, '-> IP:', data.ip))
		.catch(e => console.error('Failed to store client IP mapping:', e));
	}
	
	// 检查并修复 privateChatTargetId（重连后 clientId 可能变化）
	// 只对管理员角色自动恢复，防止普通用户冒名顶替
	// Check and fix privateChatTargetId (clientId may change after reconnect)
	// Only auto-restore for admin role to prevent impersonation
	if (rd.privateChatTargetName) {
		// 尝试通过用户名找到目标用户
		const targetByName = rd.userList.find(u => {
			const uName = u.userName || u.username || '';
			return uName === rd.privateChatTargetName;
		});
		
		if (targetByName) {
			// 只有目标是管理员时才自动恢复
			// Only auto-restore if target is admin
			if (targetByName.role === 'admin') {
				// 目标管理员在线，检查是否需要更新 clientId
				if (rd.privateChatTargetId !== targetByName.clientId) {
					const oldId = rd.privateChatTargetId;
					console.log('[Room] Fixing privateChatTargetId for admin after reconnect:', 
						oldId, '->', targetByName.clientId);
					// 迁移聊天记录到新的 clientId
					if (oldId && rd.privateChats[oldId]) {
						rd.privateChats[targetByName.clientId] = rd.privateChats[oldId];
						delete rd.privateChats[oldId];
					}
					rd.privateChatTargetId = targetByName.clientId;
					
					// 重新渲染聊天区域和输入框，恢复私聊状态
					if (activeRoomIndex === idx) {
						renderChatArea();
						updateChatInputStyle();
					}
				}
			} else {
				// 目标是普通用户，不自动恢复，清除状态
				// Target is regular user, don't auto-restore, clear state
				console.log('[Room] Target is regular user, not auto-restoring:', rd.privateChatTargetName);
				rd.privateChatTargetId = null;
				rd.privateChatTargetName = null;
				if (activeRoomIndex === idx) {
					renderChatArea();
					updateChatInputStyle();
				}
			}
		} else {
			// 目标用户不在线
			// Target user offline
			console.log('[Room] Private chat target not online yet:', rd.privateChatTargetName);
		}
	}
	
	if (activeRoomIndex === idx) {
		renderUserList(false);
		renderMainHeader()
	}
	rd.initCount = (rd.initCount || 0) + 1;
	if (rd.initCount === 2) {
		rd.isInitialized = true;
		rd.knownUserIds = new Set(list.map(u => u.clientId));
	}
	
	// 普通用户自动打开与管理员的聊天（首次连接或重连后）
	// Auto open chat with admin for regular users (first connect or after reconnect)
	if (rd.isInitialized && rd.myRole !== 'admin' && !rd.privateChatTargetId) {
		const firstAdmin = rd.userList.find(u => u.role === 'admin');
		if (firstAdmin) {
			console.log('[Room] Auto opening chat with admin:', firstAdmin.userName);
			togglePrivateChat(firstAdmin.clientId, firstAdmin.userName || firstAdmin.username);
		}
	}
}

// Handle client secured event
// 处理客户端安全连接事件
export function handleClientSecured(idx, user) {
	const rd = roomsData[idx];
	if (!rd) return;
	
	// 标准化用户对象属性名
	// Normalize user object properties
	const normalizedUser = {
		clientId: user.clientId,
		userName: user.userName || user.username || user.name || '',
		username: user.userName || user.username || user.name || '',
		role: user.role || 'user'
	};
	
	// 检查用户名是否与自己相同（用户名唯一性检查）
	// Check if username is same as mine (username uniqueness check)
	if (normalizedUser.userName && normalizedUser.userName === rd.myUserName && normalizedUser.clientId !== rd.myId) {
		// 角色优先级：管理员 > 普通用户
		// Role priority: admin > user
		const myRole = rd.myRole || 'user';
		const otherRole = normalizedUser.role || 'user';
		
		console.log('[Room] Duplicate username detected:', normalizedUser.userName, 
			'myRole:', myRole, 'otherRole:', otherRole,
			'myJoinTime:', rd.joinTime, 'duplicateHandled:', rd.duplicateHandled);
		
		// 决定谁应该被踢出：
		// 1. 如果我是管理员，对方是普通用户 -> 不踢出自己（对方会被踢出）
		// 2. 如果我是普通用户，对方是管理员 -> 踢出自己
		// 3. 如果角色相同 -> 后加入者被踢出（比较 joinTime）
		// Decide who should be kicked:
		// 1. If I'm admin and other is user -> don't kick self (other will be kicked)
		// 2. If I'm user and other is admin -> kick self
		// 3. If same role -> later joiner gets kicked (compare joinTime)
		
		let shouldKickSelf = false;
		
		if (myRole === 'admin' && otherRole !== 'admin') {
			// 我是管理员，对方是普通用户，不踢出自己
			console.log('[Room] I am admin, other is user, not kicking self');
			shouldKickSelf = false;
		} else if (myRole !== 'admin' && otherRole === 'admin') {
			// 我是普通用户，对方是管理员，踢出自己
			console.log('[Room] I am user, other is admin, kicking self');
			shouldKickSelf = true;
		} else {
			// 角色相同时，需要确定谁是后来者
			// 由于无法获取对方的 joinTime，使用以下策略：
			// - 如果我的 joinTime 在最近 10 秒内，说明我可能是重连的，应该踢出自己
			// - 否则，假设对方是后来者，不踢出自己
			// When roles are same, need to determine who joined later
			// Since we can't get other's joinTime, use this strategy:
			// - If my joinTime is within last 10 seconds, I might be reconnecting, kick self
			// - Otherwise, assume other is later joiner, don't kick self
			const timeSinceJoin = Date.now() - (rd.joinTime || 0);
			const isRecentJoin = timeSinceJoin < 10000; // 10 秒内
			
			// 如果我是最近加入的（可能是重连），而对方已经在线，我应该退出
			// If I joined recently (might be reconnecting) and other is already online, I should exit
			if (isRecentJoin) {
				console.log('[Room] I joined recently, might be duplicate, kicking self');
				shouldKickSelf = true;
			} else {
				// 我已经在线很久了，对方是后来者，不踢出自己
				console.log('[Room] I have been online for a while, other is later joiner');
				shouldKickSelf = false;
			}
		}
		
		if (shouldKickSelf && !rd.duplicateHandled) {
			// 标记已处理，避免重复处理
			rd.duplicateHandled = true;
			
			console.log('[Room] Kicking duplicate user...');
			
			// 断开连接并提示
			if (rd.chat) {
				rd.chat.destruct();
			}
			// 从房间列表中移除
			const roomIdx = roomsData.findIndex(r => r === rd);
			if (roomIdx !== -1) {
				roomsData.splice(roomIdx, 1);
			}
			// 显示登录界面
			const loginContainer = $id('login-container');
			if (loginContainer) loginContainer.style.display = '';
			const chatContainer = $id('chat-container');
			if (chatContainer) chatContainer.style.display = 'none';
			
			// 重置登录按钮状态
			// Reset login button state
			const loginBtn = document.querySelector('#login-form .login-btn');
			if (loginBtn) {
				loginBtn.disabled = false;
				loginBtn.textContent = t('ui.enter', '加入房间');
			}
			
			// 提示用户
			const message = (myRole !== 'admin' && otherRole === 'admin') 
				? t('ui.username_taken_by_admin', '管理员使用了此用户名，您已被踢出房间')
				: t('ui.username_taken', '此用户名已在房间中使用，请更换用户名');
			alert(message);
			return;
		}
	}
	
	rd.userMap[normalizedUser.clientId] = normalizedUser;
	const existingUserIndex = rd.userList.findIndex(u => u.clientId === normalizedUser.clientId);
	if (existingUserIndex === -1) {
		rd.userList.push(normalizedUser)
	} else {
		rd.userList[existingUserIndex] = normalizedUser
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
		rd.knownUserIds.add(user.clientId);
		
		// 只有管理员才显示用户加入提示
		// Only admin can see user join notification
		if (rd.myRole === 'admin') {
			const name = user.userName || user.username || user.name || t('ui.anonymous', 'Anonymous');
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
		
		// 普通用户：当管理员上线时，自动打开与该管理员的聊天
		// Regular user: auto open chat with admin when admin comes online
		if (rd.myRole !== 'admin' && normalizedUser.role === 'admin' && !rd.privateChatTargetId) {
			togglePrivateChat(normalizedUser.clientId, normalizedUser.userName || normalizedUser.username);
		}
	}
	
	// 检查是否需要恢复与该用户的私聊（重连后 clientId 变化的情况）
	// 只对管理员角色自动恢复，防止普通用户冒名顶替
	// Check if we need to restore private chat with this user (clientId changed after reconnect)
	// Only auto-restore for admin role to prevent impersonation by regular users
	if (rd.privateChatTargetName && normalizedUser.userName === rd.privateChatTargetName && normalizedUser.role === 'admin') {
		// 目标管理员重新上线，恢复私聊
		// Target admin came back online, restore private chat
		if (!rd.privateChatTargetId || rd.privateChatTargetId !== normalizedUser.clientId) {
			console.log('[Room] Restoring private chat with admin after reconnect:', 
				rd.privateChatTargetId, '->', normalizedUser.clientId);
			const oldId = rd.privateChatTargetId;
			// 迁移聊天记录到新的 clientId
			if (oldId && rd.privateChats[oldId]) {
				rd.privateChats[normalizedUser.clientId] = rd.privateChats[oldId];
				delete rd.privateChats[oldId];
			}
			rd.privateChatTargetId = normalizedUser.clientId;
			
			// 重新渲染聊天区域和输入框
			if (activeRoomIndex === idx) {
				renderChatArea();
				updateChatInputStyle();
			}
		}
	}
}

// Handle client left event
// 处理客户端离开事件
export function handleClientLeft(idx, clientId) {
	const rd = roomsData[idx];
	if (!rd) return;
	
	const leavingUser = rd.userMap[clientId];
	
	if (rd.privateChatTargetId === clientId) {
		// 只有当目标是管理员时才保留 privateChatTargetName 用于自动恢复
		// 普通用户离开后清除私聊状态，防止冒名顶替
		// Only keep privateChatTargetName for auto-restore if target is admin
		// Clear private chat state for regular users to prevent impersonation
		if (leavingUser && leavingUser.role === 'admin') {
			// 管理员离开，保留名字以便重连恢复
			rd.privateChatTargetId = null;
			console.log('[Room] Admin left, keeping privateChatTargetName for reconnect:', rd.privateChatTargetName);
		} else {
			// 普通用户离开，清除所有私聊状态
			rd.privateChatTargetId = null;
			rd.privateChatTargetName = null;
			console.log('[Room] Regular user left, clearing private chat state');
		}
		
		if (activeRoomIndex === idx) {
			renderChatArea();
			updateChatInputStyle();
		}
	}
	const user = rd.userMap[clientId];
	
	// 只有管理员才显示用户离开提示
	// Only admin can see user left notification
	if (rd.myRole === 'admin') {
		const name = user ? (user.userName || user.username || user.name || 'Anonymous') : 'Anonymous';
		const msg = `${name} ${t('system.left', 'left the conversation')}`;
		rd.messages.push({
			type: 'system',
			text: msg
		});
		if (activeRoomIndex === idx) addSystemMsg(msg, true);
	}
	
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
	
	// 处理正在输入状态
	// Handle typing status
	if (msgType === 'typing') {
		const senderUser = newRd.userMap[senderId];
		const senderName = senderUser ? (senderUser.userName || senderUser.username || senderUser.name) : null;
		handleTypingStatus(senderId, senderName || t('ui.anonymous', 'Anonymous'), msg.data?.typing);
		return;
	}
	
	// 处理已读回执
	// Handle read receipt
	if (msgType === 'read_receipt') {
		handleReadReceipt(senderId, msg.data?.messageIds || []);
		return;
	}
	
	// 处理消息撤回
	// Handle message recall
	if (msgType === 'recall') {
		handleRecallMessage(senderId, msg.data?.messageId);
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
	
	console.log('[Room] togglePrivateChat called - targetId:', targetId, 'targetName:', targetName,
		'current privateChatTargetId:', rd.privateChatTargetId);
	
	// 验证目标用户是否在当前用户列表中
	const targetUser = rd.userList?.find(u => u.clientId === targetId);
	if (!targetUser) {
		console.warn('[Room] Target user not found in userList, trying to find by name:', targetName);
		// 尝试通过用户名找到用户
		const userByName = rd.userList?.find(u => (u.userName || u.username) === targetName);
		if (userByName) {
			console.log('[Room] Found user by name, updating targetId:', userByName.clientId);
			targetId = userByName.clientId;
		} else {
			console.warn('[Room] User not found by name either, userList:', 
				rd.userList?.map(u => ({ id: u.clientId?.substring(0, 8), name: u.userName })));
		}
	}
	
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