package cdp

import (
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
)

const (
	maxCDPJSONSize    = 1 << 20
	maxCDPMessageSize = 8 << 20
)

var (
	cdpIDCounter  atomic.Int64
	cdpHTTPClient = &http.Client{
		Timeout:       500 * time.Millisecond,
		Transport:     &http.Transport{Proxy: nil, DialContext: (&net.Dialer{Timeout: 500 * time.Millisecond}).DialContext, IdleConnTimeout: 30 * time.Second},
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse },
	}
)

func readCDPJSON(port int, endpoint string, dst interface{}) error {
	if port <= 0 || port > 65535 {
		return fmt.Errorf("无效的 CDP 端口")
	}
	resp, err := cdpHTTPClient.Get(fmt.Sprintf("http://127.0.0.1:%d%s", port, endpoint))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("CDP HTTP 状态码: %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxCDPJSONSize+1))
	if err != nil {
		return err
	}
	if len(body) > maxCDPJSONSize {
		return fmt.Errorf("CDP 响应超出体积上限")
	}
	return json.Unmarshal(body, dst)
}

func isLoopbackHost(host string) bool {
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func validateCDPWebSocket(raw string, expectedPort int) (string, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return "", err
	}
	port, err := strconv.Atoi(u.Port())
	if err != nil || port != expectedPort || port <= 0 || port > 65535 || u.Scheme != "ws" ||
		(u.Hostname() != "127.0.0.1" && !strings.EqualFold(u.Hostname(), "localhost")) || u.User != nil || u.RawQuery != "" || u.Fragment != "" ||
		(!strings.HasPrefix(u.Path, "/devtools/page/") && !strings.HasPrefix(u.Path, "/devtools/browser/")) {
		return "", fmt.Errorf("拒绝调试端口之外的 WebSocket 地址")
	}
	// 固定使用 127.0.0.1，避免经由 DNS 解析或代理连接。
	if strings.EqualFold(u.Hostname(), "localhost") {
		u.Host = net.JoinHostPort("127.0.0.1", u.Port())
	}
	return u.String(), nil
}

func dialCDP(raw string, port int) (*websocket.Conn, *http.Response, error) {
	validated, err := validateCDPWebSocket(raw, port)
	if err != nil {
		return nil, nil, err
	}
	dialer := websocket.Dialer{HandshakeTimeout: 3 * time.Second, Proxy: nil, NetDialContext: (&net.Dialer{Timeout: 3 * time.Second}).DialContext}
	conn, resp, err := dialer.Dial(validated, nil)
	if err == nil {
		conn.SetReadLimit(maxCDPMessageSize)
	}
	return conn, resp, err
}

// cdpCall 发送 CDP 命令并等待匹配 ID 的响应。
func cdpCall(conn *websocket.Conn, method string, params map[string]interface{}) (map[string]interface{}, error) {
	id := cdpIDCounter.Add(1)
	payload := map[string]interface{}{
		"id":     id,
		"method": method,
		"params": params,
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	if err := conn.SetWriteDeadline(time.Now().Add(5 * time.Second)); err != nil {
		return nil, err
	}
	if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
		return nil, fmt.Errorf("发送 CDP 消息失败: %w", err)
	}

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		conn.SetReadDeadline(deadline)
		_, msg, err := conn.ReadMessage()
		if err != nil {
			return nil, fmt.Errorf("接收 CDP 响应失败: %w", err)
		}
		var resp map[string]interface{}
		if err := json.Unmarshal(msg, &resp); err != nil {
			continue
		}
		if respID, ok := resp["id"]; ok && matchesCDPID(respID, id) {
			if err := cdpResponseError(resp, method); err != nil {
				return nil, err
			}
			return resp, nil
		}
	}
	return nil, fmt.Errorf("等待 %s 响应超时", method)
}

func matchesCDPID(respID interface{}, id int64) bool {
	switch v := respID.(type) {
	case float64:
		return int64(v) == id
	case string:
		return v == strconv.FormatInt(id, 10)
	default:
		return false
	}
}

// cdpResponseError 将 CDP 协议错误和 Runtime.evaluate 的 JS 异常统一转换为 Go 错误。
func cdpResponseError(resp map[string]interface{}, method string) error {
	if protocolErr, ok := resp["error"].(map[string]interface{}); ok {
		message, _ := protocolErr["message"].(string)
		if message == "" {
			message = fmt.Sprint(protocolErr)
		}
		return fmt.Errorf("CDP %s 失败: %s", method, message)
	}

	result, ok := resp["result"].(map[string]interface{})
	if !ok {
		return nil
	}
	if exception, ok := result["exceptionDetails"].(map[string]interface{}); ok {
		description, _ := exception["text"].(string)
		if description == "" {
			if value, ok := exception["exception"].(map[string]interface{}); ok {
				description, _ = value["description"].(string)
			}
		}
		if description == "" {
			description = fmt.Sprint(exception)
		}
		return fmt.Errorf("Runtime.evaluate 执行异常: %s", description)
	}
	return nil
}
