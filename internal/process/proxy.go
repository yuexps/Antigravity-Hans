package process

import (
	"errors"
	"fmt"
	"net"
	"net/netip"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// LaunchProxy 保存经过校验的固定代理。零值保留默认启动行为。
type LaunchProxy struct {
	source string
	http   string
	https  string
	all    string
}

// DetectLaunchProxy 重新读取当前代理设置，并检查各代理端口能否连接。
func DetectLaunchProxy() (LaunchProxy, error) {
	proxy, err := readLaunchProxy()
	if err != nil {
		return LaunchProxy{}, err
	}
	if err := proxy.checkReachable(); err != nil {
		return LaunchProxy{}, err
	}
	return proxy, nil
}

func (p LaunchProxy) String() string {
	return p.source + "，" + p.chromiumRules()
}

func selectLaunchProxy(manual, pac string, getenv func(string) string) (LaunchProxy, error) {
	if strings.TrimSpace(manual) != "" {
		proxy, err := parseManualProxy(manual)
		if err != nil {
			return LaunchProxy{}, fmt.Errorf("Windows 系统手动代理：%w", err)
		}
		proxy.source = "Windows 系统手动代理"
		return proxy, nil
	}

	proxy := LaunchProxy{source: "代理环境变量"}
	for _, entry := range []struct {
		key string
		dst *string
	}{{"HTTP_PROXY", &proxy.http}, {"HTTPS_PROXY", &proxy.https}, {"ALL_PROXY", &proxy.all}} {
		raw := strings.TrimSpace(getenv(entry.key))
		if raw == "" {
			continue
		}
		endpoint, err := parseProxyEndpoint(raw, "http")
		if err != nil {
			return LaunchProxy{}, fmt.Errorf("%s：%w", entry.key, err)
		}
		*entry.dst = endpoint
	}
	if proxy.http != "" || proxy.https != "" || proxy.all != "" {
		return proxy, nil
	}
	if strings.TrimSpace(pac) != "" {
		return LaunchProxy{}, errors.New("检测到 PAC 自动配置，未找到固定代理地址。请启用 Windows 手动代理或设置代理环境变量")
	}
	return LaunchProxy{}, errors.New("未找到固定代理地址。请启用 Windows 手动代理或设置代理环境变量")
}

func parseManualProxy(raw string) (LaunchProxy, error) {
	if !strings.Contains(raw, "=") {
		endpoint, err := parseProxyEndpoint(raw, "http")
		return LaunchProxy{all: endpoint}, err
	}

	var proxy LaunchProxy
	for entry := range strings.SplitSeq(raw, ";") {
		if strings.TrimSpace(entry) == "" {
			continue
		}
		key, value, _ := strings.Cut(entry, "=")
		var dst *string
		scheme := "http"
		switch strings.ToLower(strings.TrimSpace(key)) {
		case "http":
			dst = &proxy.http
		case "https":
			dst = &proxy.https
		case "socks":
			dst, scheme = &proxy.all, "socks4"
		case "ftp":
			continue
		default:
			return LaunchProxy{}, errors.New("无法识别代理协议映射")
		}
		if *dst != "" {
			return LaunchProxy{}, errors.New("代理协议映射重复")
		}
		endpoint, err := parseProxyEndpoint(value, scheme)
		if err != nil {
			return LaunchProxy{}, err
		}
		*dst = endpoint
	}
	if proxy.http == "" && proxy.https == "" && proxy.all == "" {
		return LaunchProxy{}, errors.New("未找到 HTTP、HTTPS 或 SOCKS 代理地址")
	}
	return proxy, nil
}

func parseProxyEndpoint(raw, defaultScheme string) (string, error) {
	raw = strings.TrimSpace(raw)
	if !strings.Contains(raw, "://") {
		raw = defaultScheme + "://" + raw
	}
	endpoint, err := url.Parse(raw)
	if err != nil {
		return "", errors.New("代理地址格式无效，必须包含主机和端口")
	}
	if endpoint.User != nil {
		return "", errors.New("自动代理不支持在地址中嵌入用户名或密码")
	}
	switch endpoint.Scheme {
	case "http", "https", "socks4", "socks5":
	case "socks5h":
		endpoint.Scheme = "socks5" // Chromium 的 SOCKS5 始终由代理解析 DNS。
	default:
		return "", errors.New("代理协议不受支持")
	}
	host, portText, err := net.SplitHostPort(endpoint.Host)
	port, portErr := strconv.ParseUint(portText, 10, 16)
	if err != nil || portErr != nil || port == 0 || !validProxyHost(host) ||
		(endpoint.Path != "" && endpoint.Path != "/") || strings.ContainsAny(raw, "?#") {
		return "", errors.New("代理地址格式无效，必须包含主机和有效端口")
	}
	return endpoint.Scheme + "://" + net.JoinHostPort(host, strconv.FormatUint(port, 10)), nil
}

func validProxyHost(host string) bool {
	if addr, err := netip.ParseAddr(host); err == nil {
		return addr.Zone() == ""
	}
	return host != "" && strings.IndexFunc(host, func(r rune) bool {
		return !(r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || strings.ContainsRune("._-", r))
	}) == -1
}

func (p LaunchProxy) chromiumRules() string {
	if p.http == "" && p.https == "" {
		return p.all
	}
	var rules []string
	for _, rule := range []struct{ name, endpoint string }{{"http", p.http}, {"https", p.https}, {"socks", p.all}} {
		if rule.endpoint != "" {
			rules = append(rules, rule.name+"="+rule.endpoint)
		}
	}
	return strings.Join(rules, ";")
}

func (p LaunchProxy) checkReachable() error {
	checked := make(map[string]bool)
	for _, endpoint := range []string{p.http, p.https, p.all} {
		if endpoint == "" {
			continue
		}
		_, addr, _ := strings.Cut(endpoint, "://")
		if checked[addr] {
			continue
		}
		conn, err := net.DialTimeout("tcp", addr, 2*time.Second)
		if err != nil {
			return fmt.Errorf("%s %s 无法连接，请检查代理程序是否运行：%w", p.source, endpoint, err)
		}
		_ = conn.Close()
		checked[addr] = true
	}
	return nil
}

func (p LaunchProxy) applyEnv(environ []string) []string {
	filtered := make([]string, 0, len(environ)+4)
	var bypass []string
	for _, kv := range environ {
		key, value, _ := strings.Cut(kv, "=")
		switch strings.ToUpper(key) {
		case "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY":
			continue
		case "NO_PROXY":
			if value = strings.TrimSpace(value); value != "" {
				bypass = append(bypass, value)
			}
		default:
			filtered = append(filtered, kv)
		}
	}
	bypass = append(bypass, "localhost", "127.0.0.1", "::1")
	httpProxy, httpsProxy := p.http, p.https
	if httpProxy == "" {
		httpProxy = p.all
	}
	if httpsProxy == "" {
		httpsProxy = p.all
	}
	return append(filtered, "HTTP_PROXY="+httpProxy, "HTTPS_PROXY="+httpsProxy, "ALL_PROXY="+p.all, "NO_PROXY="+strings.Join(bypass, ","))
}
