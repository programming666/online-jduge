/**
 * IP Detection Utility
 * Provides multi-layer IP acquisition strategy:
 * 1. Primary: WebRTC for real public IP detection
 * 2. Fallback: HTTP-based IP detection services
 */

// List of free IP detection services for fallback
const IP_SERVICES = [
  'https://api.ipify.org?format=json',
  'https://ipinfo.io/json',
  'https://api.ip.sb/jsonip',
];

/**
 * Get public IP address using WebRTC
 * WebRTC can bypass proxies and VPNs in some cases to get the real public IP
 * @returns {Promise<string|null>} The detected IP address or null if failed
 */
export async function getIPViaWebRTC() {
  return new Promise((resolve) => {
    // Check if RTCPeerConnection is available
    const RTCPeerConnection = window.RTCPeerConnection ||
                              window.mozRTCPeerConnection ||
                              window.webkitRTCPeerConnection;
    
    if (!RTCPeerConnection) {
      console.log('WebRTC not supported');
      resolve(null);
      return;
    }

    const config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
      ]
    };

    let pc;
    try {
      pc = new RTCPeerConnection(config);
    } catch (e) {
      console.log('Failed to create RTCPeerConnection:', e);
      resolve(null);
      return;
    }

    const ips = new Set();
    let resolved = false;
    
    // Set timeout to avoid hanging
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        pc.close();
        // Return the first public IP found, or null
        const publicIPs = Array.from(ips).filter(ip => isPublicIP(ip));
        resolve(publicIPs.length > 0 ? publicIPs[0] : null);
      }
    }, 3000);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const candidate = event.candidate.candidate;
        // Extract IP from candidate string
        const ipMatch = candidate.match(/(\d{1,3}\.){3}\d{1,3}/);
        if (ipMatch) {
          const ip = ipMatch[0];
          if (isPublicIP(ip) && !ips.has(ip)) {
            ips.add(ip);
            // If we found a public IP, resolve immediately
            if (!resolved && isPublicIP(ip)) {
              resolved = true;
              clearTimeout(timeout);
              pc.close();
              resolve(ip);
            }
          }
        }
        // Also check for IPv6
        const ipv6Match = candidate.match(/([a-fA-F0-9:]+:+)+[a-fA-F0-9]+/);
        if (ipv6Match) {
          const ip = ipv6Match[0];
          if (!isPrivateIPv6(ip) && !ips.has(ip)) {
            ips.add(ip);
          }
        }
      }
    };

    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === 'complete' && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        pc.close();
        const publicIPs = Array.from(ips).filter(ip => isPublicIP(ip));
        resolve(publicIPs.length > 0 ? publicIPs[0] : null);
      }
    };

    // Create data channel to trigger ICE gathering
    try {
      pc.createDataChannel('');
      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .catch(() => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            resolve(null);
          }
        });
    } catch (e) {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve(null);
      }
    }
  });
}

/**
 * Get public IP address using HTTP request to IP detection services
 * @returns {Promise<string|null>} The detected IP address or null if all services failed
 */
export async function getIPViaHTTP() {
  for (const service of IP_SERVICES) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(service, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        },
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        const ip = data.ip || data.query || data.origin;
        if (ip) {
          return ip;
        }
      }
    } catch (e) {
      console.log(`IP service ${service} failed:`, e.message);
      continue;
    }
  }
  return null;
}

/**
 * Get public IP address using multi-layer strategy
 * Priority: WebRTC > HTTP services
 * @returns {Promise<string|null>} The detected IP address or null if all methods failed
 */
export async function getPublicIP() {
  // Try WebRTC first (more accurate, can bypass some proxies)
  let ip = await getIPViaWebRTC();
  if (ip) {
    console.log('Got IP via WebRTC:', ip);
    return ip;
  }
  
  // Fallback to HTTP services
  ip = await getIPViaHTTP();
  if (ip) {
    console.log('Got IP via HTTP service:', ip);
    return ip;
  }
  
  console.log('Failed to detect public IP');
  return null;
}

/**
 * Check if an IP address is a public IP (not private/local)
 * @param {string} ip The IP address to check
 * @returns {boolean} True if the IP is public
 */
function isPublicIP(ip) {
  if (!ip) return false;
  
  // Check for private IP ranges
  const privateRanges = [
    /^10\./,                     // 10.0.0.0 - 10.255.255.255
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,  // 172.16.0.0 - 172.31.255.255
    /^192\.168\./,               // 192.168.0.0 - 192.168.255.255
    /^127\./,                    // 127.0.0.0 - 127.255.255.255 (loopback)
    /^169\.254\./,               // 169.254.0.0 - 169.254.255.255 (link-local)
    /^0\./,                      // 0.0.0.0 - 0.255.255.255
  ];
  
  return !privateRanges.some(range => range.test(ip));
}

/**
 * Check if an IPv6 address is private
 * @param {string} ip The IPv6 address to check
 * @returns {boolean} True if the IP is private
 */
function isPrivateIPv6(ip) {
  if (!ip) return true;
  
  // fe80:: is link-local
  // fc00:: and fd00:: are unique local addresses
  // ::1 is loopback
  const privateRanges = [
    /^fe80:/i,
    /^fc00:/i,
    /^fd00:/i,
    /^::1$/i,
  ];
  
  return privateRanges.some(range => range.test(ip));
}

/**
 * Cache the detected IP to avoid repeated lookups
 */
let cachedIP = null;
let cacheTime = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Get public IP with caching
 * @param {boolean} forceRefresh Force refresh the cached IP
 * @returns {Promise<string|null>} The detected IP address
 */
export async function getCachedPublicIP(forceRefresh = false) {
  const now = Date.now();
  
  if (!forceRefresh && cachedIP && cacheTime && (now - cacheTime) < CACHE_DURATION) {
    return cachedIP;
  }
  
  cachedIP = await getPublicIP();
  cacheTime = now;
  return cachedIP;
}

export default {
  getIPViaWebRTC,
  getIPViaHTTP,
  getPublicIP,
  getCachedPublicIP,
};
