// Ping Worker - runs in Web Worker context, not affected by page visibility or file picker
// Ping Worker - 在 Web Worker 中运行，不受页面可见性或文件选择器影响

let wsRef = null;
let pingInterval = null;

self.onmessage = function(e) {
	const { type, interval } = e.data;
	
	if (type === 'start') {
		if (pingInterval) clearInterval(pingInterval);
		pingInterval = setInterval(() => {
			self.postMessage('ping');
		}, interval || 15000);
	} else if (type === 'stop') {
		if (pingInterval) {
			clearInterval(pingInterval);
			pingInterval = null;
		}
	}
};
