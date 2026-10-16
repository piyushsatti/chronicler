package observations

import (
	"sync"
	"time"
)

type EphemeralOutageMonitor struct {
	mu           sync.Mutex
	lastAccepted *time.Time
}

func NewDBOutageMonitor() *EphemeralOutageMonitor {
	return &EphemeralOutageMonitor{}
}

func (m *EphemeralOutageMonitor) ShouldSend(now time.Time) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.lastAccepted == nil || now.Sub(*m.lastAccepted) >= time.Minute
}

func (m *EphemeralOutageMonitor) MarkAccepted(now time.Time) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.lastAccepted = &now
}

func (m *EphemeralOutageMonitor) Reset() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.lastAccepted = nil
}
