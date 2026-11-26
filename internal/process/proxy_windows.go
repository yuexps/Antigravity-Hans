package process

import (
	"fmt"
	"os"
	"unsafe"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

func readLaunchProxy() (LaunchProxy, error) {
	key, err := registry.OpenKey(registry.CURRENT_USER, `Software\Microsoft\Windows\CurrentVersion\Internet Settings`, registry.QUERY_VALUE)
	if err == registry.ErrNotExist {
		return selectLaunchProxy("", "", os.Getenv)
	}
	if err != nil {
		return LaunchProxy{}, fmt.Errorf("无法读取 Windows 系统代理：%w", err)
	}
	defer key.Close()

	var manual string
	enable, _, err := key.GetIntegerValue("ProxyEnable")
	if err != nil && err != registry.ErrNotExist {
		return LaunchProxy{}, fmt.Errorf("无法读取 ProxyEnable：%w", err)
	}
	if enable != 0 {
		manual, _, err = key.GetStringValue("ProxyServer")
		if err != nil && err != registry.ErrNotExist {
			return LaunchProxy{}, fmt.Errorf("无法读取 ProxyServer：%w", err)
		}
	}
	pac, _, _ := key.GetStringValue("AutoConfigURL")
	return selectLaunchProxy(manual, pac, os.Getenv)
}

// ShowProxyLaunchError 在无控制台的快捷方式也能看到代理启动失败原因。
func ShowProxyLaunchError(message string) {
	text, err := windows.UTF16PtrFromString(message)
	if err != nil {
		return
	}
	title, _ := windows.UTF16PtrFromString("Antigravity-Hans")
	messageBox := windows.NewLazySystemDLL("user32.dll").NewProc("MessageBoxW")
	const errorDialog = 0x00000010 | 0x00010000 // MB_ICONERROR | MB_SETFOREGROUND
	messageBox.Call(0, uintptr(unsafe.Pointer(text)), uintptr(unsafe.Pointer(title)), errorDialog)
}
