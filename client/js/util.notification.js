// Notification utilities for NodeCrypt
// NodeCrypt 通知工具

import { t } from './util.i18n.js';

// 通知声音
let notificationSound = null;
let soundEnabled = true;

// 初始化通知声音
export function initNotificationSound() {
	// 创建音频上下文和振荡器生成简单提示音
	try {
		const AudioContext = window.AudioContext || window.webkitAudioContext;
		if (AudioContext) {
			notificationSound = new AudioContext();
		}
	} catch (e) {
		console.warn('AudioContext not supported:', e);
	}
}

// 播放通知声音
export function playNotificationSound() {
	if (!soundEnabled || !notificationSound) return;
	
	try {
		// 如果 AudioContext 被暂停，先恢复
		if (notificationSound.state === 'suspended') {
			notificationSound.resume();
		}
		
		// 创建振荡器生成提示音
		const oscillator = notificationSound.createOscillator();
		const gainNode = notificationSound.createGain();
		
		oscillator.connect(gainNode);
		gainNode.connect(notificationSound.destination);
		
		// 设置音调和音量
		oscillator.frequency.value = 800; // 频率 Hz
		oscillator.type = 'sine';
		gainNode.gain.value = 0.3; // 音量
		
		// 播放短促的提示音
		oscillator.start();
		gainNode.gain.exponentialRampToValueAtTime(0.01, notificationSound.currentTime + 0.2);
		oscillator.stop(notificationSound.currentTime + 0.2);
	} catch (e) {
		console.warn('Failed to play notification sound:', e);
	}
}

// 设置声音开关
export function setSoundEnabled(enabled) {
	soundEnabled = enabled;
	localStorage.setItem('notificationSound', enabled ? 'on' : 'off');
}

// 获取声音开关状态
export function isSoundEnabled() {
	const stored = localStorage.getItem('notificationSound');
	if (stored !== null) {
		soundEnabled = stored === 'on';
	}
	return soundEnabled;
}

// ============ 桌面通知 ============

let desktopNotificationEnabled = false;

// 请求桌面通知权限
export async function requestNotificationPermission() {
	if (!('Notification' in window)) {
		console.warn('This browser does not support desktop notifications');
		return false;
	}
	
	if (Notification.permission === 'granted') {
		desktopNotificationEnabled = true;
		return true;
	}
	
	if (Notification.permission !== 'denied') {
		const permission = await Notification.requestPermission();
		desktopNotificationEnabled = permission === 'granted';
		return desktopNotificationEnabled;
	}
	
	return false;
}

// 显示桌面通知
export function showDesktopNotification(title, body, options = {}) {
	if (!desktopNotificationEnabled || Notification.permission !== 'granted') {
		return null;
	}
	
	// 如果页面在前台且可见，不显示桌面通知
	if (document.visibilityState === 'visible' && document.hasFocus()) {
		return null;
	}
	
	try {
		const notification = new Notification(title, {
			body: body,
			icon: '/assets/favicon.svg',
			badge: '/assets/favicon.svg',
			tag: options.tag || 'nodecrypt-message',
			renotify: options.renotify || false,
			silent: options.silent || false,
			...options
		});
		
		// 点击通知时聚焦窗口
		notification.onclick = () => {
			window.focus();
			notification.close();
			if (options.onClick) {
				options.onClick();
			}
		};
		
		// 自动关闭
		if (options.autoClose !== false) {
			setTimeout(() => notification.close(), options.timeout || 5000);
		}
		
		return notification;
	} catch (e) {
		console.warn('Failed to show desktop notification:', e);
		return null;
	}
}

// 设置桌面通知开关
export function setDesktopNotificationEnabled(enabled) {
	desktopNotificationEnabled = enabled;
	localStorage.setItem('desktopNotification', enabled ? 'on' : 'off');
}

// 获取桌面通知开关状态
export function isDesktopNotificationEnabled() {
	const stored = localStorage.getItem('desktopNotification');
	if (stored !== null) {
		desktopNotificationEnabled = stored === 'on';
	}
	return desktopNotificationEnabled && Notification.permission === 'granted';
}

// 初始化通知系统
export function initNotifications() {
	// 初始化声音
	initNotificationSound();
	isSoundEnabled(); // 加载设置
	
	// 初始化桌面通知
	const desktopEnabled = localStorage.getItem('desktopNotification');
	if (desktopEnabled === 'on') {
		requestNotificationPermission();
	}
}

// 发送新消息通知（综合处理）
export function notifyNewMessage(roomName, senderName, messagePreview, isPrivate = false) {
	// 播放声音
	playNotificationSound();
	
	// 显示桌面通知
	const title = isPrivate 
		? `${senderName} ${t('notification.private_message', '发来私信')}`
		: `${roomName} - ${senderName}`;
	
	showDesktopNotification(title, messagePreview, {
		tag: `message-${roomName}-${senderName}`,
		renotify: true
	});
}
