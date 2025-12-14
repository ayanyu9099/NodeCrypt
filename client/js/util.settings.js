// Import DOM utility functions
// 导入 DOM 工具函数
import {
	$,
	$$,
	$id,
	createElement,
	on,
	off,
	addClass,
	removeClass
} from './util.dom.js';

// Import theme utilities
// 导入主题工具函数
import { THEMES, getCurrentTheme, applyTheme } from './util.theme.js';

// Import i18n utilities
// 导入国际化工具函数
import { t, setLanguage, getCurrentLanguage, initI18n } from './util.i18n.js';

// Import notification utilities
// 导入通知工具函数
import {
	setSoundEnabled,
	isSoundEnabled,
	setDesktopNotificationEnabled,
	isDesktopNotificationEnabled,
	requestNotificationPermission as requestNotifPermission,
	getRingtoneType,
	getRingtoneTypes,
	setRingtoneType,
	setCustomRingtone,
	clearCustomRingtone,
	hasCustomRingtone,
	previewRingtone
} from './util.notification.js';

// Import filter utilities
// 导入过滤工具函数
import {
	isFilterEnabled,
	setFilterEnabled,
	getCustomSensitiveWords,
	addSensitiveWord,
	removeSensitiveWord
} from './util.filter.js';

// Default settings
// 默认设置
const DEFAULT_SETTINGS = {
	notify: false,
	sound: false,
	theme: 'theme1'
	// 注意：我们不设置默认语言，让系统自动检测浏览器语言
	// Note: We don't set a default language, let the system auto-detect browser language
};


// Load settings from localStorage
// 从 localStorage 加载设置
function loadSettings() {
	let s = localStorage.getItem('settings');
	try {
		s = s ? JSON.parse(s) : {}
	} catch {
		s = {}
	}
	return {
		...DEFAULT_SETTINGS,
		...s
	}
}

// Save settings to localStorage
// 保存设置到 localStorage
function saveSettings(settings) {
	const {
		notify,
		sound,
		theme,
		language
	} = settings;
	localStorage.setItem('settings', JSON.stringify({
		notify,
		sound,
		theme,
		language
	}))
}

// Apply settings to the document
// 应用设置到文档
function applySettings(settings) {
	// Initialize i18n with current language setting
	// 根据当前语言设置初始化国际化
	initI18n(settings);
}

// Ask for browser notification permission
// 请求浏览器通知权限
function askNotificationPermission(callback) {
	if (Notification.requestPermission.length === 0) {
		Notification.requestPermission().then(callback)
	} else {
		Notification.requestPermission(callback)
	}
}

// Setup the settings panel UI
// 设置设置面板 UI
function setupSettingsPanel() {
	const settingsSidebar = $id('settings-sidebar');
	const settingsContent = $id('settings-content');
	const settingsTitle = $id('settings-title');
	if (!settingsSidebar || !settingsContent) return;

	const settings = loadSettings();
	
	// Update settings title
	// 更新设置标题
	if (settingsTitle) {
		settingsTitle.textContent = t('settings.title', 'Settings');
	}
	
	// Get current notification and filter states
	const soundEnabled = isSoundEnabled();
	const desktopNotifEnabled = isDesktopNotificationEnabled();
	const filterEnabled = isFilterEnabled();
	const sensitiveWords = getCustomSensitiveWords();
	const currentRingtone = getRingtoneType();
	const ringtoneTypes = getRingtoneTypes();
	const hasCustom = hasCustomRingtone();
	
	// Create settings content HTML
	settingsContent.innerHTML = `
		<div class="settings-section">
			<div class="settings-section-title">${t('settings.notification', 'Notification Settings')}</div>
			<div class="settings-item">
				<div class="settings-item-label">
					<div>${t('settings.desktop_notifications', 'Desktop Notifications')}</div>
				</div>
				<label class="switch">
					<input type="checkbox" id="settings-notify" ${desktopNotifEnabled ? 'checked' : ''}>
					<span class="slider"></span>
				</label>
			</div>
			<div class="settings-item">
				<div class="settings-item-label">
					<div>${t('settings.sound_notifications', 'Sound Notifications')}</div>
				</div>
				<label class="switch">
					<input type="checkbox" id="settings-sound" ${soundEnabled ? 'checked' : ''}>
					<span class="slider"></span>
				</label>
			</div>
			<div class="settings-item">
				<div class="settings-item-label">
					<div>${t('settings.ringtone', '提示音')}</div>
				</div>
				<div class="ringtone-selector">
					<select id="settings-ringtone" class="ringtone-select">
						${ringtoneTypes.map(rt => `<option value="${rt.id}" ${currentRingtone === rt.id ? 'selected' : ''} ${rt.id === 'custom' && !hasCustom ? 'disabled' : ''}>${rt.name}</option>`).join('')}
					</select>
					<button id="preview-ringtone-btn" class="preview-btn" title="${t('settings.preview', '试听')}">🔊</button>
				</div>
			</div>
			<div class="settings-item" style="flex-direction: column; align-items: stretch;">
				<div class="custom-ringtone-upload">
					<label class="upload-btn" for="custom-ringtone-input">
						📁 ${t('settings.upload_ringtone', '上传自定义铃声')}
					</label>
					<input type="file" id="custom-ringtone-input" accept="audio/*" style="display: none;">
					${hasCustom ? `<button id="clear-custom-ringtone" class="clear-btn">${t('settings.clear', '清除')}</button>` : ''}
				</div>
				<div class="ringtone-hint">${t('settings.ringtone_hint', '支持 MP3、WAV 等格式，最大 500KB')}</div>
			</div>
		</div>
		
		<div class="settings-section">
			<div class="settings-section-title">${t('settings.filter', '敏感词过滤')}</div>
			<div class="settings-item">
				<div class="settings-item-label">
					<div>${t('settings.enable_filter', '启用敏感词过滤')}</div>
				</div>
				<label class="switch">
					<input type="checkbox" id="settings-filter" ${filterEnabled ? 'checked' : ''}>
					<span class="slider"></span>
				</label>
			</div>
			<div class="settings-item" style="flex-direction: column; align-items: stretch;">
				<div class="sensitive-word-input">
					<input type="text" id="new-sensitive-word" placeholder="${t('settings.add_word', '添加敏感词')}" maxlength="20">
					<button id="add-sensitive-word-btn">${t('settings.add', '添加')}</button>
				</div>
				<div class="sensitive-word-list" id="sensitive-word-list">
					${sensitiveWords.map(word => `
						<span class="sensitive-word-tag" data-word="${word}">
							${word}
							<button class="remove-word-btn">&times;</button>
						</span>
					`).join('')}
				</div>
			</div>
		</div>
		
		<div class="settings-section">
			<div class="settings-section-title">${t('settings.language', 'Language Settings')}</div>
			<div class="settings-item">
				<div class="settings-item-label">
					<div>${t('settings.language_switch', 'Language')}</div>
				</div>
				<div class="language-selector">
					<select id="settings-language" class="language-select">
						<option value="en" ${settings.language === 'en' ? 'selected' : ''}>🇺🇸 English</option>
						<option value="zh" ${settings.language === 'zh' ? 'selected' : ''}>🇨🇳 中文</option>
					</select>
				</div>
			</div>
		</div>
		
		<div class="settings-section">
			<div class="settings-section-title">${t('settings.theme', 'Theme Settings')}</div>
			<div class="theme-selector" id="theme-selector">
				${THEMES.map(theme => `
					<div class="theme-item ${settings.theme === theme.id ? 'active' : ''}" data-theme-id="${theme.id}" style="background: ${theme.background}; background-size: cover; background-position: center;">
					</div>
				`).join('')}
			</div>
		</div>
	`;
	
	const notifyCheckbox = $id('settings-notify');
	const soundCheckbox = $id('settings-sound');
	const filterCheckbox = $id('settings-filter');
	const languageSelect = $id('settings-language');
	const addWordBtn = $id('add-sensitive-word-btn');
	const newWordInput = $id('new-sensitive-word');
	const wordList = $id('sensitive-word-list');
	
	// Filter checkbox handler
	if (filterCheckbox) {
		on(filterCheckbox, 'change', e => {
			setFilterEnabled(e.target.checked);
		});
	}
	
	// Add sensitive word handler
	if (addWordBtn && newWordInput) {
		const addWord = () => {
			const word = newWordInput.value.trim();
			if (word && addSensitiveWord(word)) {
				const tag = document.createElement('span');
				tag.className = 'sensitive-word-tag';
				tag.dataset.word = word;
				tag.innerHTML = `${word}<button class="remove-word-btn">&times;</button>`;
				wordList.appendChild(tag);
				newWordInput.value = '';
			}
		};
		on(addWordBtn, 'click', addWord);
		on(newWordInput, 'keypress', e => {
			if (e.key === 'Enter') addWord();
		});
	}
	
	// Remove sensitive word handler
	if (wordList) {
		on(wordList, 'click', e => {
			if (e.target.classList.contains('remove-word-btn')) {
				const tag = e.target.closest('.sensitive-word-tag');
				if (tag) {
					removeSensitiveWord(tag.dataset.word);
					tag.remove();
				}
			}
		});
	}
	
	// Language select event handler
	// 语言选择事件处理
	on(languageSelect, 'change', e => {
		const newLanguage = e.target.value;
		settings.language = newLanguage;
		
		// Set language immediately
		// 立即设置语言
		setLanguage(newLanguage);
		
		// Save settings
		// 保存设置
		saveSettings(settings);
		applySettings(settings);
		
		// Refresh the settings panel to show updated translations
		// 刷新设置面板以显示更新的翻译
		setTimeout(() => {
			setupSettingsPanel();
		}, 100);
	});
	
	on(notifyCheckbox, 'change', e => {
		const checked = e.target.checked;
		if (checked) {
			if (!('Notification' in window)) {
				alert('Notifications are not supported by your browser.');
				e.target.checked = false;
				return
			}
			askNotificationPermission(permission => {
				if (permission === 'granted') {
					settings.notify = true;
					setDesktopNotificationEnabled(true);
					saveSettings(settings);
					applySettings(settings);
					// 防止重复通知，添加一个标志位
					if (!settingsSidebar._notificationShown) {
						new Notification('Notifications enabled', {
							body: 'You will receive alerts here.'
						});
						settingsSidebar._notificationShown = true;
					}
				} else {
					settings.notify = false;
					setDesktopNotificationEnabled(false);
					e.target.checked = false;
					saveSettings(settings);
					applySettings(settings);
					alert('Please allow notifications in your browser settings.')
				}
			})
		} else {
			settings.notify = false;
			setDesktopNotificationEnabled(false);
			saveSettings(settings);
			applySettings(settings);
			// 重置标志位
			if (settingsSidebar._notificationShown) {
				settingsSidebar._notificationShown = false;
			}
		}
	});
	
	on(soundCheckbox, 'change', e => {
		settings.sound = e.target.checked;
		setSoundEnabled(e.target.checked);
		saveSettings(settings);
		applySettings(settings)
	});
	
	// Ringtone selection handlers
	// 铃声选择处理
	const ringtoneSelect = $id('settings-ringtone');
	const previewBtn = $id('preview-ringtone-btn');
	const customRingtoneInput = $id('custom-ringtone-input');
	const clearCustomBtn = $id('clear-custom-ringtone');
	
	if (ringtoneSelect) {
		on(ringtoneSelect, 'change', e => {
			const type = e.target.value;
			if (type === 'custom' && !hasCustomRingtone()) {
				// 如果选择自定义但没有上传，触发上传
				customRingtoneInput?.click();
				e.target.value = currentRingtone; // 恢复原选择
				return;
			}
			setRingtoneType(type);
		});
	}
	
	if (previewBtn) {
		on(previewBtn, 'click', () => {
			const type = ringtoneSelect?.value || 'default';
			previewRingtone(type);
		});
	}
	
	if (customRingtoneInput) {
		on(customRingtoneInput, 'change', async e => {
			const file = e.target.files?.[0];
			if (!file) return;
			
			try {
				await setCustomRingtone(file);
				// 刷新设置面板
				setupSettingsPanel();
				// 自动选择自定义铃声
				if (ringtoneSelect) {
					ringtoneSelect.value = 'custom';
				}
			} catch (err) {
				alert(t('settings.ringtone_error', '铃声上传失败: ') + err.message);
			}
			e.target.value = ''; // 清空以便重新选择
		});
	}
	
	if (clearCustomBtn) {
		on(clearCustomBtn, 'click', () => {
			clearCustomRingtone();
			setupSettingsPanel(); // 刷新面板
		});
	}
	
	// Theme selection event handlers
	// 主题选择事件处理
	const themeSelector = $id('theme-selector');
	if (themeSelector) {
		// Custom scrolling functionality
		// 自定义滚动功能
		let isDragging = false;
		let startX = 0;
		let scrollLeft = 0;

		// Mouse wheel scrolling (vertical -> horizontal)
		// 鼠标滚轮滚动（垂直转水平）
		on(themeSelector, 'wheel', e => {
			e.preventDefault();
			const scrollAmount = e.deltaY * 0.5;
			themeSelector.scrollLeft += scrollAmount;
		});
		
		// Mouse drag scrolling
		// 鼠标拖拽滚动
		let dragStartTime = 0;
		let hasDragged = false;
		
		on(themeSelector, 'mousedown', e => {
			isDragging = true;
			hasDragged = false;
			dragStartTime = Date.now();
			startX = e.pageX - themeSelector.offsetLeft;
			scrollLeft = themeSelector.scrollLeft;
			themeSelector.classList.add('dragging');
			e.preventDefault();
		});
		
		on(document, 'mousemove', e => {
			if (!isDragging) return;
			e.preventDefault();
			const x = e.pageX - themeSelector.offsetLeft;
			const walk = (x - startX) * 2;
			const moved = Math.abs(walk);
			
			if (moved > 5) {
				hasDragged = true;
			}
			
			themeSelector.scrollLeft = scrollLeft - walk;
		});

		on(document, 'mouseup', () => {
			if (isDragging) {
				isDragging = false;
				themeSelector.classList.remove('dragging');
			}
		});
		
		// Touch support for mobile
		// 移动端触摸支持
		let touchStartX = 0;
		let touchScrollLeft = 0;
		let touchStartTime = 0;
		let touchHasMoved = false;

		on(themeSelector, 'touchstart', e => {
			touchStartX = e.touches[0].clientX;
			touchScrollLeft = themeSelector.scrollLeft;
			touchStartTime = Date.now();
			touchHasMoved = false;
		});

		on(themeSelector, 'touchmove', e => {
			e.preventDefault();
			const touchX = e.touches[0].clientX;
			const walk = (touchStartX - touchX) * 1.5;
			
			if (Math.abs(walk) > 10) {
				touchHasMoved = true;
			}
			
			themeSelector.scrollLeft = touchScrollLeft + walk;
		});

		on(themeSelector, 'touchend', e => {
			if (touchHasMoved) {
				touchHasMoved = false;
				return;
			}
			
			const tapDuration = Date.now() - touchStartTime;
			if (tapDuration > 300) {
				return;
			}
			
			const themeItem = e.target.closest('.theme-item');
			if (themeItem) {
				const themeId = themeItem.dataset.themeId;
				if (themeId && themeId !== settings.theme) {
					$$('.theme-item', themeSelector).forEach(item => {
						item.classList.remove('active');
					});
					themeItem.classList.add('active');
					
					settings.theme = themeId;
					applyTheme(themeId);
					saveSettings(settings);
				}
			}
		});
		
		// Theme selection click handler
		// 主题选择点击处理器
		on(themeSelector, 'click', e => {
			if (hasDragged) {
				hasDragged = false;
				return;
			}
			
			const clickDuration = Date.now() - dragStartTime;
			if (clickDuration > 200) {
				return;
			}
			
			const themeItem = e.target.closest('.theme-item');
			if (themeItem) {
				const themeId = themeItem.dataset.themeId;
				if (themeId && themeId !== settings.theme) {
					$$('.theme-item', themeSelector).forEach(item => {
						item.classList.remove('active');
					});
					themeItem.classList.add('active');
					
					settings.theme = themeId;
					applyTheme(themeId);
					saveSettings(settings);
				}
			}
		});
	}
}

// Check if device is mobile
function isMobile() {
	return window.innerWidth <= 768;
}

// Open the settings panel
// 打开设置面板
function openSettingsPanel() {
	const settingsSidebar = $id('settings-sidebar');
	const sidebar = $id('sidebar');
	const sidebarMask = $id('mobile-sidebar-mask');
	
	if (!settingsSidebar || !sidebar) return;
	
	if (isMobile()) {
		sidebar.classList.remove('mobile-open');
		settingsSidebar.style.display = 'flex';
		settingsSidebar.offsetHeight;
		settingsSidebar.classList.add('mobile-open');
		if (sidebarMask) {
			sidebarMask.classList.add('active');
		}
	} else {
		settingsSidebar.style.display = 'flex';
		settingsSidebar.offsetHeight;
		settingsSidebar.classList.add('open');
	}
	
	setupSettingsPanel();
}

// Close the settings panel
// 关闭设置面板
function closeSettingsPanel() {
	const settingsSidebar = $id('settings-sidebar');
	const sidebarMask = $id('mobile-sidebar-mask');

	if (!settingsSidebar) return;

	const animationEnded = () => {
		settingsSidebar.style.display = 'none';
		settingsSidebar.removeEventListener('transitionend', animationEnded);
	};

	if (isMobile()) {
		settingsSidebar.classList.remove('mobile-open');
		if (sidebarMask) {
			sidebarMask.classList.remove('active');
		}
		settingsSidebar.addEventListener('transitionend', animationEnded);
		setTimeout(() => {
			if (!settingsSidebar.classList.contains('mobile-open')) {
				settingsSidebar.style.display = 'none';
			}
		}, 350);
	} else {
		settingsSidebar.classList.remove('open');
		settingsSidebar.addEventListener('transitionend', animationEnded);
		setTimeout(() => {
			if (!settingsSidebar.classList.contains('open')) {
				settingsSidebar.style.display = 'none';
			}
		}, 350);
	}
}

// Initialize settings on page load
// 页面加载时初始化设置
function initSettings() {
	const settings = loadSettings();
	applySettings(settings);
	
	if (settings.theme) {
		applyTheme(settings.theme);
	}
	
	window.addEventListener('languageChange', () => {
		const settingsTitle = $id('settings-title');
		if (settingsTitle) {
			settingsTitle.textContent = t('settings.title', 'Settings');
		}
	});
}

// Maximum notification text length
// 通知文本最大长度
const MAX_NOTIFY_TEXT_LEN = 100;

// Truncate text for notifications
// 截断通知文本
function truncateText(text) {
	return text.length > MAX_NOTIFY_TEXT_LEN ? text.slice(0, MAX_NOTIFY_TEXT_LEN) + '...' : text
}

// Play sound notification
// 播放声音通知
function playSoundNotification() {
	try {
		const ctx = new(window.AudioContext || window.webkitAudioContext)();
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.frequency.value = 1000;
		osc.connect(gain);
		gain.connect(ctx.destination);
		osc.start();
		gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
		setTimeout(() => {
			osc.stop();
			ctx.close()
		}, 600)
	} catch (e) {
		console.error('Sound notification failed', e)
	}
}

// Show desktop notification
// 显示桌面通知
function showDesktopNotification(roomName, text, msgType, sender) {
	if (!('Notification' in window) || Notification.permission !== 'granted') return;
	let body;
	const senderPrefix = sender ? `${sender}:` : '';
	
	if (msgType === 'image' || msgType === 'private image') {
		body = `${senderPrefix}${t('notification.image', '[image]')}`;
		if (msgType === 'private image') {
			body = `${t('notification.private', '(Private)')}${body}`
		}
	} else if (msgType === 'text' || msgType === 'private text') {
		body = `${senderPrefix}${truncateText(text)}`;
		if (msgType === 'private text') {
			body = `${t('notification.private', '(Private)')}${body}`
		}
	} else {
		body = truncateText(text)
	}
	new Notification(`#${roomName}`, {
		body
	})
}

// Notify message entry point
// 通知消息主入口
export function notifyMessage(roomName, msgType, text, sender) {
	const settings = loadSettings();
	if (settings.notify) {
		showDesktopNotification(roomName, text, msgType, sender)
	} else if (settings.sound) {
		playSoundNotification()
	}
}

export {
	openSettingsPanel,
	closeSettingsPanel,
	initSettings
};
