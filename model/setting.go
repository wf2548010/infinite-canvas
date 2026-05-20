package model

import "encoding/json"

type SettingKey string

const (
	SettingKeyPublic  SettingKey = "public"
	SettingKeyPrivate SettingKey = "private"
)

// ModelChannel 模型渠道配置。
type ModelChannel struct {
	Key     string   `json:"key"`
	Name    string   `json:"name"`
	BaseURL string   `json:"baseUrl"`
	APIKey  string   `json:"apiKey"`
	Models  []string `json:"models"`
	Enabled bool     `json:"enabled"`
	Remark  string   `json:"remark"`
}

// PublicSetting 公开配置。
type PublicSetting struct {
	AvailableModels   []string `json:"availableModels"`
	DefaultModel      string   `json:"defaultModel"`
	DefaultImageModel string   `json:"defaultImageModel"`
	DefaultTextModel  string   `json:"defaultTextModel"`
	SystemPrompt      string   `json:"systemPrompt"`
	AllowCustomModel  bool     `json:"allowCustomModel"`
}

// PrivateSetting 私有配置。
type PrivateSetting struct {
	Channels []ModelChannel `json:"channels"`
}

// Setting 系统配置。
type Setting struct {
	Key       SettingKey      `json:"key" gorm:"primaryKey"`
	Value     json.RawMessage `json:"value" gorm:"serializer:json"`
	CreatedAt string          `json:"createdAt"`
	UpdatedAt string          `json:"updatedAt"`
}

// Settings 系统公开和私有配置。
type Settings struct {
	Public  PublicSetting  `json:"public"`
	Private PrivateSetting `json:"private"`
}
