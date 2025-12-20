import { generateClientId, encryptMessage, decryptMessage, logEvent, isString, isObject, getTime } from './utils.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // 获取客户端 IP
    const clientIP = request.headers.get('CF-Connecting-IP') || 
                     request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() || 
                     'unknown';

    // 处理WebSocket请求
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader && upgradeHeader === 'websocket') {
      // 检查 IP 是否被禁言（添加错误处理，避免 KV 错误影响连接）
      try {
        if (env.MUTE_STORE) {
          const muteData = await env.MUTE_STORE.get(`mute:ip:${clientIP}`);
          if (muteData) {
            const data = JSON.parse(muteData);
            if (data.expiresAt > Date.now()) {
              // IP 被禁言，拒绝 WebSocket 连接
              return new Response(JSON.stringify({
                error: 'ip_muted',
                expiresAt: data.expiresAt,
                reason: data.reason
              }), { 
                status: 403,
                headers: { 'Content-Type': 'application/json' }
              });
            }
          }
        }
      } catch (e) {
        console.error('KV mute check error:', e);
        // 继续处理，不阻止连接
      }
      
      const id = env.CHAT_ROOM.idFromName('chat-room');
      const stub = env.CHAT_ROOM.get(id);
      
      // 将 IP 传递给 Durable Object
      const newRequest = new Request(request.url, {
        headers: new Headers([...request.headers, ['X-Client-IP', clientIP]]),
        method: request.method
      });
      
      // 异步存储 IP 到 KV（不阻塞 WebSocket 连接）
      if (env.MUTE_STORE) {
        ctx.waitUntil(
          env.MUTE_STORE.put(
            `recent-ip:${clientIP}`,
            JSON.stringify({ lastSeen: Date.now() }),
            { expirationTtl: 86400 }
          ).catch(e => console.error('KV put error:', e))
        );
      }
      
      return stub.fetch(newRequest);
    }

    // 处理API请求
    if (url.pathname.startsWith('/api/')) {
      const corsHeaders = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      };
      
      // 处理 OPTIONS 预检请求
      if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
      }
      
      // 获取系统配置
      if (url.pathname === '/api/config') {
        // ALLOW_JOIN_ROOM 环境变量控制是否允许用户加入房间
        // 默认为 true（允许），设置为 'false' 时禁用
        const allowJoinRoom = env.ALLOW_JOIN_ROOM !== 'false';
        
        return new Response(JSON.stringify({ 
          allowJoinRoom: allowJoinRoom
        }), { 
          headers: corsHeaders 
        });
      }
      
      // 获取房间配置（不包含密码）
      if (url.pathname === '/api/rooms') {
        const rooms = getRoomsConfig(env);
        // 返回房间列表，不包含密码
        const publicRooms = rooms.map(r => ({
          id: r.id,
          name: r.name,
          description: r.description,
          hasPassword: true  // 所有房间都需要密码
        }));
        
        // 调试信息：检查环境变量是否存在
        const debugInfo = {
          roomCount: rooms.length,
          room1Name: env.ROOM_1_NAME ? 'set' : 'not set',
          room2Name: env.ROOM_2_NAME ? 'set' : 'not set'
        };
        
        return new Response(JSON.stringify({ 
          rooms: publicRooms,
          debug: debugInfo
        }), { 
          headers: corsHeaders 
        });
      }
      
      // ============ IP 禁言 API ============
      
      // 获取当前客户端 IP
      if (url.pathname === '/api/ip' && request.method === 'GET') {
        return new Response(JSON.stringify({ 
          ip: clientIP 
        }), { headers: corsHeaders });
      }
      
      // 禁言用户（管理员操作）- 按 IP 禁言
      if (url.pathname === '/api/mute' && request.method === 'POST') {
        try {
          const body = await request.json();
          const { ip, duration, reason, mutedBy } = body;
          
          if (!ip || !duration) {
            return new Response(JSON.stringify({ 
              success: false, 
              error: 'missing_parameters' 
            }), { headers: corsHeaders, status: 400 });
          }
          
          // duration 单位为秒
          const durationMs = duration * 1000;
          const muteData = {
            ip,
            mutedAt: Date.now(),
            duration: durationMs,
            expiresAt: Date.now() + durationMs,
            reason: reason || '',
            mutedBy: mutedBy || 'admin'
          };
          
          // 存储到 KV，设置 TTL 自动过期
          if (env.MUTE_STORE) {
            await env.MUTE_STORE.put(
              `mute:ip:${ip}`, 
              JSON.stringify(muteData),
              { expirationTtl: Math.max(60, duration) } // 最少 60 秒
            );
          }
          
          return new Response(JSON.stringify({ 
            success: true, 
            data: muteData 
          }), { headers: corsHeaders });
        } catch (error) {
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'internal_error' 
          }), { headers: corsHeaders, status: 500 });
        }
      }
      
      // 检查 IP 是否被禁言
      if (url.pathname === '/api/mute/check' && request.method === 'POST') {
        try {
          const body = await request.json();
          const { ip } = body;
          
          if (!ip) {
            return new Response(JSON.stringify({ 
              muted: false 
            }), { headers: corsHeaders });
          }
          
          let muteData = null;
          if (env.MUTE_STORE) {
            const stored = await env.MUTE_STORE.get(`mute:${ip}`);
            if (stored) {
              muteData = JSON.parse(stored);
              // 检查是否已过期
              if (muteData.expiresAt && muteData.expiresAt < Date.now()) {
                await env.MUTE_STORE.delete(`mute:${ip}`);
                muteData = null;
              }
            }
          }
          
          if (muteData) {
            return new Response(JSON.stringify({ 
              muted: true,
              expiresAt: muteData.expiresAt,
              remaining: Math.max(0, muteData.expiresAt - Date.now()),
              reason: muteData.reason
            }), { headers: corsHeaders });
          }
          
          return new Response(JSON.stringify({ 
            muted: false 
          }), { headers: corsHeaders });
        } catch (error) {
          return new Response(JSON.stringify({ 
            muted: false,
            error: 'check_failed'
          }), { headers: corsHeaders });
        }
      }
      
      // 解除禁言
      if (url.pathname === '/api/mute/remove' && request.method === 'POST') {
        try {
          const body = await request.json();
          const { ip } = body;
          
          if (!ip) {
            return new Response(JSON.stringify({ 
              success: false, 
              error: 'missing_ip' 
            }), { headers: corsHeaders, status: 400 });
          }
          
          if (env.MUTE_STORE) {
            await env.MUTE_STORE.delete(`mute:${ip}`);
          }
          
          return new Response(JSON.stringify({ 
            success: true 
          }), { headers: corsHeaders });
        } catch (error) {
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'internal_error' 
          }), { headers: corsHeaders, status: 500 });
        }
      }
      
      // 存储 clientId 到 IP 的映射（客户端在加入房间后调用）
      if (url.pathname === '/api/client-ip/set' && request.method === 'POST') {
        try {
          const body = await request.json();
          const { clientId } = body;
          
          if (clientId && env.MUTE_STORE) {
            // 使用请求的真实 IP 存储映射，24小时过期
            await env.MUTE_STORE.put(
              `client-ip:${clientId}`,
              clientIP,
              { expirationTtl: 86400 }
            );
          }
          
          return new Response(JSON.stringify({ success: true, ip: clientIP }), { headers: corsHeaders });
        } catch (error) {
          return new Response(JSON.stringify({ success: false }), { headers: corsHeaders });
        }
      }
      
      // 查询 clientId 对应的 IP（管理员使用）
      if (url.pathname === '/api/client-ip/get' && request.method === 'POST') {
        try {
          const body = await request.json();
          const { clientId } = body;
          
          if (!clientId) {
            return new Response(JSON.stringify({ ip: null }), { headers: corsHeaders });
          }
          
          let ip = null;
          if (env.MUTE_STORE) {
            ip = await env.MUTE_STORE.get(`client-ip:${clientId}`);
          }
          
          return new Response(JSON.stringify({ ip }), { headers: corsHeaders });
        } catch (error) {
          return new Response(JSON.stringify({ ip: null }), { headers: corsHeaders });
        }
      }
      
      // 获取最近连接的 IP 列表（管理员使用）
      if (url.pathname === '/api/recent-ips' && request.method === 'GET') {
        try {
          const recentIPs = [];
          if (env.MUTE_STORE) {
            const list = await env.MUTE_STORE.list({ prefix: 'recent-ip:' });
            for (const key of list.keys) {
              const ip = key.name.replace('recent-ip:', '');
              const data = await env.MUTE_STORE.get(key.name);
              if (data) {
                const info = JSON.parse(data);
                recentIPs.push({ ip, lastSeen: info.lastSeen });
              }
            }
          }
          return new Response(JSON.stringify({ 
            success: true, 
            ips: recentIPs.sort((a, b) => b.lastSeen - a.lastSeen)
          }), { headers: corsHeaders });
        } catch (error) {
          return new Response(JSON.stringify({ success: false, ips: [] }), { headers: corsHeaders });
        }
      }
      
      // 通过目标用户 IP 禁言（管理员需要传递目标 IP）
      if (url.pathname === '/api/mute/by-ip' && request.method === 'POST') {
        try {
          const body = await request.json();
          const { targetIP, duration, reason, mutedBy } = body;
          
          if (!targetIP || !duration) {
            return new Response(JSON.stringify({ 
              success: false, 
              error: 'missing_parameters' 
            }), { headers: corsHeaders, status: 400 });
          }
          
          const durationMs = duration * 1000;
          const muteData = {
            ip: targetIP,
            mutedAt: Date.now(),
            duration: durationMs,
            expiresAt: Date.now() + durationMs,
            reason: reason || '',
            mutedBy: mutedBy || 'admin'
          };
          
          if (env.MUTE_STORE) {
            await env.MUTE_STORE.put(
              `mute:ip:${targetIP}`, 
              JSON.stringify(muteData),
              { expirationTtl: Math.max(60, duration) }
            );
          }
          
          return new Response(JSON.stringify({ 
            success: true, 
            data: muteData 
          }), { headers: corsHeaders });
        } catch (error) {
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'internal_error' 
          }), { headers: corsHeaders, status: 500 });
        }
      }
      
      // 获取禁言列表（管理员）
      if (url.pathname === '/api/mute/list' && request.method === 'GET') {
        try {
          const mutedList = [];
          
          if (env.MUTE_STORE) {
            const list = await env.MUTE_STORE.list({ prefix: 'mute:' });
            for (const key of list.keys) {
              const data = await env.MUTE_STORE.get(key.name);
              if (data) {
                const muteData = JSON.parse(data);
                // 过滤已过期的
                if (muteData.expiresAt > Date.now()) {
                  mutedList.push(muteData);
                }
              }
            }
          }
          
          return new Response(JSON.stringify({ 
            success: true,
            list: mutedList 
          }), { headers: corsHeaders });
        } catch (error) {
          return new Response(JSON.stringify({ 
            success: false, 
            list: [],
            error: 'list_failed' 
          }), { headers: corsHeaders });
        }
      }
      
      // ============ 验证码 API ============
      
      // 生成验证码
      if (url.pathname === '/api/captcha/generate' && request.method === 'GET') {
        try {
          // 生成随机验证码（4位数字+字母）
          const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
          let code = '';
          for (let i = 0; i < 4; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
          }
          
          // 生成唯一ID
          const captchaId = crypto.randomUUID();
          
          // 存储验证码到 KV（5分钟过期）
          if (env.MUTE_STORE) {
            await env.MUTE_STORE.put(
              `captcha:${captchaId}`,
              code.toUpperCase(),
              { expirationTtl: 300 }
            );
          }
          
          // 生成简单的 SVG 验证码图片
          const svgCaptcha = generateCaptchaSVG(code);
          
          return new Response(JSON.stringify({
            success: true,
            captchaId: captchaId,
            image: svgCaptcha
          }), { headers: corsHeaders });
        } catch (error) {
          return new Response(JSON.stringify({
            success: false,
            error: 'captcha_generation_failed'
          }), { headers: corsHeaders, status: 500 });
        }
      }
      
      // 验证验证码
      if (url.pathname === '/api/captcha/verify' && request.method === 'POST') {
        try {
          const body = await request.json();
          const { captchaId, code } = body;
          
          if (!captchaId || !code) {
            return new Response(JSON.stringify({
              valid: false,
              error: 'missing_parameters'
            }), { headers: corsHeaders, status: 400 });
          }
          
          let storedCode = null;
          if (env.MUTE_STORE) {
            storedCode = await env.MUTE_STORE.get(`captcha:${captchaId}`);
            // 验证后删除验证码（一次性使用）
            await env.MUTE_STORE.delete(`captcha:${captchaId}`);
          }
          
          if (!storedCode) {
            return new Response(JSON.stringify({
              valid: false,
              error: 'captcha_expired'
            }), { headers: corsHeaders });
          }
          
          const isValid = storedCode.toUpperCase() === code.toUpperCase();
          
          return new Response(JSON.stringify({
            valid: isValid,
            error: isValid ? null : 'captcha_incorrect'
          }), { headers: corsHeaders });
        } catch (error) {
          return new Response(JSON.stringify({
            valid: false,
            error: 'verification_failed'
          }), { headers: corsHeaders, status: 500 });
        }
      }
      
      // ============ 房间验证 API ============
      
      // 验证房间访问
      if (url.pathname === '/api/rooms/validate' && request.method === 'POST') {
        try {
          const body = await request.json();
          const { roomName, password, adminPassword } = body;
          const rooms = getRoomsConfig(env);
          const room = rooms.find(r => r.name === roomName);
          
          if (!room) {
            return new Response(JSON.stringify({ 
              valid: false, 
              error: 'room_not_found' 
            }), { headers: corsHeaders });
          }
          
          // 检查管理员密码
          if (adminPassword && adminPassword === room.adminPassword) {
            return new Response(JSON.stringify({ 
              valid: true, 
              role: 'admin' 
            }), { headers: corsHeaders });
          }
          
          // 检查房间密码
          if (room.password !== password) {
            return new Response(JSON.stringify({ 
              valid: false, 
              error: 'wrong_password' 
            }), { headers: corsHeaders });
          }
          
          return new Response(JSON.stringify({ 
            valid: true, 
            role: 'user' 
          }), { headers: corsHeaders });
        } catch (error) {
          return new Response(JSON.stringify({ 
            valid: false, 
            error: 'invalid_request' 
          }), { headers: corsHeaders, status: 400 });
        }
      }
      
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // 其余全部交给 ASSETS 处理（自动支持 hash 文件名和 SPA fallback）
    return env.ASSETS.fetch(request);
  }
};

// 生成验证码 SVG 图片
function generateCaptchaSVG(code) {
  const width = 120;
  const height = 40;
  const chars = code.split('');
  
  // 生成随机颜色
  const randomColor = () => {
    const r = Math.floor(Math.random() * 100 + 50);
    const g = Math.floor(Math.random() * 100 + 50);
    const b = Math.floor(Math.random() * 100 + 50);
    return `rgb(${r},${g},${b})`;
  };
  
  // 生成干扰线
  let lines = '';
  for (let i = 0; i < 4; i++) {
    const x1 = Math.random() * width;
    const y1 = Math.random() * height;
    const x2 = Math.random() * width;
    const y2 = Math.random() * height;
    lines += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${randomColor()}" stroke-width="1" opacity="0.5"/>`;
  }
  
  // 生成干扰点
  let dots = '';
  for (let i = 0; i < 30; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    dots += `<circle cx="${x}" cy="${y}" r="1" fill="${randomColor()}" opacity="0.5"/>`;
  }
  
  // 生成字符
  let text = '';
  chars.forEach((char, i) => {
    const x = 15 + i * 25;
    const y = 28 + (Math.random() * 6 - 3);
    const rotate = Math.random() * 20 - 10;
    const fontSize = 22 + Math.random() * 4;
    text += `<text x="${x}" y="${y}" font-size="${fontSize}" font-family="Arial, sans-serif" font-weight="bold" fill="${randomColor()}" transform="rotate(${rotate} ${x} ${y})">${char}</text>`;
  });
  
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="100%" height="100%" fill="#f5f5f5"/>
    ${lines}
    ${dots}
    ${text}
  </svg>`;
  
  // 返回 base64 编码的 SVG
  return 'data:image/svg+xml;base64,' + btoa(svg);
}

// 从环境变量获取房间配置
// 环境变量格式：
// ROOM_1_NAME, ROOM_1_PASSWORD, ROOM_1_ADMIN_PASSWORD, ROOM_1_DESCRIPTION
// ROOM_2_NAME, ROOM_2_PASSWORD, ROOM_2_ADMIN_PASSWORD, ROOM_2_DESCRIPTION
// ...
function getRoomsConfig(env) {
  const rooms = [];
  
  // 支持最多10个房间
  for (let i = 1; i <= 10; i++) {
    const nameKey = `ROOM_${i}_NAME`;
    const name = env[nameKey];
    
    // 跳过未配置的房间
    if (!name || name === undefined || name === '') continue;
    
    rooms.push({
      id: `room${i}`,
      name: String(name),
      password: env[`ROOM_${i}_PASSWORD`] ? String(env[`ROOM_${i}_PASSWORD`]) : '',
      adminPassword: env[`ROOM_${i}_ADMIN_PASSWORD`] ? String(env[`ROOM_${i}_ADMIN_PASSWORD`]) : '',
      description: env[`ROOM_${i}_DESCRIPTION`] ? String(env[`ROOM_${i}_DESCRIPTION`]) : ''
    });
  }
  
  return rooms;
}

export class ChatRoom {  constructor(state, env) {
    this.state = state;
    
    // Use objects like original server.js instead of Maps
    this.clients = {};
    this.channels = {};
    
    this.config = {
      seenTimeout: 60000,
      debug: false
    };
    
    // Initialize RSA key pair
    this.initRSAKeyPair();
  }

  async initRSAKeyPair() {
    try {
      let stored = await this.state.storage.get('rsaKeyPair');
      if (!stored) {
        console.log('Generating new RSA keypair...');
          const keyPair = await crypto.subtle.generateKey(
          {
            name: 'RSASSA-PKCS1-v1_5',
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: 'SHA-256'
          },
          true,
          ['sign', 'verify']
        );

        // 并行导出公钥和私钥以提高性能
        const [publicKeyBuffer, privateKeyBuffer] = await Promise.all([
          crypto.subtle.exportKey('spki', keyPair.publicKey),
          crypto.subtle.exportKey('pkcs8', keyPair.privateKey)
        ]);
        
        stored = {
          rsaPublic: btoa(String.fromCharCode(...new Uint8Array(publicKeyBuffer))),
          rsaPrivateData: Array.from(new Uint8Array(privateKeyBuffer)),
          createdAt: Date.now() // 记录密钥创建时间，用于后续判断是否需要轮换
        };
        
        await this.state.storage.put('rsaKeyPair', stored);
        console.log('RSA key pair generated and stored');
      }
      
      // Reconstruct the private key
      if (stored.rsaPrivateData) {
        const privateKeyBuffer = new Uint8Array(stored.rsaPrivateData);
        
        stored.rsaPrivate = await crypto.subtle.importKey(
          'pkcs8',
          privateKeyBuffer,
          {
            name: 'RSASSA-PKCS1-v1_5',
            hash: 'SHA-256'
          },
          false,
          ['sign']
        );      }
        this.keyPair = stored;
      
      // 检查密钥是否需要轮换（如果已创建超过24小时）
      if (stored.createdAt && (Date.now() - stored.createdAt > 24 * 60 * 60 * 1000)) {
        // 如果没有任何客户端，则执行密钥轮换
        if (Object.keys(this.clients).length === 0) {
          console.log('密钥已使用24小时，进行轮换...');
          await this.state.storage.delete('rsaKeyPair');
          this.keyPair = null;
          await this.initRSAKeyPair();
        } else {
          // 否则标记需要在客户端全部断开后进行轮换
          await this.state.storage.put('pendingKeyRotation', true);
        }
      }
    } catch (error) {
      console.error('Error initializing RSA key pair:', error);
      throw error;
    }
  }

  async fetch(request) {
    // Check for WebSocket upgrade
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket Upgrade', { status: 426 });
    }

    // Ensure RSA keys are initialized
    if (!this.keyPair) {
      await this.initRSAKeyPair();
    }
    
    // 获取客户端 IP
    const clientIP = request.headers.get('X-Client-IP') || 'unknown';

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    // Accept the WebSocket connection with IP
    this.handleSession(server, clientIP);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }
  
  // WebSocket connection event handler
  async handleSession(connection, clientIP = 'unknown') {
    connection.accept();

    // 清理旧连接
    await this.cleanupOldConnections();

    const clientId = generateClientId();

    if (!clientId || this.clients[clientId]) {
      this.closeConnection(connection);
      return;
    }

    logEvent('connection', clientId, 'debug');
    
    // Store client information with IP
    this.clients[clientId] = {
      connection: connection,
      seen: getTime(),
      key: null,
      shared: null,
      channel: null,
      ip: clientIP  // 存储客户端 IP
    };

    // Send RSA public key
    try {
      logEvent('sending-public-key', clientId, 'debug');
      this.sendMessage(connection, JSON.stringify({
        type: 'server-key',
        key: this.keyPair.rsaPublic
      }));
    } catch (error) {
      logEvent('sending-public-key', error, 'error');
    }    // Handle messages
    connection.addEventListener('message', async (event) => {
      const message = event.data;

      if (!isString(message) || !this.clients[clientId]) {
        return;
      }

      this.clients[clientId].seen = getTime();

      if (message === 'ping') {
        this.sendMessage(connection, 'pong');
        return;
      }

      logEvent('message', [clientId, message], 'debug');      // Handle key exchange
      if (!this.clients[clientId].shared && message.length < 2048) {
        try {
          // Generate ECDH key pair using P-384 curve (equivalent to secp384r1)
          const keys = await crypto.subtle.generateKey(
            {
              name: 'ECDH',
              namedCurve: 'P-384'
            },
            true,
            ['deriveBits', 'deriveKey']
          );

          const publicKeyBuffer = await crypto.subtle.exportKey('raw', keys.publicKey);
          
          // Sign the public key using PKCS1 padding (compatible with original)
          const signature = await crypto.subtle.sign(
            {
              name: 'RSASSA-PKCS1-v1_5'
            },
            this.keyPair.rsaPrivate,
            publicKeyBuffer
          );

          // Convert hex string to Uint8Array for client public key
          const clientPublicKeyHex = message;
          const clientPublicKeyBytes = new Uint8Array(clientPublicKeyHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
          
          // Import client's public key
          const clientPublicKey = await crypto.subtle.importKey(
            'raw',
            clientPublicKeyBytes,
            { name: 'ECDH', namedCurve: 'P-384' },
            false,
            []
          );

          // Derive shared secret bits (equivalent to computeSecret in Node.js)
          const sharedSecretBits = await crypto.subtle.deriveBits(
            {
              name: 'ECDH',
              public: clientPublicKey
            },
            keys.privateKey,
            384 // P-384 produces 48 bytes (384 bits)
          );          // Take bytes 8-40 (32 bytes) for AES-256 key
          this.clients[clientId].shared = new Uint8Array(sharedSecretBits).slice(8, 40);

          const response = Array.from(new Uint8Array(publicKeyBuffer))
            .map(b => b.toString(16).padStart(2, '0')).join('') + 
            '|' + btoa(String.fromCharCode(...new Uint8Array(signature)));
          
          this.sendMessage(connection, response);

        } catch (error) {
          logEvent('message-key', [clientId, error], 'error');
          this.closeConnection(connection);
        }

        return;
      }

      // Handle encrypted messages
      if (this.clients[clientId].shared && message.length <= (8 * 1024 * 1024)) {
        this.processEncryptedMessage(clientId, message);
      }
    });    // Handle connection close
    connection.addEventListener('close', async (event) => {
      logEvent('close', [clientId, event], 'debug');

      const channel = this.clients[clientId].channel;

      if (channel && this.channels[channel]) {
        this.channels[channel].splice(this.channels[channel].indexOf(clientId), 1);

        if (this.channels[channel].length === 0) {
          delete(this.channels[channel]);
        } else {
          try {
            const members = this.channels[channel];

            for (const member of members) {
              const client = this.clients[member];              if (this.isClientInChannel(client, channel)) {
                this.sendMessage(client.connection, encryptMessage({
                  a: 'l',
                  p: members.filter((value) => {
                    return (value !== member ? true : false);
                  })
                }, client.shared));
              }
            }

          } catch (error) {
            logEvent('close-list', [clientId, error], 'error');
          }
        }
      }

      if (this.clients[clientId]) {
        delete(this.clients[clientId]);
      }
    });
  }
  // Process encrypted messages
  processEncryptedMessage(clientId, message) {
    let decrypted = null;

    try {
      decrypted = decryptMessage(message, this.clients[clientId].shared);

      logEvent('message-decrypted', [clientId, decrypted], 'debug');

      if (!isObject(decrypted) || !isString(decrypted.a)) {
        return;
      }

      const action = decrypted.a;

      if (action === 'j') {
        this.handleJoinChannel(clientId, decrypted);
      } else if (action === 'c') {
        this.handleClientMessage(clientId, decrypted);
      } else if (action === 'w') {
        this.handleChannelMessage(clientId, decrypted);
      }

    } catch (error) {
      logEvent('process-encrypted-message', [clientId, error], 'error');
    } finally {
      decrypted = null;
    }
  }
  // Handle channel join requests
  handleJoinChannel(clientId, decrypted) {
    if (!isString(decrypted.p) || this.clients[clientId].channel) {
      return;
    }

    try {
      const channel = decrypted.p;

      this.clients[clientId].channel = channel;

      if (!this.channels[channel]) {
        this.channels[channel] = [clientId];
      } else {
        this.channels[channel].push(clientId);
      }

      this.broadcastMemberList(channel);

    } catch (error) {
      logEvent('message-join', [clientId, error], 'error');
    }
  }
  // Handle client messages
  handleClientMessage(clientId, decrypted) {
    if (!isString(decrypted.p) || !isString(decrypted.c) || !this.clients[clientId].channel) {
      return;
    }

    try {
      const channel = this.clients[clientId].channel;
      const targetClient = this.clients[decrypted.c];

      if (this.isClientInChannel(targetClient, channel)) {
        const messageObj = {
          a: 'c',
          p: decrypted.p,
          c: clientId
        };

        const encrypted = encryptMessage(messageObj, targetClient.shared);
        this.sendMessage(targetClient.connection, encrypted);

        messageObj.p = null;
      }

    } catch (error) {
      logEvent('message-client', [clientId, error], 'error');
    }
  }  // Handle channel messages
  handleChannelMessage(clientId, decrypted) {
    if (!isObject(decrypted.p) || !this.clients[clientId].channel) {
      return;
    }
    
    try {
      const channel = this.clients[clientId].channel;
      // 过滤有效的目标成员
      const validMembers = Object.keys(decrypted.p).filter(member => {
        const targetClient = this.clients[member];
        return isString(decrypted.p[member]) && this.isClientInChannel(targetClient, channel);
      });

      // 处理所有有效的目标成员
      for (const member of validMembers) {
        const targetClient = this.clients[member];
        const messageObj = {
          a: 'c',
          p: decrypted.p[member],
          c: clientId
        };        const encrypted = encryptMessage(messageObj, targetClient.shared);
        this.sendMessage(targetClient.connection, encrypted);

        messageObj.p = null;
      }

    } catch (error) {
      logEvent('message-channel', [clientId, error], 'error');
    }
  }
  // Broadcast member list to channel
  broadcastMemberList(channel) {
    try {
      const members = this.channels[channel];

      for (const member of members) {
        const client = this.clients[member];

        if (this.isClientInChannel(client, channel)) {
          const messageObj = {
            a: 'l',
            p: members.filter((value) => {
              return (value !== member ? true : false);
            })
          };

          const encrypted = encryptMessage(messageObj, client.shared);
          this.sendMessage(client.connection, encrypted);

          messageObj.p = null;
        }
      }
    } catch (error) {
      logEvent('broadcast-member-list', error, 'error');
    }
  }  // Check if client is in channel
  isClientInChannel(client, channel) {
    return (
      client &&
      client.connection &&
      client.shared &&
      client.channel &&
      client.channel === channel ?
      true :
      false
    );
  }
  // Send message helper
  sendMessage(connection, message) {
    try {
      // In Cloudflare Workers, WebSocket.READY_STATE_OPEN is 1
      if (connection.readyState === 1) {
        connection.send(message);
      }
    } catch (error) {
      logEvent('sendMessage', error, 'error');
    }
  }  // Close connection helper
  closeConnection(connection) {
    try {
      connection.close();    } catch (error) {
      logEvent('closeConnection', error, 'error');
    }
  }
  
  // 连接清理方法
  async cleanupOldConnections() {
    const seenThreshold = getTime() - this.config.seenTimeout;
    const clientsToRemove = [];

    // 先收集需要移除的客户端，避免在迭代时修改对象
    for (const clientId in this.clients) {
      if (this.clients[clientId].seen < seenThreshold) {
        clientsToRemove.push(clientId);
      }
    }

    // 然后一次性移除所有过期客户端
    for (const clientId of clientsToRemove) {
      try {
        logEvent('connection-seen', clientId, 'debug');
        this.clients[clientId].connection.close();
        delete this.clients[clientId];
      } catch (error) {
        logEvent('connection-seen', error, 'error');      }
    }
    
    // 如果没有任何客户端和房间，检查是否需要轮换密钥
    if (Object.keys(this.clients).length === 0 && Object.keys(this.channels).length === 0) {
      const pendingRotation = await this.state.storage.get('pendingKeyRotation');
      if (pendingRotation) {
        console.log('没有活跃客户端或房间，执行密钥轮换...');
        await this.state.storage.delete('rsaKeyPair');        await this.state.storage.delete('pendingKeyRotation');
        this.keyPair = null;
        await this.initRSAKeyPair();
      }
    }
    
    return clientsToRemove.length; // 返回清理的连接数量
  }
}
