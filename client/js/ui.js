// UI logic for NodeCrypt web client
// NodeCrypt 网页客户端的 UI 逻辑

import {
	createAvatarSVG
} from './util.avatar.js';
import {
	roomsData,
	activeRoomIndex,
	togglePrivateChat,
	exitRoom
} from './room.js';
import {
	escapeHTML
} from './util.string.js';
import {
	$id
} from './util.dom.js';
import {
	closeSettingsPanel
} from './util.settings.js';
import {
	t
} from './util.i18n.js';
import {
	updateChatInputStyle
} from './chat.js';
import {
	getAvailableRooms,
	validateRoomAccess,
	USER_ROLES
} from './config.rooms.js';
import {
	showAdminMenu,
	isCurrentUserAdmin,
	renderAdminToolbar,
	initAdminToolbar,
	sendAnnouncement,
	clearChatHistory
} from './util.admin.js';

// Utility functions for security and error handling
// 安全和错误处理工具函数

// Simple encryption/decryption using base64 and character shifting
// 使用base64和字符偏移的简单加密/解密
function simpleEncrypt(text) {
	if (!text) return '';
	// Convert to base64 and shift characters
	const base64 = btoa(unescape(encodeURIComponent(text)));
	return base64.split('').map(char => {
		const code = char.charCodeAt(0);
		return String.fromCharCode(code + 3);
	}).join('');
}

function simpleDecrypt(encrypted) {
	if (!encrypted) return '';
	try {
		// Reverse character shifting and decode base64
		const shifted = encrypted.split('').map(char => {
			const code = char.charCodeAt(0);
			return String.fromCharCode(code - 3);
		}).join('');
		return decodeURIComponent(escape(atob(shifted)));
	} catch (error) {
		console.warn('Failed to decrypt data:', error);
		return '';
	}
}

// Validate room data
// 验证房间数据
function validateRoomData(roomData) {
	if (!roomData) {
		return { valid: false, error: 'No room data available' };
	}
	if (!roomData.roomName || roomData.roomName.trim() === '') {
		return { valid: false, error: 'Room name is required' };
	}
	return { valid: true };
}

// Copy text to clipboard with fallback
// 复制文本到剪贴板（含降级处理）
function copyToClipboard(text, successMessage = t('action.copied', 'Copied to clipboard!'), errorPrefix = t('action.copy_failed', 'Copy failed, url:')) {
	if (!text) {
		window.addSystemMsg && window.addSystemMsg(t('action.nothing_to_copy', 'Nothing to copy'));
		return;
	}

	if (navigator.clipboard && navigator.clipboard.writeText) {
		navigator.clipboard.writeText(text).then(() => {
			window.addSystemMsg && window.addSystemMsg(successMessage);
		}).catch((error) => {
			console.error('Clipboard write failed:', error);
			showFallbackCopy(text, errorPrefix);
		});
	} else {
		showFallbackCopy(text, errorPrefix);
	}
}

// Show fallback copy method
// 显示降级复制方法
function showFallbackCopy(text, prefix) {
	if (typeof prompt === 'function') {
		prompt(prefix, text);
	} else {
		// For environments where prompt is not available
		window.addSystemMsg && window.addSystemMsg(t('action.copy_not_supported', 'Copy not supported in this environment'));
	}
}

// Execute menu action with error handling
// 执行菜单操作并处理错误
function executeMenuAction(action, closeMenuCallback) {
	try {
		switch (action) {
			case 'share':
				handleShareAction();
				break;
			case 'exit':
				handleExitAction();
				break;
			default:
				console.warn('Unknown menu action:', action);
		}
	} catch (error) {
		console.error('Menu action failed:', error);
		window.addSystemMsg && window.addSystemMsg(t('action.action_failed', 'Action failed. Please try again.'));
	} finally {
		closeMenuCallback && closeMenuCallback();
	}
}

// Handle share action
// 处理分享操作
function handleShareAction() {
	const validation = validateRoomData(roomsData[activeRoomIndex]);
	if (!validation.valid) {
		window.addSystemMsg && window.addSystemMsg(`${t('action.cannot_share', 'Cannot share:')} ${validation.error}`);
		return;
	}

	const rd = roomsData[activeRoomIndex];
	const roomName = rd.roomName.trim();
	const password = rd.password || '';
	
	// Encrypt room name and password
	const encryptedRoom = simpleEncrypt(roomName);
	const encryptedPwd = password ? simpleEncrypt(password) : '';
	
	// Create share URL with encrypted data
	let url = `${location.origin}${location.pathname}?r=${encodeURIComponent(encryptedRoom)}`;
	if (encryptedPwd) {
		url += `&p=${encodeURIComponent(encryptedPwd)}`;
	}
	
	copyToClipboard(url, t('action.share_copied', 'Share link copied!'), t('action.copy_url_failed', 'Copy failed, url:'));
}

// Handle exit action
// 处理退出操作
function handleExitAction() {
	try {
		const result = exitRoom();
		if (!result) {
			location.reload();
		}
	} catch (error) {
		console.error('Exit room failed:', error);
		// Force reload as fallback
		location.reload();
	}
}

// Render the main header
// 渲染主标题栏
export function renderMainHeader() {
	const rd = roomsData[activeRoomIndex];
	let roomName = rd ? rd.roomName : 'Room';
	let onlineCount = rd && rd.userList ? rd.userList.length : 0;
	if (rd && !rd.userList.some(u => u.clientId === rd.myId)) {
		onlineCount += 1
	}
	const safeRoomName = escapeHTML(roomName);
	
	// 管理员工具栏
	const adminToolbarHtml = isCurrentUserAdmin() ? `
		<div class="admin-toolbar">
			<button class="admin-btn" id="admin-announce-btn" title="${t('admin.send_announcement', '发送公告')}">📢</button>
			<button class="admin-btn" id="admin-clear-btn" title="${t('admin.clear_chat', '清空聊天')}">🗑️</button>
		</div>
	` : '';
	
	$id("main-header").innerHTML = `<button class="mobile-menu-btn"id="mobile-menu-btn"aria-label="Open Sidebar"><svg width="35px"height="35px"viewBox="0 0 24 24"fill="none"xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier"stroke-width="0"></g><g id="SVGRepo_tracerCarrier"stroke-linecap="round"stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path fill-rule="evenodd"clip-rule="evenodd"d="M21.4498 10.275L11.9998 3.1875L2.5498 10.275L2.9998 11.625H3.7498V20.25H20.2498V11.625H20.9998L21.4498 10.275ZM5.2498 18.75V10.125L11.9998 5.0625L18.7498 10.125V18.75H14.9999V14.3333L14.2499 13.5833H9.74988L8.99988 14.3333V18.75H5.2498ZM10.4999 18.75H13.4999V15.0833H10.4999V18.75Z"fill="#808080"></path></g></svg></button><div class="main-header-center"id="main-header-center"><div class="main-header-flex"><div class="group-title group-title-bold">#${safeRoomName}</div><span class="main-header-members">${onlineCount} ${t('ui.members', 'members')}</span></div></div>${adminToolbarHtml}<div class="main-header-actions"><button class="more-btn"id="more-btn"aria-label="More Options"><svg width="35px"height="35px"viewBox="0 0 24 24"fill="none"xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier"stroke-width="0"></g><g id="SVGRepo_tracerCarrier"stroke-linecap="round"stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><circle cx="12"cy="6"r="1.5"fill="#808080"></circle><circle cx="12"cy="12"r="1.5"fill="#808080"></circle><circle cx="12"cy="18"r="1.5"fill="#808080"></circle></g></svg></button><button class="mobile-info-btn"id="mobile-info-btn"aria-label="Open Members"><svg width="35px"height="35px"viewBox="0 0 24 24"fill="none"xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier"stroke-width="0"></g><g id="SVGRepo_tracerCarrier"stroke-linecap="round"stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path fill-rule="evenodd"clip-rule="evenodd"d="M16.0603 18.307C14.89 19.0619 13.4962 19.5 12 19.5C10.5038 19.5 9.10996 19.0619 7.93972 18.307C8.66519 16.7938 10.2115 15.75 12 15.75C13.7886 15.75 15.3349 16.794 16.0603 18.307ZM17.2545 17.3516C16.2326 15.5027 14.2632 14.25 12 14.25C9.73663 14.25 7.76733 15.5029 6.74545 17.3516C5.3596 15.9907 4.5 14.0958 4.5 12C4.5 7.85786 7.85786 4.5 12 4.5C16.1421 4.5 19.5 7.85786 19.5 12C19.5 14.0958 18.6404 15.9908 17.2545 17.3516ZM21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12ZM12 12C13.2426 12 14.25 10.9926 14.25 9.75C14.25 8.50736 13.2426 7.5 12 7.5C10.7574 7.5 9.75 8.50736 9.75 9.75C9.75 10.9926 10.7574 12 12 12ZM12 13.5C14.0711 13.5 15.75 11.8211 15.75 9.75C15.75 7.67893 14.0711 6 12 6C9.92893 6 8.25 7.67893 8.25 9.75C8.25 11.8211 9.92893 13.5 12 13.5Z"fill="#808080"></path></g></svg></button><div class="more-menu"id="more-menu"><div class="more-menu-item"data-action="share">${t('action.share', 'Share')}</div><div class="more-menu-item"data-action="exit">${t('action.exit', 'Quit')}</div></div></div>`;
	setupMoreBtnMenu();
	setupMobileUIHandlers();
	
	// 初始化管理员工具栏事件
	if (isCurrentUserAdmin()) {
		setupAdminToolbarEvents();
	}
}

// 设置管理员工具栏事件
function setupAdminToolbarEvents() {
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

// Setup mobile UI event handlers
// 设置移动端 UI 事件处理
export function setupMobileUIHandlers() {
	const sidebar = document.getElementById('sidebar');
	const rightbar = document.getElementById('rightbar');
	const settingsSidebar = document.getElementById('settings-sidebar');
	const mobileMenuBtn = document.getElementById('mobile-menu-btn');
	const mobileInfoBtn = document.getElementById('mobile-info-btn');
	const sidebarMask = document.getElementById('mobile-sidebar-mask');
	const rightbarMask = document.getElementById('mobile-rightbar-mask');

	function isMobile() {
		return window.innerWidth <= 768
	}

	function updateMobileBtnDisplay() {
		if (isMobile()) {
			if (mobileMenuBtn) mobileMenuBtn.style.display = 'flex';
			if (mobileInfoBtn) mobileInfoBtn.style.display = 'flex'
		} else {
			if (mobileMenuBtn) mobileMenuBtn.style.display = 'none';
			if (mobileInfoBtn) mobileInfoBtn.style.display = 'none';
			if (sidebar) sidebar.classList.remove('mobile-open');
			if (rightbar) rightbar.classList.remove('mobile-open');
			if (sidebarMask) sidebarMask.classList.remove('active');
			if (rightbarMask) rightbarMask.classList.remove('active')
		}
	}
	updateMobileBtnDisplay();
	window.addEventListener('resize', updateMobileBtnDisplay);
	if (mobileMenuBtn && sidebar && sidebarMask) {
		mobileMenuBtn.onclick = function(e) {
			e.stopPropagation();
			sidebar.classList.add('mobile-open');
			sidebarMask.classList.add('active')
		};		sidebarMask.onclick = function() {
			// Check if settings sidebar is open
			if (settingsSidebar && settingsSidebar.classList.contains('mobile-open')) {
				closeSettingsPanel();
			} else {
				sidebar.classList.remove('mobile-open');
				sidebarMask.classList.remove('active');
			}
		}
	}
	if (mobileInfoBtn && rightbar && rightbarMask) {
		mobileInfoBtn.onclick = function(e) {
			e.stopPropagation();
			rightbar.classList.add('mobile-open');
			rightbarMask.classList.add('active')
		};
		rightbarMask.onclick = function() {
			rightbar.classList.remove('mobile-open');
			rightbarMask.classList.remove('active')
		}
	}	// Consolidated click event listener for closing sidebars
	document.addEventListener('click', function(ev) {
		const settingsBtn = $id('settings-btn');
		const isSettingsButtonClick = settingsBtn && settingsBtn.contains(ev.target);
		const isSettingsBackButtonClick = $id('settings-back-btn') && $id('settings-back-btn').contains(ev.target);

		// Close settings sidebar if open and click is outside (and not on the open button or back button)
		if (settingsSidebar && (settingsSidebar.classList.contains('open') || settingsSidebar.classList.contains('mobile-open'))) {
			if (!settingsSidebar.contains(ev.target) && !isSettingsButtonClick && !isSettingsBackButtonClick) {
				closeSettingsPanel();
			}
		}

		if (isMobile()) {
			// Mobile-specific logic
			if (sidebar && sidebar.classList.contains('mobile-open')) {
				if (!sidebar.contains(ev.target) && ev.target !== mobileMenuBtn) {
					sidebar.classList.remove('mobile-open');
					if (sidebarMask) sidebarMask.classList.remove('active');
				}
			}
			if (settingsSidebar && settingsSidebar.classList.contains('mobile-open')) {
				// 检查点击目标是否为设置按钮本身
				const isSettingsButton = settingsBtn && settingsBtn.contains(ev.target);
				if (!settingsSidebar.contains(ev.target) && !isSettingsButton) {
					closeSettingsPanel();
				}
			}
			if (rightbar && rightbar.classList.contains('mobile-open')) {
				if (!rightbar.contains(ev.target) && ev.target !== mobileInfoBtn) {
					rightbar.classList.remove('mobile-open');
					if (rightbarMask) rightbarMask.classList.remove('active');
				}
			}
		} else {
			// Desktop-specific logic
			// 如果设置侧边栏打开，并且点击位置在侧边栏外部且不是设置按钮本身
			if (settingsSidebar && settingsSidebar.classList.contains('open')) {
				const isSettingsButton = settingsBtn && settingsBtn.contains(ev.target);
				if (!settingsSidebar.contains(ev.target) && !isSettingsButton) {
					closeSettingsPanel();
				}
			}
		}
	})
}

// Render the user/member list - 单聊模式
// 渲染用户/成员列表 - 类似微信的单聊列表
// 普通用户只能看到管理员，管理员能看到所有用户
export function renderUserList(updateHeader = false) {
	const userListEl = $id('member-list');
	if (!userListEl) return;
	userListEl.innerHTML = '';
	const rd = roomsData[activeRoomIndex];
	if (!rd) return;
	
	const me = rd.userList.find(u => u.clientId === rd.myId);
	const myRole = rd.myRole || 'user';
	
	// 根据角色过滤用户列表
	// 管理员可以看到所有用户，普通用户只能看到管理员
	let others = rd.userList.filter(u => u.clientId !== rd.myId);
	
	if (myRole !== 'admin') {
		// 普通用户只能看到管理员
		others = others.filter(u => u.role === 'admin');
	}
	
	// 显示在线用户数量
	const onlineCount = others.length;
	const headerTip = document.createElement('div');
	headerTip.className = 'member-tip';
	
	if (myRole === 'admin') {
		headerTip.innerHTML = `<span>${t('ui.online_users', '在线用户')}: <strong>${onlineCount}</strong></span>`;
	} else {
		headerTip.innerHTML = `<span>${t('ui.online_admins', '在线客服')}: <strong>${onlineCount}</strong></span>`;
	}
	userListEl.appendChild(headerTip);
	
	if (others.length === 0) {
		// 没有可见用户时显示提示
		const emptyTip = document.createElement('div');
		emptyTip.className = 'member-tip member-tip-center';
		emptyTip.style.padding = '40px 20px';
		emptyTip.style.color = '#999';
		if (myRole === 'admin') {
			emptyTip.textContent = t('ui.no_other_users', '暂无其他用户在线');
		} else {
			emptyTip.textContent = t('ui.no_admin_online', '暂无客服在线，请稍后再试');
		}
		userListEl.appendChild(emptyTip);
	} else {
		// 渲染用户列表（单聊模式）
		others.forEach(u => {
			const chatItem = createChatUserItem(u, rd);
			userListEl.appendChild(chatItem);
		});
	}
	
	// 底部显示自己
	if (me) {
		const divider = document.createElement('div');
		divider.className = 'member-divider';
		divider.innerHTML = `<span>${t('ui.me_section', '我')}</span>`;
		userListEl.appendChild(divider);
		userListEl.appendChild(createUserItem(me, true, myRole));
	}
	
	if (updateHeader) {
		renderMainHeader()
	}
}

// 创建单聊用户项（类似微信聊天列表）
function createChatUserItem(user, rd) {
	const div = document.createElement('div');
	const isActive = user.clientId === rd.privateChatTargetId;
	div.className = 'chat-user-item' + (isActive ? ' active' : '');
	
	const rawName = user.userName || user.username || user.name || '';
	const safeUserName = escapeHTML(rawName);
	
	// 获取该用户的私聊记录
	const privateChat = rd.privateChats[user.clientId] || { messages: [], unreadCount: 0 };
	const lastMessage = privateChat.messages[privateChat.messages.length - 1];
	const unreadCount = privateChat.unreadCount || 0;
	
	// 最后消息预览
	let previewText = t('ui.no_messages', '暂无消息');
	let timeText = '';
	
	if (lastMessage) {
		if (lastMessage.msgType === 'image' || lastMessage.msgType === 'image_private') {
			previewText = '[' + t('ui.image', '图片') + ']';
		} else if (lastMessage.msgType === 'file' || lastMessage.msgType === 'file_private') {
			previewText = '[' + t('ui.file', '文件') + ']';
		} else {
			previewText = typeof lastMessage.text === 'string' 
				? lastMessage.text.substring(0, 30) + (lastMessage.text.length > 30 ? '...' : '')
				: '';
		}
		
		// 格式化时间
		if (lastMessage.timestamp) {
			const date = new Date(lastMessage.timestamp);
			const now = new Date();
			if (date.toDateString() === now.toDateString()) {
				timeText = date.getHours().toString().padStart(2, '0') + ':' + 
						   date.getMinutes().toString().padStart(2, '0');
			} else {
				timeText = (date.getMonth() + 1) + '/' + date.getDate();
			}
		}
	}
	
	// 用户角色标识
	const userRole = user.role || 'user';
	const isAdmin = userRole === 'admin';
	const roleTag = isAdmin ? `<span class="user-role-tag admin">${t('ui.admin', '管理员')}</span>` : '';
	
	div.innerHTML = `
		<div class="user-avatar-wrapper">
			<span class="user-avatar"></span>
			<span class="online-indicator"></span>
		</div>
		<div class="user-info">
			<div class="user-name">${safeUserName}${roleTag}</div>
			<div class="user-preview">${escapeHTML(previewText)}</div>
		</div>
		<div class="user-meta">
			${timeText ? `<span class="user-time">${timeText}</span>` : ''}
			${unreadCount > 0 ? `<span class="unread-badge">${unreadCount > 99 ? '99+' : unreadCount}</span>` : ''}
		</div>
	`;
	
	// 设置头像
	const avatarEl = div.querySelector('.user-avatar');
	if (avatarEl) {
		const svg = createAvatarSVG(rawName);
		const cleanSvg = svg.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
		avatarEl.innerHTML = cleanSvg;
	}
	
	// 如果当前用户是管理员且目标不是管理员，添加管理按钮
	if (isCurrentUserAdmin() && userRole !== 'admin') {
		const adminBtn = document.createElement('button');
		adminBtn.className = 'admin-action-btn';
		adminBtn.innerHTML = '⚙️';
		adminBtn.title = t('admin.manage_user', '管理用户');
		adminBtn.onclick = (e) => {
			e.stopPropagation();
			showAdminMenu(user, e);
		};
		div.querySelector('.user-meta').appendChild(adminBtn);
	}
	
	// 点击开始/切换私聊
	div.onclick = () => {
		togglePrivateChat(user.clientId, safeUserName);
		// 清除未读计数
		if (rd.privateChats[user.clientId]) {
			rd.privateChats[user.clientId].unreadCount = 0;
		}
		renderUserList();
	};
	
	return div;
}

// Create a user list item
// 创建一个用户列表项
export function createUserItem(user, isMe) {
	const div = document.createElement('div');
	const rd = roomsData[activeRoomIndex];
	const isPrivateTarget = rd && user.clientId === rd.privateChatTargetId;
	div.className = 'member' + (isMe ? ' me' : '') + (isPrivateTarget ? ' private-chat-active' : '');
	const rawName = user.userName || user.username || user.name || '';
	const safeUserName = escapeHTML(rawName);
	div.innerHTML = `<span class="avatar"></span><div class="member-info"><div class="member-name">${safeUserName}${isMe?t('ui.me', ' (me)'):''}</div></div>`;
	const avatarEl = div.querySelector('.avatar');
	if (avatarEl) {
		const svg = createAvatarSVG(rawName);
		const cleanSvg = svg.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
		avatarEl.innerHTML = cleanSvg
	}
	if (!isMe) {
		div.onclick = () => togglePrivateChat(user.clientId, safeUserName)
	}
	return div
}

// Setup the 'more' button menu
// 设置"更多"按钮菜单
export function setupMoreBtnMenu() {
	const btn = $id('more-btn');
	const menu = $id('more-menu');
	if (!btn || !menu) return;
	let animating = false;

	// Open the menu
	// 打开菜单
	function openMenu() {
		menu.style.display = 'block';
		menu.classList.remove('close');
		// 强制触发重绘，然后添加打开动画
		menu.offsetHeight; // 强制重绘
		menu.classList.add('open');
	}

	// Close the menu
	// 关闭菜单
	function closeMenu() {
		if (animating) return;
		animating = true;
		menu.classList.remove('open');
		menu.classList.add('close');
		setTimeout(() => {
			if (menu.classList.contains('close')) menu.style.display = 'none';
			animating = false;
		}, 300);
	}

	btn.onclick = function(e) {
		e.stopPropagation();
		if (menu.classList.contains('open')) {
			closeMenu();
		} else {
			openMenu();
		}
	};

	menu.onclick = function(e) {
		if (e.target.classList.contains('more-menu-item')) {
			const action = e.target.dataset.action;
			executeMenuAction(action, closeMenu);
		}
	};

	document.addEventListener('click', function hideMenu(ev) {
		if (!menu.contains(ev.target) && ev.target !== btn) {
			closeMenu();
		}
	});

	menu.addEventListener('animationend', function(e) {
		animating = false;
	});

	menu.addEventListener('transitionend', function(e) {
		animating = false;
	});
}

// Prevent space and special character input
// 禁止输入空格和特殊字符
export function preventSpaceInput(input) {
	if (!input) return;
	input.addEventListener('keydown', function(e) {
		if (e.key === ' ' || (/[\u0000-\u007f]/.test(e.key) && /[\p{P}\p{S}]/u.test(e.key) && e.key !== "'")) {
			e.preventDefault()
		}
	});
	input.addEventListener('input', function(e) {
		input.value = input.value.replace(/[\s\p{P}\p{S}]/gu, function(match) {
			return match === "'" ? "'" : ''
		})
	})
}

// Login form submit handler
// 登录表单提交处理函数
export function loginFormHandler(modal) {
	return function(e) {
		e.preventDefault();
		const idPrefix = modal ? '-modal' : '';
		
		const userName = document.getElementById('userName' + idPrefix).value.trim();
		const roomName = document.getElementById('roomName' + idPrefix).value.trim();
		const password = document.getElementById('password' + idPrefix)?.value.trim() || '';
		const adminPassword = document.getElementById('adminPassword' + idPrefix)?.value.trim() || '';
		const btn = modal ? modal.querySelector('.login-btn') : document.querySelector('#login-form .login-btn');
		const roomInput = document.getElementById('roomName' + idPrefix);
		
		// 清除之前的错误提示
		clearFormErrors(idPrefix);
		
		// 验证房间访问权限
		const validation = validateRoomAccess(roomName, password, adminPassword);
		
		if (!validation.valid) {
			showFormError(roomInput, validation.error, idPrefix);
			if (btn) {
				btn.disabled = false;
				btn.innerText = t('ui.enter', 'ENTER');
			}
			return;
		}
		
		// 检查是否已经加入该房间
		const exists = roomsData.some(rd => rd.roomName && rd.roomName.toLowerCase() === roomName.toLowerCase());
		if (exists) {
			showFormError(roomInput, 'room_already_joined', idPrefix);
			if (btn) {
				btn.disabled = false;
				btn.innerText = t('ui.enter', 'ENTER');
			}
			return;
		}
		
		if (btn) {
			btn.disabled = true;
			btn.innerText = t('ui.connecting', 'Connecting...');
		}
		
		// 传递用户角色到 joinRoom
		window.joinRoom(userName, roomName, password, modal, function(success) {
			if (!success && btn) {
				btn.disabled = false;
				btn.innerText = t('ui.enter', 'ENTER');
			}
		}, validation.role);
	}
}

// 清除表单错误
function clearFormErrors(idPrefix) {
	const roomInput = document.getElementById('roomName' + idPrefix);
	const passwordInput = document.getElementById('password' + idPrefix);
	
	[roomInput, passwordInput].forEach(input => {
		if (input) {
			input.style.border = '';
			input.style.background = '';
			if (input._warnTip) {
				input._warnTip.remove();
				input._warnTip = null;
			}
		}
	});
}

// 显示表单错误
function showFormError(input, errorType, idPrefix) {
	if (!input) return;
	
	const errorMessages = {
		'room_not_found': t('ui.room_not_found', '房间不存在'),
		'wrong_password': t('ui.wrong_password', '密码错误'),
		'room_already_joined': t('ui.room_already_joined', '已加入该房间')
	};
	
	const targetInput = errorType === 'wrong_password' 
		? document.getElementById('password' + idPrefix) || input
		: input;
	
	targetInput.style.border = '1.5px solid #e74c3c';
	targetInput.style.background = '#fff6f6';
	
	const warnTip = document.createElement('div');
	warnTip.style.color = '#e74c3c';
	warnTip.style.fontSize = '13px';
	warnTip.style.marginTop = '4px';
	warnTip.textContent = errorMessages[errorType] || errorType;
	targetInput.parentNode.appendChild(warnTip);
	targetInput._warnTip = warnTip;
	targetInput.focus();
}

// 生成登录表单HTML
// Generate login form HTML
export function generateLoginForm(isModal = false) {
	const idPrefix = isModal ? '-modal' : '';
	const rooms = getAvailableRooms();
	
	// 生成房间选择选项
	const roomOptions = rooms.map(room => {
		const lockIcon = room.hasPassword ? '🔒 ' : '';
		return `<option value="${escapeHTML(room.name)}" data-has-password="${room.hasPassword}">${lockIcon}${escapeHTML(room.name)}</option>`;
	}).join('');
	
	return `
		<div class="input-group">
			<label for="userName${idPrefix}">${t('ui.username', 'Username')}</label>
			<input id="userName${idPrefix}" type="text" autocomplete="username" required minlength="1" maxlength="15" placeholder="${t('ui.username', 'Username')}">
		</div>
		<div class="input-group">
			<label for="roomName${idPrefix}">${t('ui.room', '房间')}</label>
			<select id="roomName${idPrefix}" required class="room-select">
				<option value="" disabled selected>${t('ui.select_room', '-- 选择房间 --')}</option>
				${roomOptions}
			</select>
		</div>
		<div class="input-group password-group" id="password-group${idPrefix}">
			<label for="password${idPrefix}">${t('ui.room_password', '房间密码')} <span class="optional">${t('ui.optional', '(可选)')}</span></label>
			<input id="password${idPrefix}" type="password" autocomplete="off" maxlength="30" placeholder="${t('ui.room_password', '房间密码')}">
		</div>
		<div class="input-group admin-group">
			<label for="adminPassword${idPrefix}">${t('ui.admin_password', '管理员密码')} <span class="optional">${t('ui.optional', '(可选)')}</span></label>
			<input id="adminPassword${idPrefix}" type="password" autocomplete="off" maxlength="30" placeholder="${t('ui.admin_password', '管理员密码')}">
		</div>
		<button type="submit" class="login-btn">${t('ui.enter', 'ENTER')}</button>
	`;
}
export function openLoginModal() {
	const modal = document.createElement('div');
	modal.className = 'login-modal';
	modal.innerHTML = `<div class="login-modal-bg"></div><div class="login-modal-card"><button class="login-modal-close login-modal-close-abs">&times;</button><h1>${t('ui.enter_room', '进入房间')}</h1><form id="login-form-modal">${generateLoginForm(true)}</form></div>`;
	document.body.appendChild(modal);
	modal.querySelector('.login-modal-close').onclick = () => modal.remove();
	preventSpaceInput(modal.querySelector('#userName-modal'));
	
	// 设置房间选择监听
	setupRoomSelectListener('-modal');
	
	const form = modal.querySelector('#login-form-modal');
	form.addEventListener('submit', loginFormHandler(modal));
	autofillRoomPwd('-modal')
}

// Setup member list tabs
// 设置成员列表标签页
export function setupTabs() {
	const tabs = document.getElementById("member-tabs").children;
	for (let i = 0; i < tabs.length; i++) {
		tabs[i].onclick = function() {
			for (let j = 0; j < tabs.length; j++) tabs[j].classList.remove("active");
			this.classList.add("active")
		}
	}
}

// Autofill room and password from URL
// 从 URL 自动填充房间和密码
export function autofillRoomPwd(formPrefix = '') {
	const params = new URLSearchParams(window.location.search);
	
	// Check for new encrypted format first
	const encryptedRoom = params.get('r');
	const encryptedPwd = params.get('p');
	
	// Check for old plaintext format (for backward compatibility)
	const plaintextRoom = params.get('node');
	const plaintextPwd = params.get('pwd');
	
	let roomValue = '';
	let pwdValue = '';
	let isPlaintext = false;
	
	if (encryptedRoom) {
		// New encrypted format
		roomValue = simpleDecrypt(decodeURIComponent(encryptedRoom));
		if (encryptedPwd) {
			pwdValue = simpleDecrypt(decodeURIComponent(encryptedPwd));
		}
	} else if (plaintextRoom) {
		// Old plaintext format - show security warning
		roomValue = decodeURIComponent(plaintextRoom);
		if (plaintextPwd) {
			pwdValue = decodeURIComponent(plaintextPwd);
		}
		isPlaintext = true;
	}
	
	// Fill in the form fields
	if (roomValue) {
		const roomSelect = document.getElementById('roomName' + formPrefix);
		if (roomSelect && roomSelect.tagName === 'SELECT') {
			// 对于 select 元素，设置选中值
			for (let i = 0; i < roomSelect.options.length; i++) {
				if (roomSelect.options[i].value === roomValue) {
					roomSelect.selectedIndex = i;
					roomSelect.disabled = true;
					roomSelect.style.background = isPlaintext ? '#fff9e6' : '#f5f5f5';
					
					// 触发 change 事件以显示密码框（如果需要）
					roomSelect.dispatchEvent(new Event('change'));
					break;
				}
			}
		}
		
		// 填充密码
		const pwdInput = document.getElementById('password' + formPrefix);
		const pwdGroup = document.getElementById('password-group' + formPrefix);
		if (pwdInput && pwdValue) {
			pwdInput.value = pwdValue;
			pwdInput.readOnly = true;
			pwdInput.style.background = isPlaintext ? '#fff9e6' : '#f5f5f5';
			if (pwdGroup) pwdGroup.style.display = 'block';
		}
	}
	
	// Clear URL parameters for security
	if (roomValue || pwdValue) {
		window.history.replaceState({}, '', location.pathname);
	}
}

// 初始化登录表单
// Initialize login form
export function initLoginForm() {
	const loginFormContainer = document.getElementById('login-form');
	if (loginFormContainer && loginFormContainer.children.length === 0) {
		// 只有当登录表单为空时才初始化
		// Only initialize if login form is empty
		loginFormContainer.innerHTML = generateLoginForm(false);
		
		// 设置房间选择事件监听
		setupRoomSelectListener('');
	}
	
	// 为登录页面添加class，用于手机适配
	// Add class to login page for mobile adaptation
	document.body.classList.add('login-page');
}

// 设置房间选择监听器 - 根据房间是否需要密码显示/隐藏密码输入框
function setupRoomSelectListener(idPrefix) {
	const roomSelect = document.getElementById('roomName' + idPrefix);
	const passwordGroup = document.getElementById('password-group' + idPrefix);
	
	if (roomSelect && passwordGroup) {
		roomSelect.addEventListener('change', function() {
			const selectedOption = this.options[this.selectedIndex];
			const hasPassword = selectedOption.dataset.hasPassword === 'true';
			
			if (hasPassword) {
				passwordGroup.style.display = 'block';
			} else {
				passwordGroup.style.display = 'none';
			}
		});
	}
}

// Listen for language change events to refresh UI
// 监听语言变更事件刷新UI
window.addEventListener('languageChange', () => {
	// Refresh main header and user list
	renderMainHeader();
	renderUserList(false);
	
	// Refresh chat input placeholder
	updateChatInputStyle();
});

// Listen for regenerate login form event
// 监听重新生成登录表单事件
window.addEventListener('regenerateLoginForm', () => {
	const loginFormContainer = document.getElementById('login-form');
	if (loginFormContainer) {
		loginFormContainer.innerHTML = generateLoginForm(false);
	}
});

// 初始化翻转卡片功能
// Initialize flip card functionality
export function initFlipCard() {
	const flipCard = document.getElementById('flip-card');
	const helpBtn = document.getElementById('help-btn');
	const backBtn = document.getElementById('back-btn');
	
	if (!flipCard || !helpBtn || !backBtn) return;
	
	const flipCardInner = flipCard.querySelector('.flip-card-inner');
	if (!flipCardInner) return;
	
	// 翻转状态
	let isFlipped = false;
	
	// 简单的翻转函数
	function toggleFlip() {
		isFlipped = !isFlipped;
		if (isFlipped) {
			flipCardInner.classList.add('flipped');
		} else {
			flipCardInner.classList.remove('flipped');
		}
	}
	
	// 帮助按钮点击事件
	helpBtn.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		toggleFlip();
	});
	
	// 返回按钮点击事件
	backBtn.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		toggleFlip();
	});
}