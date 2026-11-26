//go:build !windows

package process

import "errors"

func readLaunchProxy() (LaunchProxy, error) {
	return LaunchProxy{}, errors.New("自动代理启动仅支持 Windows")
}

func ShowProxyLaunchError(_ string) {}
