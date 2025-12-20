package app

import (
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"strings"
)

func (a *App) handleTurnstileGet(w http.ResponseWriter, r *http.Request) {
	enabled, _ := a.store.GetTurnstileEnabled(r.Context())
	if !enabled {
		if v := strings.TrimSpace(os.Getenv("TURNSTILE_ENABLED")); v == "1" || strings.EqualFold(v, "true") {
			enabled = true
		}
	}
	siteKey, _ := a.store.GetTurnstileSiteKey(r.Context())
	if strings.TrimSpace(siteKey) == "" {
		fromEnv := strings.TrimSpace(os.Getenv("CLOUDFLARE_TURNSTILE_SITE_KEY"))
		siteKey = fromEnv
	}
	secret := strings.TrimSpace(os.Getenv("CLOUDFLARE_TURNSTILE_SECRET_KEY"))
	writeJSON(w, http.StatusOK, map[string]any{
		"enabled":          enabled,
		"siteKey":          siteKey,
		"secretConfigured": secret != "",
	})
}

func (a *App) handleTurnstilePut(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Enabled bool   `json:"enabled"`
		SiteKey string `json:"siteKey"`
		Secret  string `json:"secretKey"`
	}
	if err := readJSON(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid JSON"})
		return
	}
	if _, err := a.store.UpsertTurnstileEnabled(r.Context(), body.Enabled); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "Update failed"})
		return
	}
	if _, err := a.store.UpsertTurnstileSiteKey(r.Context(), strings.TrimSpace(body.SiteKey)); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "Update failed"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"enabled": body.Enabled, "siteKey": strings.TrimSpace(body.SiteKey)})
}

func (a *App) handleTurnstileVerify(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Response string `json:"response"`
	}
	if err := readJSON(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid JSON"})
		return
	}
	ok, errs := a.verifyTurnstile(r, body.Response)
	writeJSON(w, http.StatusOK, map[string]any{"success": ok, "errors": errs})
}

func (a *App) verifyTurnstile(r *http.Request, token string) (bool, []string) {
	secret := strings.TrimSpace(os.Getenv("CLOUDFLARE_TURNSTILE_SECRET_KEY"))
	if secret == "" || strings.TrimSpace(token) == "" {
		return false, []string{"missing-input"}
	}
	resp, err := http.PostForm("https://challenges.cloudflare.com/turnstile/v0/siteverify", url.Values{
		"secret":   {secret},
		"response": {token},
		"remoteip": {getClientIP(r)},
	})
	if err != nil {
		return false, []string{"verify-request-failed"}
	}
	defer resp.Body.Close()
	var out struct {
		Success    bool     `json:"success"`
		ErrorCodes []string `json:"error-codes"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&out)
	return out.Success, out.ErrorCodes
}
