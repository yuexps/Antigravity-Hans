//go:build linux

package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"syscall"

	"github.com/shirou/gopsutil/v4/process"
)

type linuxProcInfo struct {
	PID             int32
	PPID            int32
	UID             int
	HasUID          bool
	Name            string
	Exe             string
	Cmdline         []string
	CmdlineReadable bool
	RunAsNode       bool
}

// requestGracefulQuit 在 Linux 上筛选目标应用的 Electron 主进程并发送 SIGTERM，
// 让应用执行正常的保存与热退出（before-quit / hot exit）流程。
// 绝不向 --type=... 子进程（renderer/gpu/zygote/utility/broker）或 Node sidecar 发信号。
func requestGracefulQuit(cfg AppConfig) error {
	return requestLinuxGracefulQuitWith(cfg, syscall.Kill)
}

func requestLinuxGracefulQuitWith(cfg AppConfig, signalFn func(pid int, sig syscall.Signal) error) error {
	currentUID := os.Getuid()
	procs, err := collectLinuxProcInfos(cfg, currentUID)
	if err != nil {
		return fmt.Errorf("枚举系统进程失败: %w", err)
	}

	mainPIDs := selectLinuxMainProcessPIDs(procs, cfg, currentUID, int32(os.Getpid()))
	if len(mainPIDs) == 0 {
		return fmt.Errorf("未找到正在运行的 %s 主进程", cfg.Name)
	}

	var signaled, exited int
	var lastErr error
	for _, pid := range mainPIDs {
		if err := signalFn(int(pid), syscall.SIGTERM); err != nil {
			if errors.Is(err, syscall.ESRCH) {
				exited++
				continue
			}
			lastErr = err
			continue
		}
		signaled++
	}
	if signaled == 0 {
		if exited > 0 && lastErr == nil {
			return nil
		}
		if lastErr != nil {
			return fmt.Errorf("向 %s 主进程发送退出信号失败: %w", cfg.Name, lastErr)
		}
		return fmt.Errorf("未找到可发送退出信号的 %s 主进程", cfg.Name)
	}
	return nil
}

func collectLinuxProcInfos(cfg AppConfig, currentUID int) ([]linuxProcInfo, error) {
	allProcs, err := process.Processes()
	if err != nil {
		return nil, err
	}

	infos := make([]linuxProcInfo, 0, len(allProcs))
	for _, p := range allProcs {
		info := linuxProcInfo{
			PID: p.Pid,
		}
		if ppid, err := p.Ppid(); err == nil {
			info.PPID = ppid
		}
		if uids, err := p.Uids(); err == nil && len(uids) > 0 {
			info.UID = int(uids[0])
			info.HasUID = true
		}

		// 仅对当前 UID 的候选进程读取 Name/Exe/Cmdline/Environ，兼顾安全性与开销，
		// 同时保留全部进程的 PID->PPID 映射以便跨中间进程（如 language_server）回溯祖先。
		if info.HasUID && info.UID == currentUID {
			info.Name, _ = p.Name()
			info.Exe, _ = p.Exe()
			if isProcessMatch(info.Name, info.Exe, cfg) && !isLinuxZombie(p) {
				if cmdline, err := p.CmdlineSlice(); err == nil {
					info.Cmdline = cmdline
					info.CmdlineReadable = true
				}
				if envs, err := p.Environ(); err == nil {
					info.RunAsNode = hasElectronRunAsNode(envs)
				}
			}
		}
		infos = append(infos, info)
	}
	return infos, nil
}

func selectLinuxMainProcessPIDs(procs []linuxProcInfo, cfg AppConfig, currentUID int, selfPID int32) []int32 {
	parentByPID := make(map[int32]int32, len(procs))
	matched := make(map[int32]linuxProcInfo)

	for _, p := range procs {
		if p.PID <= 0 {
			continue
		}
		parentByPID[p.PID] = p.PPID

		if p.PID == selfPID || !p.HasUID || p.UID != currentUID {
			continue
		}
		if !isProcessMatch(p.Name, p.Exe, cfg) {
			continue
		}
		if !isLinuxSignalingTargetExe(p.Exe, cfg) {
			continue
		}
		matched[p.PID] = p
	}

	var mainPIDs []int32
	for pid, p := range matched {
		if !p.CmdlineReadable || len(p.Cmdline) == 0 {
			continue
		}
		if hasChromiumTypeArg(p.Cmdline) {
			continue
		}
		if p.RunAsNode {
			continue
		}
		if hasMatchedAncestor(p.PPID, parentByPID, matched) {
			continue
		}
		mainPIDs = append(mainPIDs, pid)
	}

	sort.Slice(mainPIDs, func(i, j int) bool { return mainPIDs[i] < mainPIDs[j] })
	return mainPIDs
}

func isLinuxSignalingTargetExe(rawExe string, cfg AppConfig) bool {
	cleanExe := strings.TrimSuffix(rawExe, " (deleted)")
	if cleanExe == "" {
		return false
	}
	if realExe, err := filepath.EvalSymlinks(cleanExe); err == nil {
		if isExpectedExecutable(filepath.Clean(realExe), cfg) {
			return true
		}
	}
	if isExpectedExecutable(filepath.Clean(cleanExe), cfg) {
		return true
	}
	// 兼容运行期间包管理器升级导致旧二进制被标记为 " (deleted)" 且原路径暂不存在的场景
	if strings.HasSuffix(rawExe, " (deleted)") {
		base := filepath.Base(cleanExe)
		if isAntigravityConfig(cfg) {
			isIDE := isTargetIDE(cfg)
			kind := classifyLinuxInstallDir(filepath.Dir(cleanExe))
			if isIDE && kind == linuxAppNormal {
				return false
			}
			if !isIDE && kind == linuxAppIDE {
				return false
			}
			if isLinuxAppImageFilename(base, isIDE) {
				return true
			}
			if isIDE && strings.EqualFold(base, "antigravity") && kind == linuxAppIDE {
				return true
			}
		}
		return strings.EqualFold(base, cfg.Exe)
	}
	return false
}

func hasChromiumTypeArg(cmdline []string) bool {
	for _, arg := range cmdline {
		if arg == "--type" || strings.HasPrefix(arg, "--type=") {
			return true
		}
	}
	return false
}

func hasElectronRunAsNode(envs []string) bool {
	for _, kv := range envs {
		if val, ok := strings.CutPrefix(kv, "ELECTRON_RUN_AS_NODE="); ok {
			val = strings.TrimSpace(val)
			return val != "" && val != "0"
		}
	}
	return false
}

func hasMatchedAncestor(ppid int32, parentByPID map[int32]int32, matched map[int32]linuxProcInfo) bool {
	seen := make(map[int32]bool)
	cur := ppid
	for depth := 0; depth < 64 && cur > 0 && !seen[cur]; depth++ {
		if _, ok := matched[cur]; ok {
			return true
		}
		seen[cur] = true
		next, ok := parentByPID[cur]
		if !ok {
			break
		}
		cur = next
	}
	return false
}
