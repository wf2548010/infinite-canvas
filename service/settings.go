package service

import (
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func PublicSettings() (model.PublicSetting, error) {
	settings, err := repository.GetSettings()
	return normalizePublicSetting(settings.Public), err
}

func AdminSettings() (model.Settings, error) {
	settings, err := repository.GetSettings()
	return normalizeSettings(settings), err
}

func SaveSettings(settings model.Settings) (model.Settings, error) {
	return repository.SaveSettings(normalizeSettings(settings), now())
}

func normalizeSettings(settings model.Settings) model.Settings {
	settings.Public = normalizePublicSetting(settings.Public)
	settings.Private = normalizePrivateSetting(settings.Private)
	return settings
}

func normalizePublicSetting(setting model.PublicSetting) model.PublicSetting {
	if setting.AvailableModels == nil {
		setting.AvailableModels = []string{}
	}
	return setting
}

func normalizePrivateSetting(setting model.PrivateSetting) model.PrivateSetting {
	if setting.Channels == nil {
		setting.Channels = []model.ModelChannel{}
	}
	for i := range setting.Channels {
		if setting.Channels[i].Models == nil {
			setting.Channels[i].Models = []string{}
		}
	}
	return setting
}
