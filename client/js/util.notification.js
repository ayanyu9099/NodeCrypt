// Notification utilities for NodeCrypt
// NodeCrypt 通知工具

import { t } from './util.i18n.js';

// 通知声音
let notificationSound = null;
let soundEnabled = true;
let customRingtone = null; // 自定义铃声 Audio 对象
let currentRingtoneType = 'default'; // 当前铃声类型: 'default', 'classic', 'soft', 'custom'

// 预设铃声类型
const RINGTONE_TYPES = {
	default: 'default',   // 默认三连音
	classic: 'classic',   // 经典双音
	soft: 'soft',         // 柔和提示
	custom: 'custom'      // 自定义铃声
};

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
	
	// 加载保存的铃声设置
	const savedType = localStorage.getItem('ringtoneType');
	if (savedType && RINGTONE_TYPES[savedType]) {
		currentRingtoneType = savedType;
	}
	
	// 加载自定义铃声
	const savedCustomRingtone = localStorage.getItem('customRingtone');
	if (savedCustomRingtone) {
		try {
			customRingtone = new Audio(savedCustomRingtone);
			customRingtone.volume = 1.0;
		} catch (e) {
			console.warn('Failed to load custom ringtone:', e);
		}
	}
}

// 播放通知声音
export function playNotificationSound() {
	if (!soundEnabled) return;
	
	// 如果是自定义铃声且已加载
	if (currentRingtoneType === 'custom' && customRingtone) {
		try {
			customRingtone.currentTime = 0;
			customRingtone.play().catch(e => console.warn('Failed to play custom ringtone:', e));
		} catch (e) {
			console.warn('Failed to play custom ringtone:', e);
			playGeneratedSound(); // 回退到生成的声音
		}
		return;
	}
	
	playGeneratedSound();
}

// 播放生成的提示音
function playGeneratedSound() {
	if (!notificationSound) return;
	
	try {
		// 如果 AudioContext 被暂停，先恢复
		if (notificationSound.state === 'suspended') {
			notificationSound.resume();
		}
		
		const currentTime = notificationSound.currentTime;
		
		switch (currentRingtoneType) {
			case 'classic':
				playClassicSound(currentTime);
				break;
			case 'soft':
				playSoftSound(currentTime);
				break;
			default:
				playDefaultSound(currentTime);
				break;
		}
	} catch (e) {
		console.warn('Failed to play notification sound:', e);
	}
}

// 默认铃声 - 手机风格三连音（更响亮更长）
function playDefaultSound(currentTime) {
	const notes = [
		{ freq: 880, start: 0, duration: 0.15 },      // A5
		{ freq: 1100, start: 0.18, duration: 0.15 },  // C#6
		{ freq: 1320, start: 0.36, duration: 0.25 }   // E6
	];
	
	notes.forEach(note => {
		const osc = notificationSound.createOscillator();
		const gain = notificationSound.createGain();
		osc.connect(gain);
		gain.connect(notificationSound.destination);
		osc.frequency.value = note.freq;
		osc.type = 'sine';
		gain.gain.setValueAtTime(0.8, currentTime + note.start);
		gain.gain.setValueAtTime(0.8, currentTime + note.start + note.duration * 0.7);
		gain.gain.exponentialRampToValueAtTime(0.01, currentTime + note.start + note.duration);
		osc.start(currentTime + note.start);
		osc.stop(currentTime + note.start + note.duration);
	});
}

// 经典铃声 - 双音"叮咚"
function playClassicSound(currentTime) {
	// 第一个音 - 叮
	const osc1 = notificationSound.createOscillator();
	const gain1 = notificationSound.createGain();
	osc1.connect(gain1);
	gain1.connect(notificationSound.destination);
	osc1.frequency.value = 1047; // C6
	osc1.type = 'sine';
	gain1.gain.setValueAtTime(0.7, currentTime);
	gain1.gain.setValueAtTime(0.7, currentTime + 0.12);
	gain1.gain.exponentialRampToValueAtTime(0.01, currentTime + 0.2);
	osc1.start(currentTime);
	osc1.stop(currentTime + 0.2);
	
	// 第二个音 - 咚
	const osc2 = notificationSound.createOscillator();
	const gain2 = notificationSound.createGain();
	osc2.connect(gain2);
	gain2.connect(notificationSound.destination);
	osc2.frequency.value = 784; // G5
	osc2.type = 'sine';
	gain2.gain.setValueAtTime(0.7, currentTime + 0.25);
	gain2.gain.setValueAtTime(0.7, currentTime + 0.4);
	gain2.gain.exponentialRampToValueAtTime(0.01, currentTime + 0.5);
	osc2.start(currentTime + 0.25);
	osc2.stop(currentTime + 0.5);
}

// 柔和铃声 - 轻柔提示
function playSoftSound(currentTime) {
	const osc = notificationSound.createOscillator();
	const gain = notificationSound.createGain();
	osc.connect(gain);
	gain.connect(notificationSound.destination);
	osc.frequency.value = 660; // E5
	osc.type = 'sine';
	gain.gain.setValueAtTime(0, currentTime);
	gain.gain.linearRampToValueAtTime(0.5, currentTime + 0.1);
	gain.gain.setValueAtTime(0.5, currentTime + 0.3);
	gain.gain.exponentialRampToValueAtTime(0.01, currentTime + 0.6);
	osc.start(currentTime);
	osc.stop(currentTime + 0.6);
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

// ============ 自定义铃声功能 ============

// 获取当前铃声类型
export function getRingtoneType() {
	return currentRingtoneType;
}

// 获取可用的铃声类型列表
export function getRingtoneTypes() {
	return [
		{ id: 'default', name: t('settings.ringtone_default', '默认（三连音）') },
		{ id: 'classic', name: t('settings.ringtone_classic', '经典（叮咚）') },
		{ id: 'soft', name: t('settings.ringtone_soft', '柔和') },
		{ id: 'custom', name: t('settings.ringtone_custom', '自定义') }
	];
}

// 设置铃声类型
export function setRingtoneType(type) {
	if (RINGTONE_TYPES[type]) {
		currentRingtoneType = type;
		localStorage.setItem('ringtoneType', type);
		return true;
	}
	return false;
}

// 设置自定义铃声（从文件）
export function setCustomRingtone(file) {
	return new Promise((resolve, reject) => {
		if (!file || !file.type.startsWith('audio/')) {
			reject(new Error('Invalid audio file'));
			return;
		}
		
		// 限制文件大小（最大 500KB）
		if (file.size > 500 * 1024) {
			reject(new Error('File too large (max 500KB)'));
			return;
		}
		
		const reader = new FileReader();
		reader.onload = (e) => {
			try {
				const dataUrl = e.target.result;
				
				// 创建 Audio 对象测试
				const testAudio = new Audio(dataUrl);
				testAudio.oncanplaythrough = () => {
					customRingtone = testAudio;
					customRingtone.volume = 1.0;
					localStorage.setItem('customRingtone', dataUrl);
					currentRingtoneType = 'custom';
					localStorage.setItem('ringtoneType', 'custom');
					resolve(true);
				};
				testAudio.onerror = () => {
					reject(new Error('Cannot play this audio file'));
				};
			} catch (err) {
				reject(err);
			}
		};
		reader.onerror = () => reject(new Error('Failed to read file'));
		reader.readAsDataURL(file);
	});
}

// 清除自定义铃声
export function clearCustomRingtone() {
	customRingtone = null;
	localStorage.removeItem('customRingtone');
	if (currentRingtoneType === 'custom') {
		currentRingtoneType = 'default';
		localStorage.setItem('ringtoneType', 'default');
	}
}

// 检查是否有自定义铃声
export function hasCustomRingtone() {
	return customRingtone !== null || localStorage.getItem('customRingtone') !== null;
}

// 预览铃声
export function previewRingtone(type) {
	const originalType = currentRingtoneType;
	if (type && RINGTONE_TYPES[type]) {
		currentRingtoneType = type;
	}
	playNotificationSound();
	currentRingtoneType = originalType;
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
