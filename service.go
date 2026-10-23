package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"osmobridge/internal/camera"
	"osmobridge/internal/diagnostics"
	"osmobridge/internal/transfer"
)

type Task struct {
	ID       string            `json:"id"`
	Media    camera.Media      `json:"media"`
	Device   string            `json:"device"`
	Root     string            `json:"root"`
	Status   string            `json:"status"`
	Progress transfer.Progress `json:"progress"`
	Error    string            `json:"error"`
	Path     string            `json:"path"`
	SHA256   string            `json:"sha256"`
}
type State struct {
	WiFiNetworks []WiFiCandidate `json:"wifiNetworks"`
	Phase        string          `json:"phase"`
	Message      string          `json:"message"`
	Warning      string          `json:"warning"`
	DeviceName   string          `json:"deviceName"`
	SSID         string          `json:"ssid"`
	Destination  string          `json:"destination"`
	Media        []camera.Media  `json:"media"`
	Tasks        []Task          `json:"tasks"`
	Busy         bool            `json:"busy"`
}
type config struct {
	Identity    string `json:"identity"`
	Destination string `json:"destination"`
	Tasks       []Task `json:"tasks"`
}

type BridgeService struct {
	mu                                           sync.Mutex
	op                                           sync.Mutex
	state                                        State
	identity, configFile, deviceID, previousSSID string
	switched                                     bool
	bluetooth                                    camera.Bluetooth
	ble                                          bleConnection
	link                                         mediaConnection
	cancelOp                                     context.CancelFunc
	cancelDownload                               context.CancelFunc
	workerDone                                   chan struct{}
	worker                                       bool
	app                                          *application.App
	client                                       *http.Client
	logs                                         *diagnostics.Store
	connectionID                                 string
	lostLogged                                   bool
	connection                                   connectionActions
	credentials                                  credentialStore
	wifiHint                                     string
	deviceNames                                  map[string]string
}

func NewBridgeService() *BridgeService {
	home, _ := os.UserHomeDir()
	base := os.Getenv("OSMO_BRIDGE_DATA")
	if base == "" {
		base, _ = os.UserConfigDir()
		base = filepath.Join(base, "OsmoBridge")
	}
	s := &BridgeService{state: State{Phase: "disconnected", Message: "连接相机，开始导入原始素材", Destination: filepath.Join(home, "Movies", "OsmoBridge"), Media: []camera.Media{}, Tasks: []Task{}}, configFile: filepath.Join(base, "settings.json"), client: transfer.Client()}
	s.logs = diagnostics.New(base)
	s.initConnectionActions()
	var c config
	if b, err := os.ReadFile(s.configFile); err == nil && json.Unmarshal(b, &c) == nil {
		s.identity = c.Identity
		if filepath.IsAbs(c.Destination) {
			s.state.Destination = c.Destination
		}
		for _, t := range c.Tasks {
			if t.Status == "downloading" || t.Status == "queued" {
				t.Status = "paused"
			}
			t.Progress.Speed = 0
			s.state.Tasks = append(s.state.Tasks, t)
		}
	}
	if len(s.identity) != 32 {
		var b [16]byte
		_, _ = rand.Read(b[:])
		s.identity = hex.EncodeToString(b[:])
	}
	s.logs.RegisterSecrets(s.identity)
	s.logs.Record("info", "app", "app.start", "应用已启动，离线诊断日志已开启", map[string]string{"version": "0.1.0", "go": runtime.Version(), "os": runtime.GOOS, "arch": runtime.GOARCH})
	return s
}

func (s *BridgeService) saveLocked() error {
	if err := os.MkdirAll(filepath.Dir(s.configFile), 0700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(config{s.identity, s.state.Destination, s.state.Tasks}, "", "  ")
	if err != nil {
		return err
	}
	if err = os.WriteFile(s.configFile+".tmp", data, 0600); err != nil {
		return err
	}
	return os.Rename(s.configFile+".tmp", s.configFile)
}
func (s *BridgeService) saveStatusLocked() {
	if err := s.saveLocked(); err != nil {
		s.state.Warning = "本地记录保存失败：" + err.Error()
		s.logs.Record("error", "app", "config.save_failed", "本地配置保存失败", map[string]string{"error": err.Error()})
	}
}

func (s *BridgeService) GetState() State {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := s.state
	out.WiFiNetworks = append([]WiFiCandidate{}, s.state.WiFiNetworks...)
	out.Media = append([]camera.Media{}, s.state.Media...)
	out.Tasks = append([]Task{}, s.state.Tasks...)
	if s.link != nil && out.Phase == "connected" && !s.link.Alive() {
		if !s.lostLogged {
			s.logs.Record("warn", "connection", "connection.lost", "相机心跳超时，连接已中断", map[string]string{"connection_id": s.connectionID})
			s.lostLogged = true
		}
		out.Phase = "lost"
		out.Message = "相机连接已中断，请暂停传输后重新连接"
	} else if s.link != nil && s.lostLogged && out.Phase == "connected" {
		s.lostLogged = false
		s.logs.Record("info", "connection", "connection.heartbeat_recovered", "相机心跳已恢复", map[string]string{"connection_id": s.connectionID})
	}
	return out
}

func (s *BridgeService) Scan() ([]camera.Device, error) {
	if !s.op.TryLock() {
		return nil, errors.New("正在处理相机连接，请稍候")
	}
	defer s.op.Unlock()
	s.mu.Lock()
	if s.link != nil || s.ble != nil || pendingPhase(s.state.Phase) {
		s.mu.Unlock()
		return nil, errors.New("请先继续或取消当前相机连接")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
	s.cancelOp = cancel
	s.state.Busy = true
	s.state.Message = "正在搜索附近的 DJI 相机"
	s.mu.Unlock()
	defer func() { cancel(); s.mu.Lock(); s.cancelOp = nil; s.state.Busy = false; s.mu.Unlock() }()
	s.logs.Record("info", "bluetooth", "ble.scan_start", "开始扫描附近相机", nil)
	start := time.Now()
	devices, err := s.bluetooth.Scan(diagnostics.With(ctx, s.logs, nil))
	fields := map[string]string{"elapsed_ms": fmt.Sprint(time.Since(start).Milliseconds()), "count": fmt.Sprint(len(devices))}
	if err != nil {
		fields["error"] = err.Error()
		s.logs.Record("error", "bluetooth", "ble.scan_failed", "扫描相机失败", fields)
	} else {
		s.logs.Record("info", "bluetooth", "ble.scan_complete", "相机扫描完成", fields)
	}
	if err == nil {
		s.mu.Lock()
		s.deviceNames = map[string]string{}
		for _, d := range devices {
			s.deviceNames[d.ID] = d.Name
		}
		s.mu.Unlock()
	}
	return devices, err
}

func (s *BridgeService) releaseMediaConnection() {
	s.mu.Lock()
	link := s.link
	s.link = nil
	s.mu.Unlock()
	if link != nil {
		link.Close()
	}
}

func (s *BridgeService) cleanupConnection() {
	s.mu.Lock()
	link, ble := s.link, s.ble
	s.link = nil
	s.ble = nil
	previous, switched := s.previousSSID, s.switched
	connectionID := s.connectionID
	s.switched = false
	s.previousSSID = ""
	s.connectionID = ""
	s.wifiHint = ""
	s.state.WiFiNetworks = []WiFiCandidate{}
	s.mu.Unlock()
	if link != nil {
		link.Close()
	}
	if ble != nil {
		ble.Close()
	}
	if switched {
		s.logs.Record("info", "wifi", "wifi.restore_start", "尝试恢复原 Wi-Fi", map[string]string{"connection_id": connectionID})
		ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
		err := s.connection.restore(ctx, previous)
		cancel()
		if err != nil {
			s.logs.Record("warn", "wifi", "wifi.restore_failed", "恢复原网络失败", map[string]string{"error": err.Error(), "connection_id": connectionID})
		} else {
			s.logs.Record("info", "wifi", "wifi.restored", "已恢复原网络", map[string]string{"connection_id": connectionID})
		}
		if err != nil {
			s.mu.Lock()
			s.state.Warning = err.Error()
			s.mu.Unlock()
		}
	}
}

func (s *BridgeService) Disconnect() error {
	s.logs.Record("info", "connection", "connection.disconnect", "正在断开相机并暂停传输", nil)
	s.mu.Lock()
	if s.cancelOp != nil {
		s.cancelOp()
	}
	s.mu.Unlock()
	s.PauseAll()
	s.op.Lock()
	defer s.op.Unlock()
	s.cleanupConnection()
	s.mu.Lock()
	s.state.Phase = "disconnected"
	s.state.Message = "相机已断开"
	s.state.DeviceName = ""
	s.state.SSID = ""
	s.state.Media = []camera.Media{}
	s.state.Busy = false
	s.mu.Unlock()
	return nil
}

func (s *BridgeService) Refresh() error {
	if !s.op.TryLock() {
		return errors.New("正在读取相机，请稍候")
	}
	defer s.op.Unlock()
	s.mu.Lock()
	link := s.link
	if link == nil {
		s.mu.Unlock()
		return errors.New("请先连接相机")
	}
	s.state.Busy = true
	s.mu.Unlock()
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()
	files, warning, err := link.List(diagnostics.With(ctx, s.logs, nil))
	if err != nil {
		s.logs.Record("error", "media", "media.refresh_failed", "刷新素材清单失败", map[string]string{"error": err.Error()})
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.state.Busy = false
	if err != nil {
		return err
	}
	s.state.Media = files
	s.logs.Record("info", "media", "media.list_ready", "素材清单读取完成", map[string]string{"count": fmt.Sprint(len(files)), "warning": warning, "connection_id": s.connectionID})
	s.state.Warning = warning
	return nil
}

func (s *BridgeService) ChooseDestination() (string, error) {
	if s.app == nil {
		return "", errors.New("请从桌面应用选择导入位置")
	}
	dir, err := s.app.Dialog.OpenFile().SetTitle("选择素材导入位置").CanChooseFiles(false).CanChooseDirectories(true).CanCreateDirectories(true).PromptForSingleSelection()
	if err != nil || dir == "" {
		return "", err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.state.Destination = dir
	return dir, s.saveLocked()
}

func (s *BridgeService) Enqueue(ids []string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.link == nil || !s.link.Alive() {
		return errors.New("相机未连接，请先连接相机")
	}
	lookup := map[string]camera.Media{}
	for _, m := range s.state.Media {
		lookup[m.ID] = m
	}
	for _, id := range ids {
		if _, ok := lookup[id]; !ok {
			return errors.New("素材列表已变化，请刷新后重新选择")
		}
	}
	for _, id := range ids {
		m := lookup[id]
		h := sha256.Sum256([]byte(s.deviceID + "|" + id + "|" + m.Date + "|" + fmt.Sprint(m.Size) + "|" + s.state.Destination))
		key := hex.EncodeToString(h[:12])
		exists := false
		for _, t := range s.state.Tasks {
			if t.ID == key {
				exists = true
				break
			}
		}
		if exists {
			continue
		}
		s.state.Tasks = append(s.state.Tasks, Task{ID: key, Media: m, Device: s.deviceID, Root: s.state.Destination, Status: "queued", Progress: transfer.Progress{Total: m.Size}})
	}
	s.logs.Record("info", "transfer", "transfer.enqueued", "素材已加入传输队列", map[string]string{"requested_count": fmt.Sprint(len(ids))})
	s.saveStatusLocked()
	s.startWorkerLocked()
	return nil
}

func (s *BridgeService) startWorkerLocked() {
	if s.worker {
		return
	}
	s.worker = true
	s.workerDone = make(chan struct{})
	ctx, cancel := context.WithCancel(context.Background())
	s.cancelDownload = cancel
	go func() {
		defer func() {
			s.mu.Lock()
			s.worker = false
			s.cancelDownload = nil
			close(s.workerDone)
			s.saveStatusLocked()
			s.mu.Unlock()
		}()
		for {
			s.mu.Lock()
			if ctx.Err() != nil {
				s.mu.Unlock()
				return
			}
			index := -1
			for i, t := range s.state.Tasks {
				if t.Status == "queued" && t.Device == s.deviceID {
					index = i
					break
				}
			}
			if index < 0 {
				s.mu.Unlock()
				return
			}
			s.state.Tasks[index].Status = "downloading"
			t := s.state.Tasks[index]
			connectionID := s.connectionID
			s.saveStatusLocked()
			s.mu.Unlock()
			trace := diagnostics.Trace{Store: s.logs, Fields: map[string]string{"task_id": t.ID, "connection_id": connectionID}}
			trace.Log("info", "transfer", "transfer.started", "开始下载原始素材", map[string]string{"storage": fmt.Sprint(t.Media.Storage), "expected_bytes": fmt.Sprint(t.Media.Size)})
			lastProgress := time.Now()
			result, err := transfer.Download(diagnostics.With(ctx, s.logs, trace.Fields), s.client, "192.168.2.1", t.Device, t.Root, t.Media, func(p transfer.Progress) {
				s.mu.Lock()
				s.state.Tasks[index].Progress = p
				s.mu.Unlock()
				if time.Since(lastProgress) >= 5*time.Second {
					trace.Log("debug", "transfer", "transfer.progress", "传输进度", map[string]string{"bytes": fmt.Sprint(p.Bytes), "total": fmt.Sprint(p.Total), "speed_bps": fmt.Sprint(int64(p.Speed))})
					lastProgress = time.Now()
				}
			})
			s.mu.Lock()
			current := &s.state.Tasks[index]
			current.Progress.Speed = 0
			if err == nil {
				trace.Log("info", "transfer", "transfer.completed", "素材完整写入本地", map[string]string{"bytes": fmt.Sprint(result.Bytes), "sha256": result.SHA256})
				current.Status = "completed"
				current.Error = ""
				if result.Warning != "" {
					s.state.Warning = result.Warning
				}
				current.Path = result.Path
				current.SHA256 = result.SHA256
				current.Progress = transfer.Progress{Bytes: result.Bytes, Total: result.Bytes}
			} else if ctx.Err() != nil {
				trace.Log("info", "transfer", "transfer.paused", "传输已暂停，保留续传进度", nil)
				current.Status = "paused"
			} else {
				trace.Log("error", "transfer", "transfer.failed", "下载失败，临时文件已保留", map[string]string{"error": err.Error()})
				current.Status = "failed"
				current.Error = err.Error()
			}
			s.saveStatusLocked()
			s.mu.Unlock()
		}
	}()
}

func (s *BridgeService) PauseAll() {
	s.mu.Lock()
	for i := range s.state.Tasks {
		if s.state.Tasks[i].Status == "queued" {
			s.state.Tasks[i].Status = "paused"
		}
	}
	cancel, done := s.cancelDownload, s.workerDone
	if cancel != nil {
		cancel()
	}
	s.mu.Unlock()
	if cancel != nil {
		<-done
	}
	s.mu.Lock()
	s.saveStatusLocked()
	s.mu.Unlock()
}

func (s *BridgeService) Retry(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.link == nil || !s.link.Alive() {
		return errors.New("请先重新连接相机")
	}
	for i := range s.state.Tasks {
		t := &s.state.Tasks[i]
		if t.ID == id {
			if t.Status != "failed" && t.Status != "paused" {
				return errors.New("该任务无需重试")
			}
			if t.Device != s.deviceID {
				return errors.New("任务属于其他相机会话。请通过蓝牙连接原相机；手动连接的旧任务请在新导入目录重新添加")
			}
			s.logs.Record("info", "transfer", "transfer.retry", "重新加入传输队列", map[string]string{"task_id": id})
			t.Status = "queued"
			t.Error = ""
			s.saveStatusLocked()
			s.startWorkerLocked()
			return nil
		}
	}
	return errors.New("任务不存在")
}

func (s *BridgeService) Reveal(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, t := range s.state.Tasks {
		if t.ID == id && t.Status == "completed" {
			if _, err := os.Stat(t.Path); err != nil {
				return errors.New("文件已移动或删除")
			}
			return exec.Command("/usr/bin/open", "-R", t.Path).Run()
		}
	}
	return errors.New("请先完成下载")
}

func (s *BridgeService) ServiceShutdown() error {
	err := s.Disconnect()
	s.logs.Record("info", "app", "app.stop", "应用已退出", nil)
	return err
}
