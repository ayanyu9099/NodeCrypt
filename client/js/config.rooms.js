// Room configuration - 房间配置
// Only rooms defined here can be joined
// 只有在此定义的房间才能加入

export const ROOMS_CONFIG = [
	{
		id: 'room1',
		name: '客服1号',
		password: '',  // 房间密码，留空表示无密码
		adminPassword: 'admin123',  // 管理员密码
		description: '客服咨询专用'
	},
	{
		id: 'room2', 
		name: '客服2号',
		password: '',
		adminPassword: 'admin123',
		description: '客服咨询专用'
	},
	{
		id: 'room3',
		name: 'VIP专属',
		password: 'vip888',  // 需要密码才能进入
		adminPassword: 'admin123',
		description: 'VIP客户专属通道'
	}
];

// User roles - 用户角色
export const USER_ROLES = {
	ADMIN: 'admin',
	USER: 'user'
};

// Get room by name
export function getRoomByName(name) {
	return ROOMS_CONFIG.find(r => r.name === name);
}

// Get room by id
export function getRoomById(id) {
	return ROOMS_CONFIG.find(r => r.id === id);
}

// Validate room access
export function validateRoomAccess(roomName, password, adminPassword = null) {
	const room = getRoomByName(roomName);
	if (!room) {
		return { valid: false, error: 'room_not_found', role: null };
	}
	
	// Check if admin password is provided and correct
	if (adminPassword && adminPassword === room.adminPassword) {
		return { valid: true, error: null, role: USER_ROLES.ADMIN };
	}
	
	// Check room password
	if (room.password && room.password !== password) {
		return { valid: false, error: 'wrong_password', role: null };
	}
	
	return { valid: true, error: null, role: USER_ROLES.USER };
}

// Get all available rooms (for display)
export function getAvailableRooms() {
	return ROOMS_CONFIG.map(r => ({
		id: r.id,
		name: r.name,
		description: r.description,
		hasPassword: !!r.password
	}));
}
