package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"osmobridge/internal/camera"
	"osmobridge/internal/platform"
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
	Phase       string         `json:"phase"`
	Message     string         `json:"message"`
	Warning     string         `json:"warning"`
	DeviceName  string         `json:"deviceName"`
	SSID        string         `json:"ssid"`
	Destination string         `json:"destination"`
	Media       []camera.Media `json:"media"`
	Tasks       []Task         `json:"tasks"`
	Busy        bool           `json:"busy"`
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
	ble                                          *camera.BLESession
	link                                         *camera.Link
	cancelOp                                     context.CancelFunc
	cancelDownload                               context.CancelFunc
	workerDone                                   chan struct{}
	worker                                       bool
	app                                          *application.App
	client                                       *http.Client
}

func NewBridgeService() *BridgeService {
	home, _ := os.UserHomeDir()
	base := os.Getenv("OSMO_BRIDGE_DATA")
	if base == "" {
		base, _ = os.UserConfigDir()
		base = filepath.Join(base, "OsmoBridge")
	}
	s := &BridgeService{state: State{Phase: "disconnected", Message: "连接相机，开始导入原始素材", Destination: filepath.Join(home, "Movies", "OsmoBridge"), Media: []camera.Media{}, Tasks: []Task{}}, configFile: filepath.Join(base, "settings.json"), client: transfer.Client()}
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
	}
}

func (s *BridgeService) GetState() State {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := s.state
	out.Media = append([]camera.Media{}, s.state.Media...)
	out.Tasks = append([]Task{}, s.state.Tasks...)
	if s.link != nil && out.Phase == "connected" && !s.link.Alive() {
		out.Phase = "lost"
		out.Message = "相机连接已中断，请暂停传输后重新连接"
	}
	return out
}

func (s *BridgeService) Scan() ([]camera.Device, error) {
	if !s.op.TryLock() {
		return nil, errors.New("正在处理相机连接，请稍候")
	}
	defer s.op.Unlock()
	s.mu.Lock()
	if s.link != nil {
		s.mu.Unlock()
		return nil, errors.New("请先断开当前相机")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
	s.cancelOp = cancel
	s.state.Busy = true
	s.state.Message = "正在搜索附近的 DJI 相机"
	s.mu.Unlock()
	defer func() { cancel(); s.mu.Lock(); s.cancelOp = nil; s.state.Busy = false; s.mu.Unlock() }()
	return s.bluetooth.Scan(ctx)
}

func (s *BridgeService) Connect(id string, manual bool) error {
	if !s.op.TryLock() {
		return errors.New("正在处理连接，请稍候")
	}
	s.mu.Lock()
	if s.link != nil {
		s.mu.Unlock()
		s.op.Unlock()
		return errors.New("请先断开当前相机")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Second)
	s.cancelOp = cancel
	s.state.Busy = true
	s.state.Phase = "connecting"
	s.state.Warning = ""
	s.state.Message = "正在连接相机"
	s.state.Media = []camera.Media{}
	s.mu.Unlock()
	go func() {
		defer s.op.Unlock()
		defer cancel()
		err := s.connect(ctx, id, manual)
		if err != nil {
			s.cleanupConnection()
			s.mu.Lock()
			s.state.Phase = "disconnected"
			s.state.Message = err.Error()
			s.mu.Unlock()
		}
		s.mu.Lock()
		s.state.Busy = false
		s.cancelOp = nil
		s.mu.Unlock()
	}()
	return nil
}

func (s *BridgeService) connect(ctx context.Context, id string, manual bool) error {
	stage := func(message string) { s.mu.Lock(); s.state.Message = message; s.mu.Unlock() }
	if !manual {
		s.mu.Lock()
		err := s.saveLocked()
		s.mu.Unlock()
		if err != nil {
			return fmt.Errorf("无法保存配对标识：%w", err)
		}
		ble, ssid, password, err := s.bluetooth.Pair(ctx, id, s.identity, stage)
		if err != nil {
			return err
		}
		s.mu.Lock()
		s.ble = ble
		s.state.SSID = ssid
		s.deviceID = id
		s.state.DeviceName = "DJI Osmo"
		s.previousSSID = platform.CurrentSSID()
		s.mu.Unlock()
		stage("正在加入相机 Wi-Fi，互联网连接将暂时切换")
		for attempt := 0; attempt < 3; attempt++ {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			err = platform.JoinWiFi(ssid, password)
			if err == nil {
				break
			}
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(2 * time.Second):
			}
		}
		if err != nil {
			return err
		}
		s.mu.Lock()
		s.switched = true
		s.mu.Unlock()
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(1500 * time.Millisecond):
		}
	} else {
		var b [8]byte
		_, _ = rand.Read(b[:])
		s.mu.Lock()
		s.deviceID = "manual-" + hex.EncodeToString(b[:])
		s.state.DeviceName = "DJI Osmo · 手动连接"
		s.state.SSID = platform.CurrentSSID()
		s.mu.Unlock()
	}
	stage("正在建立素材会话，请保持相机开机")
	link, err := camera.OpenLink(ctx, "192.168.2.1", s.identity)
	if err != nil {
		return err
	}
	s.mu.Lock()
	s.link = link
	s.mu.Unlock()
	stage("正在读取内置存储和 SD 卡")
	files, warning, err := link.List(ctx)
	if err != nil {
		return err
	}
	s.mu.Lock()
	s.state.Media = files
	s.state.Warning = warning
	s.state.Phase = "connected"
	s.state.Message = "已连接，可选择素材导入"
	s.mu.Unlock()
	return nil
}

func (s *BridgeService) cleanupConnection() {
	s.mu.Lock()
	link, ble := s.link, s.ble
	s.link = nil
	s.ble = nil
	previous, switched := s.previousSSID, s.switched
	s.switched = false
	s.previousSSID = ""
	s.mu.Unlock()
	if link != nil {
		link.Close()
	}
	if ble != nil {
		ble.Close()
	}
	if switched {
		ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
		err := platform.RestoreWiFi(ctx, previous)
		cancel()
		if err != nil {
			s.mu.Lock()
			s.state.Warning = err.Error()
			s.mu.Unlock()
		}
	}
}

func (s *BridgeService) Disconnect() error {
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
	files, warning, err := link.List(ctx)
	s.mu.Lock()
	defer s.mu.Unlock()
	s.state.Busy = false
	if err != nil {
		return err
	}
	s.state.Media = files
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
			s.saveStatusLocked()
			s.mu.Unlock()
			result, err := transfer.Download(ctx, s.client, "192.168.2.1", t.Device, t.Root, t.Media, func(p transfer.Progress) { s.mu.Lock(); s.state.Tasks[index].Progress = p; s.mu.Unlock() })
			s.mu.Lock()
			current := &s.state.Tasks[index]
			current.Progress.Speed = 0
			if err == nil {
				current.Status = "completed"
				current.Path = result.Path
				current.SHA256 = result.SHA256
				current.Progress = transfer.Progress{Bytes: result.Bytes, Total: result.Bytes}
			} else if ctx.Err() != nil {
				current.Status = "paused"
			} else {
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

func (s *BridgeService) serveThumbnail(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/camera-thumbnail/")
	s.mu.Lock()
	var m camera.Media
	ok := false
	for _, f := range s.state.Media {
		if f.ID == id && s.link != nil {
			m = f
			ok = true
			break
		}
	}
	s.mu.Unlock()
	if !ok || m.Thumb == "" || !strings.HasPrefix(m.Thumb, "MISC/") || strings.Contains(m.Thumb, "..") {
		http.NotFound(w, r)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, "GET", camera.MediaURL("192.168.2.1", m.Storage, m.Thumb), nil)
	resp, err := s.client.Do(req)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		http.NotFound(w, r)
		return
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil || !strings.HasPrefix(http.DetectContentType(data), "image/") {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", http.DetectContentType(data))
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write(data)
}

func (s *BridgeService) ServiceShutdown() error { return s.Disconnect() }
