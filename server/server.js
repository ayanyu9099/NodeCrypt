#!/usr/bin/env nodejs

'use strict';

const crypto = require('crypto');
const ws = require('ws');

// Generate a new RSA key pair
// 生成一个新的 RSA 密钥对
const generateRSAKeyPair = () => {
	try {
		console.log('Generating new RSA keypair...');
		const {
			publicKey,
			privateKey
		} = crypto.generateKeyPairSync('rsa', {
			modulusLength: 2048,
			publicKeyEncoding: {
				type: 'spki',
				format: 'der'
			},
			privateKeyEncoding: {
				type: 'pkcs8',
				format: 'der'
			}
		});

		return {
			rsaPublic: Buffer.from(publicKey).toString('base64'),
			rsaPrivate: crypto.createPrivateKey({
				key: privateKey,
				format: 'der',
				type: 'pkcs8'
			})
		};
	} catch (error) {
		console.error('Error generating RSA key pair:', error);
		process.exit(1);
	}
};

const keyPair = generateRSAKeyPair();
console.log('RSA key pair generated successfully');

const config = {
	rsaPrivate: keyPair.rsaPrivate,
	rsaPublic: keyPair.rsaPublic,
	wsHost: '127.0.0.1',
	wsPort: 8088,
	seenTimeout: 60000,
	debug: false
};


const wss = new ws.Server({
	host: config.wsHost,
	port: config.wsPort,
	perMessageDeflate: false
});

console.log('server started', config.wsHost, config.wsPort);


var clients = {};
var channels = {};
var bannedIPs = new Map(); // IP 禁言列表 { ip: { bannedAt, bannedUntil, reason } }

// 获取客户端 IP 地址
// Get client IP address
const getClientIP = (connection, req) => {
	// 优先从 X-Forwarded-For 获取（代理情况）
	const forwarded = req && req.headers && req.headers['x-forwarded-for'];
	if (forwarded) {
		return forwarded.split(',')[0].trim();
	}
	// 从 X-Real-IP 获取
	const realIP = req && req.headers && req.headers['x-real-ip'];
	if (realIP) {
		return realIP;
	}
	// 从连接获取
	if (req && req.socket && req.socket.remoteAddress) {
		return req.socket.remoteAddress;
	}
	return 'unknown';
};

// 检查 IP 是否被禁言
// Check if IP is banned
const isIPBanned = (ip) => {
	const ban = bannedIPs.get(ip);
	if (!ban) return false;
	
	// 检查是否过期
	if (ban.bannedUntil && ban.bannedUntil > 0 && Date.now() > ban.bannedUntil) {
		bannedIPs.delete(ip);
		return false;
	}
	return true;
};

// 禁言 IP
// Ban IP address
const banIP = (ip, duration = 0, reason = '') => {
	const bannedUntil = duration > 0 ? Date.now() + duration * 60 * 1000 : 0;
	bannedIPs.set(ip, {
		bannedAt: Date.now(),
		bannedUntil,
		reason
	});
	logEvent('ban-ip', { ip, duration, reason }, 'info');
	
	// 断开所有该 IP 的连接
	for (const clientId in clients) {
		if (clients[clientId].ip === ip) {
			try {
				// 发送禁言通知
				if (clients[clientId].shared) {
					sendMessage(clients[clientId].connection, encryptMessage({
						a: 'banned',
						d: { duration, reason }
					}, clients[clientId].shared));
				}
				setTimeout(() => {
					if (clients[clientId]) {
						clients[clientId].connection.terminate();
					}
				}, 1000);
			} catch (error) {
				logEvent('ban-ip-disconnect', error, 'error');
			}
		}
	}
};

// 解除 IP 禁言
// Unban IP address
const unbanIP = (ip) => {
	bannedIPs.delete(ip);
	logEvent('unban-ip', { ip }, 'info');
};

// WebSocket server connection event handler
// WebSocket 服务器连接事件处理程序
wss.on('connection', (connection, req) => {

	if (
		!connection
	) {
		return;
	}
	
	// 获取客户端 IP
	const clientIP = getClientIP(connection, req);
	
	// 检查 IP 是否被禁言
	if (isIPBanned(clientIP)) {
		logEvent('connection-banned', clientIP, 'info');
		closeConnection(connection);
		return;
	}


	const seenThreshold = (getTime() - config.seenTimeout);

	for (
		const clientId in clients
	) {
		if (
			clients[clientId].seen < seenThreshold
		) {
			try {
				logEvent('connection-seen', clientId, 'debug');
				clients[clientId].connection.terminate();
			} catch (error) {
				logEvent('connection-seen', error, 'error');
			}
		}
	}


	const clientId = generateClientId();

	if (
		!clientId ||
		clients[clientId]
	) {
		closeConnection(connection);
		return;
	}

	logEvent('connection', clientId, 'debug');


	clients[clientId] = {
		connection: connection,
		seen: getTime(),
		key: null,
		channel: null,
		ip: clientIP  // 保存客户端 IP
	};

	try {
		logEvent('sending-public-key', clientId, 'debug');
		sendMessage(connection, JSON.stringify({
			type: 'server-key',
			key: config.rsaPublic
		}));
	} catch (error) {
		logEvent('sending-public-key', error, 'error');
	}



	connection.on('message', (message) => {

		if (
			!isString(message) ||
			!clients[clientId]
		) {
			return;
		}

		clients[clientId].seen = getTime();

		if (
			message === 'ping'
		) {
			sendMessage(connection, 'pong');
			return;
		}

		logEvent('message', [clientId, message], 'debug');

		if (
			!clients[clientId].shared &&
			message.length < 2048
		) {


			try {

				const keys = crypto.createECDH('secp384r1');

				keys.generateKeys();

				const publicKey = keys.getPublicKey();
				const signature = crypto.sign('sha256', publicKey, {
					key: config.rsaPrivate,
					padding: crypto.constants.RSA_PKCS1_PADDING,
					dsaEncoding: 'ieee-p1363'
				});

				clients[clientId].shared = keys.computeSecret(message, 'hex', null).slice(8, 40);

				sendMessage(connection, publicKey.toString('hex') + '|' + signature.toString('base64'));

			} catch (error) {
				logEvent('message-key', [clientId, error], 'error');
				closeConnection(connection);
			}

			return;

		}

		if (
			clients[clientId].shared &&
			message.length <= (8 * 1024 * 1024)
		) {

			processEncryptedMessage(clientId, message);

		}

	});



	connection.on('close', (event) => {

		logEvent('close', [clientId, event], 'debug');


		const channel = clients[clientId].channel;

		if (
			channel &&
			channels[channel]
		) {

			channels[channel].splice(channels[channel].indexOf(clientId), 1);

			if (
				channels[channel].length === 0
			) {


				delete(channels[channel]);

			} else {


				try {

					const members = channels[channel];

					for (
						const member of members
					) {

						const client = clients[member];

						if (
							isClientInChannel(client, channel)
						) {
							sendMessage(client.connection, encryptMessage({
								a: 'l',
								p: members.filter((value) => {
									return (
										value !== member ?
										true :
										false
									);
								})
							}, client.shared));
						}

					}

				} catch (error) {
					logEvent('close-list', [clientId, error], 'error');
				}

			}

		}


		if (
			clients[clientId]
		) {
			delete(clients[clientId]);
		}

	});

});

// Process encrypted messages
// 处理加密消息
const processEncryptedMessage = (clientId, message) => {
	let decrypted = null;

	try {
		decrypted = decryptMessage(message, clients[clientId].shared);

		logEvent('message-decrypted', [clientId, decrypted], 'debug');

		if (
			!isObject(decrypted) ||
			!isString(decrypted.a)
		) {
			return;
		}

		const action = decrypted.a;

		if (action === 'j') {
			handleJoinChannel(clientId, decrypted);
		} else if (action === 'c') {
			handleClientMessage(clientId, decrypted);
		} else if (action === 'w') {
			handleChannelMessage(clientId, decrypted);
		} else if (action === 'ban_ip') {
			handleBanIP(clientId, decrypted);
		} else if (action === 'unban_ip') {
			handleUnbanIP(clientId, decrypted);
		}

	} catch (error) {
		logEvent('process-encrypted-message', [clientId, error], 'error');
	} finally {
		decrypted = null;
	}
};

// 处理 IP 禁言请求
// Handle IP ban request
const handleBanIP = (clientId, decrypted) => {
	try {
		const targetClientId = decrypted.t; // 目标用户 ID
		const duration = decrypted.d || 0;  // 禁言时长（分钟）
		const reason = decrypted.r || '';   // 禁言原因
		
		if (!targetClientId || !clients[targetClientId]) {
			return;
		}
		
		const targetIP = clients[targetClientId].ip;
		if (targetIP && targetIP !== 'unknown') {
			banIP(targetIP, duration, reason);
			
			// 通知管理员禁言成功
			if (clients[clientId] && clients[clientId].shared) {
				sendMessage(clients[clientId].connection, encryptMessage({
					a: 'ban_result',
					s: true,
					ip: targetIP
				}, clients[clientId].shared));
			}
		}
	} catch (error) {
		logEvent('handle-ban-ip', error, 'error');
	}
};

// 处理解除 IP 禁言请求
// Handle IP unban request
const handleUnbanIP = (clientId, decrypted) => {
	try {
		const targetClientId = decrypted.t;
		
		if (!targetClientId || !clients[targetClientId]) {
			return;
		}
		
		const targetIP = clients[targetClientId].ip;
		if (targetIP && targetIP !== 'unknown') {
			unbanIP(targetIP);
		}
	} catch (error) {
		logEvent('handle-unban-ip', error, 'error');
	}
};

// Handle channel join requests
// 处理加入频道请求
const handleJoinChannel = (clientId, decrypted) => {
	if (
		!isString(decrypted.p) ||
		clients[clientId].channel
	) {
		return;
	}

	try {
		const channel = decrypted.p;

		clients[clientId].channel = channel;

		if (!channels[channel]) {
			channels[channel] = [clientId];
		} else {
			channels[channel].push(clientId);
		}

		broadcastMemberList(channel);

	} catch (error) {
		logEvent('message-join', [clientId, error], 'error');
	}
};

// Handle client messages
// 处理客户端消息
const handleClientMessage = (clientId, decrypted) => {
	if (
		!isString(decrypted.p) ||
		!isString(decrypted.c) ||
		!clients[clientId].channel
	) {
		return;
	}

	try {
		const channel = clients[clientId].channel;
		const targetClient = clients[decrypted.c];

		if (isClientInChannel(targetClient, channel)) {
			const messageObj = {
				a: 'c',
				p: decrypted.p,
				c: clientId
			};

			const encrypted = encryptMessage(messageObj, targetClient.shared);
			sendMessage(targetClient.connection, encrypted);

			messageObj.p = null;
		}

	} catch (error) {
		logEvent('message-client', [clientId, error], 'error');
	}
};

// Handle channel messages
// 处理频道消息
const handleChannelMessage = (clientId, decrypted) => {
	if (
		!isObject(decrypted.p) ||
		!clients[clientId].channel
	) {
		return;
	}

	try {
		const channel = clients[clientId].channel;

		for (const member in decrypted.p) {
			const targetClient = clients[member];

			if (
				isString(decrypted.p[member]) &&
				isClientInChannel(targetClient, channel)
			) {
				const messageObj = {
					a: 'c',
					p: decrypted.p[member],
					c: clientId
				};

				const encrypted = encryptMessage(messageObj, targetClient.shared);
				sendMessage(targetClient.connection, encrypted);

				messageObj.p = null;
			}
		}

	} catch (error) {
		logEvent('message-channel', [clientId, error], 'error');
	}
};

// Broadcast member list to channel
// 向频道广播成员列表
const broadcastMemberList = (channel) => {
	try {
		const members = channels[channel];

		for (const member of members) {
			const client = clients[member];

			if (isClientInChannel(client, channel)) {
				const filteredMembers = members.filter(value => value !== member);

				const listObj = {
					a: 'l',
					p: filteredMembers
				};

				const encrypted = encryptMessage(listObj, client.shared);
				sendMessage(client.connection, encrypted);

				listObj.p = null;
			}
		}
	} catch (error) {
		logEvent('broadcast-member-list', error, 'error');
	}
};



// Log events with timestamps and levels
// 记录带时间戳和级别的事件
const logEvent = (source, message, level) => {
	if (
		level !== 'debug' ||
		config.debug
	) {

		const date = new Date(),
			dateString = date.getFullYear() + '-' +
			('0' + (date.getMonth() + 1)).slice(-2) + '-' +
			('0' + date.getDate()).slice(-2) + ' ' +
			('0' + date.getHours()).slice(-2) + ':' +
			('0' + date.getMinutes()).slice(-2) + ':' +
			('0' + date.getSeconds()).slice(-2);

		console.log('[' + dateString + ']', (level ? level.toUpperCase() : 'INFO'), source + (message ? ':' : ''), (message ? message : ''));

	}
};


const generateClientId = () => {
	try {
		return (crypto.randomBytes(8).toString('hex'));
	} catch (error) {
		logEvent('generateClientId', error, 'error');
		return (null);
	}
};


const closeConnection = (connection) => {
	try {
		connection.close();
	} catch (error) {
		logEvent('closeConnection', error, 'error');
	}
};


const isClientInChannel = (client, channel) => {
	return (
		client &&
		client.connection &&
		client.shared &&
		client.channel &&
		client.channel === channel ?
		true :
		false
	);
};


const sendMessage = (connection, message) => {
	try {
		if (
			connection.readyState &&
			connection.readyState === ws.OPEN
		) {
			connection.send(message);
		}
	} catch (error) {
		logEvent('sendMessage', error, 'error');
	}
};


const encryptMessage = (message, key) => {

	let encrypted = '';

	try {

		const messageBuffer = Buffer.from(JSON.stringify(message), 'utf8');

		const paddedBuffer = (messageBuffer.length % 16) !== 0 ?
			Buffer.concat([messageBuffer, Buffer.alloc(16 - (messageBuffer.length % 16))]) :
			messageBuffer;

		const iv = crypto.randomBytes(16);
		const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
		cipher.setAutoPadding(false);

		encrypted = iv.toString('base64') + '|' + cipher.update(paddedBuffer, '', 'base64') + cipher.final('base64');

	} catch (error) {
		logEvent('encryptMessage', error, 'error');
	}

	return (encrypted);

};


const decryptMessage = (message, key) => {

	let decrypted = {};

	try {

		const parts = message.split('|');
		const decipher = crypto.createDecipheriv(
			'aes-256-cbc',
			key,
			Buffer.from(parts[0], 'base64')
		);

		decipher.setAutoPadding(false);

		const decryptedText = decipher.update(parts[1], 'base64', 'utf8') + decipher.final('utf8');
		decrypted = JSON.parse(decryptedText.replace(/\0+$/, ''));

	} catch (error) {
		logEvent('decryptMessage', error, 'error');
	}

	return (decrypted);

};


const getTime = () => {
	return (new Date().getTime());
};


const isString = (value) => {
	return (
		value &&
		Object.prototype.toString.call(value) === '[object String]' ?
		true :
		false
	);
};


const isArray = (value) => {
	return (
		value &&
		Object.prototype.toString.call(value) === '[object Array]' ?
		true :
		false
	);
};


const isObject = (value) => {
	return (
		value &&
		Object.prototype.toString.call(value) === '[object Object]' ?
		true :
		false
	);
};

setInterval(() => {
	if (global.gc) {
		global.gc();
	}
}, 30000);