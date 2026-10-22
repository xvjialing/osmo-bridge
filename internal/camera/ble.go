package camera

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"tinygo.org/x/bluetooth"
)

type Device struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	RSSI int16  `json:"rssi"`
}
type Bluetooth struct {
	mu      sync.Mutex
	enabled bool
	devices map[string]bluetooth.ScanResult
}

func (b *Bluetooth) Scan(ctx context.Context) ([]Device, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	a := bluetooth.DefaultAdapter
	if !b.enabled {
		if err := a.Enable(); err != nil {
			return nil, fmt.Errorf("蓝牙不可用，请在系统设置中允许映桥使用蓝牙：%w", err)
		}
		b.enabled = true
	}
	items := []Device{}
	b.devices = map[string]bluetooth.ScanResult{}
	var guard sync.Mutex
	done := make(chan error, 1)
	go func() {
		done <- a.Scan(func(_ *bluetooth.Adapter, r bluetooth.ScanResult) {
			match := strings.Contains(strings.ToLower(r.LocalName()), "osmo")
			for _, d := range r.ManufacturerData() {
				if d.CompanyID == 0x08aa {
					match = true
				}
			}
			if !match {
				return
			}
			guard.Lock()
			defer guard.Unlock()
			id := r.Address.String()
			if _, ok := b.devices[id]; ok {
				return
			}
			b.devices[id] = r
			name := r.LocalName()
			if name == "" {
				name = "DJI 相机"
			}
			items = append(items, Device{id, name, r.RSSI})
		})
	}()
	select {
	case err := <-done:
		return items, err
	case <-ctx.Done():
	case <-time.After(8 * time.Second):
	}
	_ = a.StopScan()
	err := <-done
	guard.Lock()
	defer guard.Unlock()
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	return items, err
}

type BLESession struct {
	device bluetooth.Device
	write  bluetooth.DeviceCharacteristic
	mu     sync.Mutex
	cancel context.CancelFunc
	done   chan struct{}
}

func (s *BLESession) send(m Message) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, e := s.write.WriteWithoutResponse(m.Encode())
	return e
}
func (s *BLESession) Close() {
	if s == nil {
		return
	}
	s.cancel()
	<-s.done
	_ = s.device.Disconnect()
}

func (b *Bluetooth) Pair(ctx context.Context, id, identity string, stage func(string)) (session *BLESession, ssid, password string, err error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	result, ok := b.devices[id]
	if !ok {
		return nil, "", "", errors.New("请选择扫描列表中的相机")
	}
	d, err := bluetooth.DefaultAdapter.Connect(result.Address, bluetooth.ConnectionParams{})
	if err != nil {
		return nil, "", "", fmt.Errorf("蓝牙连接失败：%w", err)
	}
	s := &BLESession{device: d, done: make(chan struct{})}
	runCtx, cancel := context.WithCancel(context.Background())
	s.cancel = cancel
	success := false
	running := false
	defer func() {
		if !success {
			cancel()
			if running {
				<-s.done
			}
			_ = d.Disconnect()
		}
	}()
	services, e := d.DiscoverServices(nil)
	if e != nil {
		return nil, "", "", e
	}
	var control bluetooth.DeviceCharacteristic
	haveControl, haveData := false, false
	for _, service := range services {
		chars, e := service.DiscoverCharacteristics(nil)
		if e != nil {
			continue
		}
		for _, c := range chars {
			u := c.UUID().String()
			if strings.HasPrefix(u, "0000fff4") {
				control = c
				haveControl = true
			}
			if strings.HasPrefix(u, "0000fff5") {
				s.write = c
				haveData = true
			}
		}
	}
	if !haveControl || !haveData {
		return nil, "", "", errors.New("该设备未提供兼容的 Osmo 蓝牙服务")
	}
	inbox := make(chan Message, 128)
	for _, c := range []bluetooth.DeviceCharacteristic{control, s.write} {
		var r Reader
		var mu sync.Mutex
		err = c.EnableNotifications(func(data []byte) {
			mu.Lock()
			defer mu.Unlock()
			for _, m := range r.Feed(data) {
				select {
				case inbox <- m:
				default:
				}
			}
		})
		if err != nil {
			return nil, "", "", fmt.Errorf("订阅相机蓝牙通知失败：%w", err)
		}
	}
	if _, err = control.Write([]byte{1, 0}); err != nil {
		return nil, "", "", err
	}
	time.Sleep(200 * time.Millisecond)
	if err = s.send(Message{2, 0xf0, 0x8100, 0x40, 0, 0x2b, []byte{4, 0}}); err != nil {
		return nil, "", "", err
	}
	time.Sleep(120 * time.Millisecond)
	if err = s.send(Pairing(identity)); err != nil {
		return nil, "", "", err
	}
	stage("请在相机屏幕上确认 OSMO 配对请求")
	approval := time.NewTimer(45 * time.Second)
	defer approval.Stop()
	paired := false
	answer := func(m Message) {
		if m.Flags&0xc0 == 0x40 {
			p := m.Payload
			if m.Set == 0 && m.ID == 0x81 {
				p = appInfo()
			}
			_ = s.send(Message{2, m.Sender, m.Seq, 0xc0, m.Set, m.ID, p})
		}
	}
	for !paired {
		select {
		case <-ctx.Done():
			return nil, "", "", ctx.Err()
		case <-approval.C:
			return nil, "", "", errors.New("配对确认超时，请重新连接并在相机屏幕上确认")
		case m := <-inbox:
			answer(m)
			if m.Set == 7 && m.ID == 0x45 && len(m.Payload) >= 2 && m.Payload[1] == 1 {
				paired = true
			}
			if m.Set == 7 && m.ID == 0x46 {
				if len(m.Payload) > 0 && m.Payload[0] == 1 {
					paired = true
				} else {
					return nil, "", "", errors.New("相机拒绝了配对请求")
				}
			}
		}
	}
	_ = s.send(Message{2, 0x1c, 0x8101, 0x40, 0x53, 0x10, []byte{0, 0, 0, 0}})
	// 保活持续至用户断开，相机热点才不会因蓝牙空闲而休眠。
	running = true
	go func() {
		defer close(s.done)
		t := time.NewTicker(time.Second)
		defer t.Stop()
		for {
			select {
			case <-runCtx.Done():
				return
			case <-t.C:
				_ = s.send(Message{2, 0xf0, 0x8102, 0x40, 0, 0x2b, []byte{1, 1}})
			}
		}
	}()
	stage("正在获取相机 Wi-Fi 信息")
	for attempt := 0; attempt < 3 && (ssid == "" || password == ""); attempt++ {
		_ = s.send(Message{2, 7, uint16(0x8200 + attempt*2), 0x40, 7, 7, nil})
		time.Sleep(200 * time.Millisecond)
		_ = s.send(Message{2, 7, uint16(0x8201 + attempt*2), 0x40, 7, 0x0e, nil})
		t := time.NewTimer(4 * time.Second)
	readCredentials:
		for {
			select {
			case <-ctx.Done():
				t.Stop()
				return nil, "", "", ctx.Err()
			case <-t.C:
				break readCredentials
			case m := <-inbox:
				answer(m)
				p := m.Payload
				if m.Set == 7 && (m.ID == 7 || m.ID == 0x0e) && len(p) >= 2 && p[0] == 0 && int(p[1])+2 <= len(p) {
					v := string(p[2 : 2+int(p[1])])
					if m.ID == 7 {
						ssid = v
					} else {
						password = v
					}
				}
				if ssid != "" && password != "" {
					t.Stop()
					break readCredentials
				}
			}
		}
	}
	if ssid == "" || password == "" {
		return nil, "", "", errors.New("未能取得相机热点信息，可在相机设置中查看并手动加入热点")
	}
	// 后续请求继续应答，但凭据不进入日志和应用状态。
	go func() {
		for {
			select {
			case <-runCtx.Done():
				return
			case m := <-inbox:
				answer(m)
			}
		}
	}()
	success = true
	return s, ssid, password, nil
}
