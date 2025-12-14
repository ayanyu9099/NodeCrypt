// Sensitive word filter for NodeCrypt
// NodeCrypt 敏感词过滤

// 默认敏感词列表（可通过设置扩展）
const defaultSensitiveWords = [
	// 这里添加默认敏感词
];

// 用户自定义敏感词
let customSensitiveWords = [];

// 是否启用过滤
let filterEnabled = true;

// 替换字符
const REPLACEMENT_CHAR = '*';

// 初始化敏感词过滤
export function initSensitiveFilter() {
	// 从本地存储加载设置
	const stored = localStorage.getItem('sensitiveFilter');
	if (stored) {
		try {
			const data = JSON.parse(stored);
			filterEnabled = data.enabled !== false;
			customSensitiveWords = data.words || [];
		} catch (e) {
			console.warn('Failed to load sensitive filter settings:', e);
		}
	}
}

// 获取所有敏感词
function getAllSensitiveWords() {
	return [...defaultSensitiveWords, ...customSensitiveWords];
}

// 过滤敏感词
export function filterSensitiveWords(text) {
	if (!filterEnabled || !text || typeof text !== 'string') {
		return { text, filtered: false, count: 0 };
	}
	
	const words = getAllSensitiveWords();
	if (words.length === 0) {
		return { text, filtered: false, count: 0 };
	}
	
	let filteredText = text;
	let count = 0;
	
	words.forEach(word => {
		if (!word) return;
		
		// 创建正则表达式（不区分大小写）
		const regex = new RegExp(escapeRegExp(word), 'gi');
		const matches = filteredText.match(regex);
		
		if (matches) {
			count += matches.length;
			// 替换为星号
			filteredText = filteredText.replace(regex, REPLACEMENT_CHAR.repeat(word.length));
		}
	});
	
	return {
		text: filteredText,
		filtered: count > 0,
		count
	};
}

// 检查文本是否包含敏感词
export function containsSensitiveWords(text) {
	if (!filterEnabled || !text || typeof text !== 'string') {
		return false;
	}
	
	const words = getAllSensitiveWords();
	return words.some(word => {
		if (!word) return false;
		const regex = new RegExp(escapeRegExp(word), 'i');
		return regex.test(text);
	});
}

// 转义正则表达式特殊字符
function escapeRegExp(string) {
	return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 设置过滤开关
export function setFilterEnabled(enabled) {
	filterEnabled = enabled;
	saveSettings();
}

// 获取过滤开关状态
export function isFilterEnabled() {
	return filterEnabled;
}

// 添加自定义敏感词
export function addSensitiveWord(word) {
	if (!word || typeof word !== 'string') return false;
	
	const trimmed = word.trim();
	if (trimmed && !customSensitiveWords.includes(trimmed)) {
		customSensitiveWords.push(trimmed);
		saveSettings();
		return true;
	}
	return false;
}

// 删除自定义敏感词
export function removeSensitiveWord(word) {
	const index = customSensitiveWords.indexOf(word);
	if (index > -1) {
		customSensitiveWords.splice(index, 1);
		saveSettings();
		return true;
	}
	return false;
}

// 获取自定义敏感词列表
export function getCustomSensitiveWords() {
	return [...customSensitiveWords];
}

// 设置自定义敏感词列表
export function setCustomSensitiveWords(words) {
	if (Array.isArray(words)) {
		customSensitiveWords = words.filter(w => w && typeof w === 'string').map(w => w.trim());
		saveSettings();
	}
}

// 保存设置到本地存储
function saveSettings() {
	localStorage.setItem('sensitiveFilter', JSON.stringify({
		enabled: filterEnabled,
		words: customSensitiveWords
	}));
}

// 管理员设置敏感词（通过公告广播给所有用户）
export function broadcastSensitiveWords(wordList) {
	// 这个功能需要管理员权限，通过公告消息广播
	if (Array.isArray(wordList)) {
		setCustomSensitiveWords(wordList);
	}
}
