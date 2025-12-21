package app

import (
	"encoding/json"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// GeoIPInfo represents geographic information for an IP address
type GeoIPInfo struct {
	IP       string `json:"ip"`
	Country  string `json:"country"`
	Province string `json:"province"`
	City     string `json:"city"`
	ISP      string `json:"isp"`
}

// GeoIPService provides IP geolocation lookup functionality
type GeoIPService struct {
	cache      map[string]*geoIPCacheEntry
	cacheMutex sync.RWMutex
	client     *http.Client
}

type geoIPCacheEntry struct {
	info      *GeoIPInfo
	expiresAt time.Time
}

// NewGeoIPService creates a new GeoIPService instance
func NewGeoIPService() *GeoIPService {
	return &GeoIPService{
		cache: make(map[string]*geoIPCacheEntry),
		client: &http.Client{
			Timeout: 5 * time.Second,
		},
	}
}

// LookupIP looks up geographic information for an IP address
// It uses multiple free APIs with fallback
func (s *GeoIPService) LookupIP(ip string) *GeoIPInfo {
	// Check if it's a valid IP
	parsedIP := net.ParseIP(ip)
	if parsedIP == nil {
		return &GeoIPInfo{IP: ip}
	}

	// Check if it's a private/local IP
	if isPrivateIP(parsedIP) {
		return &GeoIPInfo{
			IP:       ip,
			Country:  "Local",
			Province: "Local",
			City:     "Local",
		}
	}

	// Check cache
	s.cacheMutex.RLock()
	if entry, ok := s.cache[ip]; ok && time.Now().Before(entry.expiresAt) {
		s.cacheMutex.RUnlock()
		return entry.info
	}
	s.cacheMutex.RUnlock()

	// Try multiple APIs
	info := s.tryIPAPI(ip)
	if info == nil {
		info = s.tryIPInfoIO(ip)
	}
	if info == nil {
		info = s.tryIPWhois(ip)
	}
	if info == nil {
		info = &GeoIPInfo{IP: ip}
	}

	// Cache the result
	s.cacheMutex.Lock()
	s.cache[ip] = &geoIPCacheEntry{
		info:      info,
		expiresAt: time.Now().Add(24 * time.Hour),
	}
	s.cacheMutex.Unlock()

	return info
}

// tryIPAPI tries ip-api.com (free, 45 requests per minute)
func (s *GeoIPService) tryIPAPI(ip string) *GeoIPInfo {
	resp, err := s.client.Get("http://ip-api.com/json/" + ip + "?fields=status,country,regionName,city,isp")
	if err != nil {
		return nil
	}
	defer resp.Body.Close()

	var data struct {
		Status     string `json:"status"`
		Country    string `json:"country"`
		RegionName string `json:"regionName"`
		City       string `json:"city"`
		ISP        string `json:"isp"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil
	}

	if data.Status != "success" {
		return nil
	}

	return &GeoIPInfo{
		IP:       ip,
		Country:  data.Country,
		Province: data.RegionName,
		City:     data.City,
		ISP:      data.ISP,
	}
}

// tryIPInfoIO tries ipinfo.io (free tier: 50k requests per month)
func (s *GeoIPService) tryIPInfoIO(ip string) *GeoIPInfo {
	resp, err := s.client.Get("https://ipinfo.io/" + ip + "/json")
	if err != nil {
		return nil
	}
	defer resp.Body.Close()

	var data struct {
		IP      string `json:"ip"`
		Country string `json:"country"`
		Region  string `json:"region"`
		City    string `json:"city"`
		Org     string `json:"org"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil
	}

	return &GeoIPInfo{
		IP:       ip,
		Country:  data.Country,
		Province: data.Region,
		City:     data.City,
		ISP:      data.Org,
	}
}

// tryIPWhois tries ipwhois.app (free, 10000 requests per month)
func (s *GeoIPService) tryIPWhois(ip string) *GeoIPInfo {
	resp, err := s.client.Get("https://ipwhois.app/json/" + ip)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()

	var data struct {
		Success bool   `json:"success"`
		Country string `json:"country"`
		Region  string `json:"region"`
		City    string `json:"city"`
		ISP     string `json:"isp"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil
	}

	if !data.Success {
		return nil
	}

	return &GeoIPInfo{
		IP:       ip,
		Country:  data.Country,
		Province: data.Region,
		City:     data.City,
		ISP:      data.ISP,
	}
}

// isPrivateIP checks if an IP address is private/local
func isPrivateIP(ip net.IP) bool {
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalMulticast() || ip.IsLinkLocalUnicast() {
		return true
	}
	return false
}

// ParseUserAgent extracts browser and OS information from User-Agent string
func ParseUserAgent(ua string) (browser string, os string) {
	ua = strings.ToLower(ua)

	// Detect browser
	switch {
	case strings.Contains(ua, "edg/") || strings.Contains(ua, "edge/"):
		browser = "Edge"
	case strings.Contains(ua, "chrome/") && !strings.Contains(ua, "edg/"):
		browser = "Chrome"
	case strings.Contains(ua, "firefox/"):
		browser = "Firefox"
	case strings.Contains(ua, "safari/") && !strings.Contains(ua, "chrome/"):
		browser = "Safari"
	case strings.Contains(ua, "opera/") || strings.Contains(ua, "opr/"):
		browser = "Opera"
	case strings.Contains(ua, "msie") || strings.Contains(ua, "trident/"):
		browser = "Internet Explorer"
	default:
		browser = "Unknown"
	}

	// Detect OS
	switch {
	case strings.Contains(ua, "windows nt 10"):
		os = "Windows 10/11"
	case strings.Contains(ua, "windows nt 6.3"):
		os = "Windows 8.1"
	case strings.Contains(ua, "windows nt 6.2"):
		os = "Windows 8"
	case strings.Contains(ua, "windows nt 6.1"):
		os = "Windows 7"
	case strings.Contains(ua, "windows"):
		os = "Windows"
	case strings.Contains(ua, "mac os x"):
		os = "macOS"
	case strings.Contains(ua, "android"):
		os = "Android"
	case strings.Contains(ua, "iphone") || strings.Contains(ua, "ipad"):
		os = "iOS"
	case strings.Contains(ua, "linux"):
		os = "Linux"
	default:
		os = "Unknown"
	}

	return browser, os
}
