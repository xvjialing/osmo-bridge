package platform

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Foundation -framework CoreWLAN
#include <stdlib.h>
char *ob_wifi_ssid(void);
char *ob_wifi_join(const char *, const char *);
*/
import "C"

import (
	"context"
	"errors"
	"os/exec"
	"strings"
	"unsafe"
)

func CurrentSSID() string {
	s := C.ob_wifi_ssid()
	if s == nil {
		return ""
	}
	defer C.free(unsafe.Pointer(s))
	return C.GoString(s)
}
func JoinWiFi(ssid, password string) error {
	s, p := C.CString(ssid), C.CString(password)
	defer C.free(unsafe.Pointer(s))
	defer C.free(unsafe.Pointer(p))
	e := C.ob_wifi_join(s, p)
	if e != nil {
		defer C.free(unsafe.Pointer(e))
		return errors.New(C.GoString(e))
	}
	return nil
}
func RestoreWiFi(ctx context.Context, ssid string) error {
	if ssid == "" {
		return errors.New("未能读取原 Wi-Fi 名称，请通过 macOS 菜单栏手动恢复网络")
	}
	// 仅传网络名称，密码由系统钥匙串处理。
	data, err := exec.CommandContext(ctx, "/usr/sbin/networksetup", "-listallhardwareports").Output()
	if err != nil {
		return err
	}
	lines := strings.Split(string(data), "\n")
	device := ""
	for i, l := range lines {
		if strings.Contains(l, "Wi-Fi") && i+1 < len(lines) {
			device = strings.TrimSpace(strings.TrimPrefix(lines[i+1], "Device:"))
			break
		}
	}
	if device == "" {
		return errors.New("无法识别 Wi-Fi 网卡，请手动恢复网络")
	}
	out, err := exec.CommandContext(ctx, "/usr/sbin/networksetup", "-setairportnetwork", device, ssid).CombinedOutput()
	if err != nil || strings.Contains(string(out), "Could not") || strings.Contains(string(out), "Failed") {
		return errors.New("恢复原 Wi-Fi 失败，请通过 macOS 菜单栏重新连接")
	}
	return nil
}
