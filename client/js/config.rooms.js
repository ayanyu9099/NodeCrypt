// Room configuration - 房间配置
// Rooms are fetched from server API (configured via Worker environment variables)
// 房间配置从服务器 API 获取（通过 Worker 环境变量配置）

// User roles - 用户角色
export const USER_ROLES = {
	ADMIN: 'admin',
	USER: 'user'
};

// 缓存的房间列表
let cachedRooms = null;
let roomsFetchPromise = null;

// 从服务器获取房间列表
export async function fetchRoomsFromServer() {
	if (cachedRooms) {
		return cachedRooms;
	}
	
	if (roomsFetchPromise) {
		return roomsFetchPromise;
	}
	
	roomsFetchPromise = fetch('/api/rooms')
		.then(res => {
			if (!res.ok) {
				throw new Error(`HTTP ${res.status}: ${res.statusText}`);
			}
			return res.json();
		})
		.then(data => {
			console.log('Rooms API response:', data);
			cachedRooms = data.rooms || [];
			return cachedRooms;
		})
		.catch(error => {
			console.error('Failed to fetch rooms:', error);
			cachedRooms = [];
			return cachedRooms;
		})
		.finally(() => {
			roomsFetchPromise = null;
		});
	
	return roomsFetchPromise;
}

// 获取已缓存的房间列表（同步）
export function getCachedRooms() {
	return cachedRooms || [];
}

// 清除缓存
export function clearRoomsCache() {
	cachedRooms = null;
}

// Get room by name (from cache)
export function getRoomByName(name) {
	const rooms = getCachedRooms();
	return rooms.find(r => r.name === name);
}

// Get room by id (from cache)
export function getRoomById(id) {
	const rooms = getCachedRooms();
	return rooms.find(r => r.id === id);
}

// Validate room access via server API
export async function validateRoomAccessAsync(roomName, password, adminPassword = null) {
	try {
		const response = await fetch('/api/rooms/validate', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				roomName,
				password,
				adminPassword
			})
		});
		
		const result = await response.json();
		
		if (result.valid) {
			return { 
				valid: true, 
				error: null, 
				role: result.role === 'admin' ? USER_ROLES.ADMIN : USER_ROLES.USER 
			};
		} else {
			return { 
				valid: false, 
				error: result.error || 'unknown_error', 
				role: null 
			};
		}
	} catch (error) {
		console.error('Room validation failed:', error);
		return { 
			valid: false, 
			error: 'network_error', 
			role: null 
		};
	}
}

// 同步验证（用于兼容旧代码，但实际会返回需要异步验证的标记）
export function validateRoomAccess(roomName, password, adminPassword = null) {
	const room = getRoomByName(roomName);
	if (!room) {
		return { valid: false, error: 'room_not_found', role: null };
	}
	
	// 返回需要异步验证的标记
	return { valid: 'pending', error: null, role: null, needsAsyncValidation: true };
}

// Get all available rooms (for display)
export function getAvailableRooms() {
	const rooms = getCachedRooms();
	return rooms.map(r => ({
		id: r.id,
		name: r.name,
		description: r.description,
		hasPassword: r.hasPassword !== false  // 默认所有房间都需要密码
	}));
}
