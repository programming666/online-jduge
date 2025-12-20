package app

import (
	"archive/zip"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"onlinejudge-server-go/internal/judger"
	"onlinejudge-server-go/internal/store"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

type Config struct {
	DB        *sql.DB
	JWTSecret string
}

type App struct {
	store      *store.Store
	jwtSecret  []byte
	docker     *judger.DockerRunner
	httpRouter http.Handler
}

type userClaims struct {
	ID       int    `json:"id"`
	Username string `json:"username"`
	Role     string `json:"role"`
	jwt.RegisteredClaims
}

type ctxKey int

const (
	ctxKeyUser ctxKey = iota
)

func New(cfg Config) (*App, error) {
	if cfg.DB == nil {
		return nil, errors.New("db is required")
	}

	secret := strings.TrimSpace(cfg.JWTSecret)
	if secret == "" {
		secret = "your-secret-key"
	}

	imageName := strings.TrimSpace(os.Getenv("JUDGE_IMAGE"))
	if imageName == "" {
		imageName = "judge-runner:latest"
	}
	runner, err := judger.NewDockerRunner(imageName)
	if err != nil {
		return nil, err
	}

	a := &App{
		store:     store.New(cfg.DB),
		jwtSecret: []byte(secret),
		docker:    runner,
	}
	a.httpRouter = a.buildRouter()
	return a, nil
}

func (a *App) Router() http.Handler {
	return a.httpRouter
}

func (a *App) buildRouter() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(a.cors)

	r.Handle("/static/*", http.StripPrefix("/static/", http.FileServer(http.Dir("./static"))))

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"status": "ok"})
	})

	r.Route("/api", func(r chi.Router) {
		r.Route("/auth", func(r chi.Router) {
			r.Post("/register", a.handleRegister)
			r.Post("/login", a.handleLogin)
			r.With(a.authenticateToken).Post("/change-password", a.handleChangePassword)
		})

		r.Route("/user", func(r chi.Router) {
			r.Use(a.authenticateToken)
			r.Get("/preferences", a.handleGetPreferences)
			r.Put("/preferences", a.handleUpdatePreferences)
		})

		r.Route("/problems", func(r chi.Router) {
			r.Get("/", a.handleProblemListPublic)
			r.Get("/{id}", a.handleProblemGetPublic)

			r.With(a.authenticateToken, a.authorizeAdmin).Get("/admin", a.handleProblemListAdmin)
			r.With(a.authenticateToken, a.authorizeAdmin).Get("/{id}/admin", a.handleProblemGetAdmin)
			r.With(a.authenticateToken, a.authorizeAdmin).Post("/", a.handleProblemCreate)
			r.With(a.authenticateToken, a.authorizeAdmin).Put("/{id}", a.handleProblemUpdate)
			r.With(a.authenticateToken, a.authorizeAdmin).Patch("/{id}/visibility", a.handleProblemVisibility)
			r.With(a.authenticateToken, a.authorizeAdmin).Delete("/{id}", a.handleProblemDelete)
			r.With(a.authenticateToken, a.authorizeAdmin).Post("/{id}/clone", a.handleProblemClone)
		})

		r.Route("/submissions", func(r chi.Router) {
			r.With(a.authenticateToken).Get("/", a.handleSubmissionList)
			r.With(a.authenticateToken).Get("/{id}", a.handleSubmissionDetail)
			r.With(a.authenticateToken).Post("/", a.handleSubmissionCreate)
		})

		r.Route("/settings", func(r chi.Router) {
			r.Get("/registration", a.handleRegistrationGet)
			r.With(a.authenticateToken, a.authorizeAdmin).Put("/registration", a.handleRegistrationPut)
			r.Get("/homepage", a.handleHomepageGet)
			r.With(a.authenticateToken, a.authorizeAdmin).Put("/homepage", a.handleHomepagePut)
			r.Get("/footer", a.handleFooterGet)
			r.With(a.authenticateToken, a.authorizeAdmin).Put("/footer", a.handleFooterPut)
			r.Get("/rate-limit", a.handleRateLimitGet)
			r.With(a.authenticateToken, a.authorizeAdmin).Put("/rate-limit", a.handleRateLimitPut)
			r.Get("/turnstile", a.handleTurnstileGet)
			r.With(a.authenticateToken, a.authorizeAdmin).Put("/turnstile", a.handleTurnstilePut)
			r.With(a.authenticateToken, a.authorizeAdmin).Post("/turnstile/verify", a.handleTurnstileVerify)
		})

		r.Route("/admin/users", func(r chi.Router) {
			r.Use(a.authenticateToken, a.authorizeAdmin)
			r.Get("/", a.handleUserList)
			r.Post("/{id}/ban", a.handleUserBan)
			r.Post("/{id}/unban", a.handleUserUnban)
			r.Delete("/{id}", a.handleUserDelete)
			r.Delete("/{id}/submissions", a.handleUserDeleteSubmissions)
		})

		r.Route("/admin/banned-ips", func(r chi.Router) {
			r.Use(a.authenticateToken, a.authorizeAdmin)
			r.Get("/", a.handleBannedIPList)
			r.Post("/", a.handleBanIP)
			r.Delete("/{ip}", a.handleUnbanIP)
		})

		r.With(a.authenticateToken, a.authorizeAdmin).Delete("/admin/submissions/{id}", a.handleAdminDeleteSubmission)

		r.Route("/contests", func(r chi.Router) {
			r.Get("/public", a.handleContestPublicList)
			r.Get("/public/{id}", a.handleContestPublicDetail)
			r.Get("/public/{id}/leaderboard", a.handleContestPublicLeaderboard)
			r.Get("/public/{id}/problem/{order}", a.handleContestPublicProblem)
			r.Get("/public/{id}/attachments", a.handleContestPublicAttachmentsList)
			r.Get("/public/{id}/attachments/{filename}", a.handleContestPublicAttachmentDownload)

			r.Group(func(r chi.Router) {
				r.Use(a.authenticateToken)

				r.Post("/{id}/join", a.handleContestJoin)

				r.With(a.authorizeAdmin).Post("/", a.handleContestCreate)
				r.With(a.authorizeAdmin).Post("/batch/publish", a.handleContestBatchPublish)
				r.With(a.authorizeAdmin).Get("/{id}/export", a.handleContestExport)
				r.With(a.authorizeAdmin).Post("/{id}/attachments", a.handleContestAttachmentUpload)
				r.With(a.authorizeAdmin).Get("/", a.handleContestAdminList)
				r.With(a.authorizeAdmin).Get("/{id}", a.handleContestAdminGet)
				r.With(a.authorizeAdmin).Put("/{id}", a.handleContestAdminUpdate)
			})
		})
	})

	return r
}

func (a *App) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization,Content-Type")
		w.Header().Set("Access-Control-Max-Age", "600")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (a *App) authenticateToken(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		parts := strings.Fields(authHeader)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}

		tokenStr := parts[1]
		claims := &userClaims{}
		tok, err := jwt.ParseWithClaims(tokenStr, claims, func(token *jwt.Token) (any, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, errors.New("unexpected signing method")
			}
			return a.jwtSecret, nil
		})
		if err != nil || !tok.Valid {
			w.WriteHeader(http.StatusForbidden)
			return
		}

		ctx := context.WithValue(r.Context(), ctxKeyUser, *claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (a *App) authorizeAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u, ok := a.currentUser(r)
		if !ok || u.Role != "ADMIN" {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (a *App) currentUser(r *http.Request) (userClaims, bool) {
	v := r.Context().Value(ctxKeyUser)
	if v == nil {
		return userClaims{}, false
	}
	u, ok := v.(userClaims)
	return u, ok
}

func (a *App) tryUserFromAuthHeader(r *http.Request) (userClaims, bool) {
	authHeader := r.Header.Get("Authorization")
	parts := strings.Fields(authHeader)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return userClaims{}, false
	}
	claims := &userClaims{}
	tok, err := jwt.ParseWithClaims(parts[1], claims, func(token *jwt.Token) (any, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return a.jwtSecret, nil
	})
	if err != nil || !tok.Valid {
		return userClaims{}, false
	}
	return *claims, true
}

func (a *App) handleRegister(w http.ResponseWriter, r *http.Request) {
	// Check IP ban
	clientIP := getClientIP(r)
	isBanned, err := a.store.IsIPBanned(r.Context(), clientIP)
	if err == nil && isBanned {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": "Your IP has been banned from registration"})
		return
	}

	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
		Role     string `json:"role"`
		CfToken  string `json:"cfToken"`
	}
	if err := readJSON(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid JSON"})
		return
	}
	if strings.TrimSpace(body.Username) == "" || strings.TrimSpace(body.Password) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Username and password required"})
		return
	}

	enabled, err := a.store.IsRegistrationEnabled(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "Registration failed"})
		return
	}
	if !enabled {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": "Registration is currently disabled"})
		return
	}
	turnEnabled, _ := a.store.GetTurnstileEnabled(r.Context())
	if !turnEnabled {
		if v := strings.TrimSpace(os.Getenv("TURNSTILE_ENABLED")); v == "1" || strings.EqualFold(v, "true") {
			turnEnabled = true
		}
	}
	if turnEnabled {
		ok, errs := a.verifyTurnstile(r, body.CfToken)
		if !ok {
			writeJSON(w, http.StatusForbidden, map[string]any{"error": "Verification failed", "codes": errs})
			return
		}
	}

	role := "STUDENT"
	if body.Role == "ADMIN" {
		role = "ADMIN"
	}
	hashed, err := bcrypt.GenerateFromPassword([]byte(body.Password), 10)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "Registration failed"})
		return
	}

	err = a.store.CreateUser(r.Context(), store.CreateUserParams{
		Username: body.Username,
		Password: string(hashed),
		Role:     role,
	})
	if err != nil {
		if errors.Is(err, store.ErrUniqueViolation) {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Username already exists"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "Registration failed"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"message": "User registered successfully"})
}

func (a *App) handleLogin(w http.ResponseWriter, r *http.Request) {
	// Check IP ban
	clientIP := getClientIP(r)
	isBanned, err := a.store.IsIPBanned(r.Context(), clientIP)
	if err == nil && isBanned {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": "Your IP has been banned"})
		return
	}

	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
		CfToken  string `json:"cfToken"`
	}
	if err := readJSON(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid JSON"})
		return
	}

	u, err := a.store.GetUserByUsername(r.Context(), body.Username)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "User not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "Login failed"})
		return
	}

	// Check if user is banned
	if u.IsBanned {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": "Your account has been banned"})
		return
	}

	turnEnabled, _ := a.store.GetTurnstileEnabled(r.Context())
	if !turnEnabled {
		if v := strings.TrimSpace(os.Getenv("TURNSTILE_ENABLED")); v == "1" || strings.EqualFold(v, "true") {
			turnEnabled = true
		}
	}
	if turnEnabled {
		ok, errs := a.verifyTurnstile(r, body.CfToken)
		if !ok {
			writeJSON(w, http.StatusForbidden, map[string]any{"error": "Verification failed", "codes": errs})
			return
		}
	}
	if bcrypt.CompareHashAndPassword([]byte(u.Password), []byte(body.Password)) != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "Invalid password"})
		return
	}

	now := time.Now()
	claims := userClaims{
		ID:       u.ID,
		Username: u.Username,
		Role:     u.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(24 * time.Hour)),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(a.jwtSecret)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "Login failed"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"token": signed, "role": u.Role, "username": u.Username})
}

func (a *App) handleChangePassword(w http.ResponseWriter, r *http.Request) {
	u, _ := a.currentUser(r)
	var body struct {
		Current string `json:"currentPassword"`
		New     string `json:"newPassword"`
	}
	if err := readJSON(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid JSON"})
		return
	}
	cur := strings.TrimSpace(body.Current)
	nw := strings.TrimSpace(body.New)
	if cur == "" || nw == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Password required"})
		return
	}
	usr, err := a.store.GetUserByID(r.Context(), u.ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "User not found"})
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(usr.Password), []byte(cur)) != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "Invalid current password"})
		return
	}
	if !isStrongPassword(nw) {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Weak password"})
		return
	}
	hashed, err := bcrypt.GenerateFromPassword([]byte(nw), 10)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "Update failed"})
		return
	}
	if err := a.store.UpdateUserPassword(r.Context(), u.ID, string(hashed)); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "Update failed"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"success": true})
}

func isStrongPassword(pw string) bool {
	var hasUpper, hasLower, hasDigit, hasSymbol bool
	for _, r := range pw {
		switch {
		case r >= 'A' && r <= 'Z':
			hasUpper = true
		case r >= 'a' && r <= 'z':
			hasLower = true
		case r >= '0' && r <= '9':
			hasDigit = true
		default:
			hasSymbol = true
		}
	}
	if len(pw) >= 12 && hasUpper && hasLower && hasDigit && hasSymbol {
		return true
	}
	if len(pw) >= 8 && ((hasUpper && hasLower) || (hasLower && hasDigit) || (hasUpper && hasDigit)) {
		return true
	}
	return false
}

func (a *App) handleProblemListPublic(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	p := store.ListProblemsParams{
		Difficulty: q.Get("difficulty"),
		Search:     q.Get("search"),
		Tags:       parseTags(q),
	}
	items, err := a.store.ListProblemsPublic(r.Context(), p)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}

	user, ok := a.tryUserFromAuthHeader(r)
	if ok {
		scores, err := a.store.GetUserMaxScoresByProblem(r.Context(), user.ID)
		if err == nil {
			for i := range items {
				if s, exists := scores[items[i].ID]; exists {
					v := s
					items[i].Score = &v
				}
			}
		}
	}

	writeJSON(w, http.StatusOK, items)
}

func (a *App) handleProblemListAdmin(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	p := store.ListProblemsParams{
		Difficulty: q.Get("difficulty"),
		Search:     q.Get("search"),
		Tags:       parseTags(q),
	}
	items, err := a.store.ListProblemsAdmin(r.Context(), p)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *App) handleProblemGetPublic(w http.ResponseWriter, r *http.Request) {
	id, ok := parseIntParam(chi.URLParam(r, "id"))
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid problem id"})
		return
	}
	p, err := a.store.GetProblemByID(r.Context(), id)
	if err != nil || !p.Visible {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "Problem not found"})
		return
	}
	writeJSON(w, http.StatusOK, p)
}

func (a *App) handleProblemGetAdmin(w http.ResponseWriter, r *http.Request) {
	id, ok := parseIntParam(chi.URLParam(r, "id"))
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid problem id"})
		return
	}
	p, err := a.store.GetProblemWithTestCases(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]any{"error": "Problem not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, p)
}

func (a *App) handleProblemCreate(w http.ResponseWriter, r *http.Request) {
	var raw map[string]any
	if err := readJSON(r, &raw); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid JSON"})
		return
	}

	title, _ := raw["title"].(string)
	description, _ := raw["description"].(string)
	timeLimit, okTL := parseIntAny(raw["timeLimit"])
	memoryLimit, okML := parseIntAny(raw["memoryLimit"])
	if strings.TrimSpace(title) == "" || strings.TrimSpace(description) == "" || !okTL || !okML {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid payload"})
		return
	}

	defaultCompileOptions, _ := raw["defaultCompileOptions"].(string)
	difficulty, _ := raw["difficulty"].(string)
	if strings.TrimSpace(difficulty) == "" {
		difficulty = "LEVEL2"
	}

	tags := normalizeStringList(raw["tags"])

	var cfg json.RawMessage
	if v, ok := raw["config"]; ok {
		b, _ := json.Marshal(v)
		cfg = b
	}

	testCases := []store.TestCaseInput{}
	if v, ok := raw["testCases"]; ok {
		if arr, ok := v.([]any); ok {
			for _, item := range arr {
				m, ok := item.(map[string]any)
				if !ok {
					continue
				}
				in, _ := m["input"].(string)
				exp, _ := m["expectedOutput"].(string)
				testCases = append(testCases, store.TestCaseInput{Input: in, ExpectedOutput: exp})
			}
		}
	}

	contestID, _ := parseOptionalIntAny(raw["contestId"])

	created, err := a.store.CreateProblem(r.Context(), store.CreateProblemParams{
		Title:                 title,
		Description:           description,
		TimeLimit:             timeLimit,
		MemoryLimit:           memoryLimit,
		DefaultCompileOptions: defaultCompileOptions,
		Difficulty:            difficulty,
		Tags:                  tags,
		Config:                cfg,
		TestCases:             testCases,
		ContestID:             contestID,
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, created)
}

func (a *App) handleProblemUpdate(w http.ResponseWriter, r *http.Request) {
	id, ok := parseIntParam(chi.URLParam(r, "id"))
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid problem id"})
		return
	}

	var raw map[string]any
	if err := readJSON(r, &raw); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid JSON"})
		return
	}

	title, _ := raw["title"].(string)
	description, _ := raw["description"].(string)
	timeLimit, okTL := parseIntAny(raw["timeLimit"])
	memoryLimit, okML := parseIntAny(raw["memoryLimit"])
	if strings.TrimSpace(title) == "" || strings.TrimSpace(description) == "" || !okTL || !okML {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid payload"})
		return
	}

	defaultCompileOptions, _ := raw["defaultCompileOptions"].(string)
	difficulty, _ := raw["difficulty"].(string)
	if strings.TrimSpace(difficulty) == "" {
		difficulty = "LEVEL2"
	}
	tags := normalizeStringList(raw["tags"])

	var cfg json.RawMessage
	if v, ok := raw["config"]; ok {
		b, _ := json.Marshal(v)
		cfg = b
	}

	testCases := []store.TestCaseInput{}
	if v, ok := raw["testCases"]; ok {
		if arr, ok := v.([]any); ok {
			for _, item := range arr {
				m, ok := item.(map[string]any)
				if !ok {
					continue
				}
				in, _ := m["input"].(string)
				exp, _ := m["expectedOutput"].(string)
				testCases = append(testCases, store.TestCaseInput{Input: in, ExpectedOutput: exp})
			}
		}
	}

	updated, err := a.store.UpdateProblem(r.Context(), store.UpdateProblemParams{
		ID:                    id,
		Title:                 title,
		Description:           description,
		TimeLimit:             timeLimit,
		MemoryLimit:           memoryLimit,
		DefaultCompileOptions: defaultCompileOptions,
		Difficulty:            difficulty,
		Tags:                  tags,
		Config:                cfg,
		TestCases:             testCases,
	})
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]any{"error": "Problem not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (a *App) handleProblemVisibility(w http.ResponseWriter, r *http.Request) {
	id, ok := parseIntParam(chi.URLParam(r, "id"))
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid problem id"})
		return
	}
	var body struct {
		Visible *bool `json:"visible"`
	}
	if err := readJSON(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid JSON"})
		return
	}
	if body.Visible == nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Visible flag is required"})
		return
	}

	p, err := a.store.UpdateProblemVisibility(r.Context(), id, *body.Visible)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]any{"error": "Problem not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": p.ID, "visible": p.Visible})
}

func (a *App) handleProblemDelete(w http.ResponseWriter, r *http.Request) {
	id, ok := parseIntParam(chi.URLParam(r, "id"))
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid problem id"})
		return
	}
	if err := a.store.DeleteProblemCascade(r.Context(), id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"success": true})
}

func (a *App) handleProblemClone(w http.ResponseWriter, r *http.Request) {
	id, ok := parseIntParam(chi.URLParam(r, "id"))
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid problem id"})
		return
	}
	var body struct {
		Title string `json:"title"`
	}
	_ = readJSON(r, &body)
	created, err := a.store.CloneProblem(r.Context(), id, body.Title)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]any{"error": "Problem not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, created)
}

func (a *App) handleSubmissionList(w http.ResponseWriter, r *http.Request) {
	u, _ := a.currentUser(r)
	isAdmin := u.Role == "ADMIN"

	q := r.URL.Query()
	contestIDParam := q.Get("contest_id")
	var contestID *int
	excludeContest := false

	if contestIDParam != "" {
		id, err := strconv.Atoi(contestIDParam)
		if err == nil {
			contestID = &id
		}
	} else {
		excludeContest = true
	}

	limit := 50
	if l, err := strconv.Atoi(q.Get("limit")); err == nil && l > 0 && l <= 1000 {
		limit = l
	}

	items, err := a.store.ListSubmissions(r.Context(), store.ListSubmissionsParams{
		UserID:         u.ID,
		IsAdmin:        isAdmin,
		Limit:          limit,
		ContestID:      contestID,
		ExcludeContest: excludeContest,
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *App) handleSubmissionDetail(w http.ResponseWriter, r *http.Request) {
	subID, ok := parseIntParam(chi.URLParam(r, "id"))
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid submission id"})
		return
	}
	u, _ := a.currentUser(r)
	isAdmin := u.Role == "ADMIN"

	sub, err := a.store.GetSubmissionWithProblemAndUser(r.Context(), subID, isAdmin)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]any{"error": "Submission not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}

	isOwner := sub.UserID != nil && *sub.UserID == u.ID
	if !isAdmin && !isOwner {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": "Access denied"})
		return
	}

	type tcOut struct {
		ID             int    `json:"id"`
		Status         string `json:"status"`
		TimeUsed       int    `json:"timeUsed"`
		MemoryUsed     int    `json:"memoryUsed"`
		Output         string `json:"output"`
		Input          string `json:"input,omitempty"`
		ExpectedOutput string `json:"expectedOutput,omitempty"`
	}

	var rawResults []store.JudgeCaseResult
	if len(sub.TestCaseResults) > 0 {
		_ = json.Unmarshal(sub.TestCaseResults, &rawResults)
	}
	outCases := make([]tcOut, 0, len(rawResults))
	for idx, res := range rawResults {
		item := tcOut{
			ID:         idx + 1,
			Status:     res.Status,
			TimeUsed:   res.TimeUsed,
			MemoryUsed: res.MemoryUsed,
			Output:     res.Output,
		}
		if isAdmin {
			if idx < len(sub.Problem.TestCases) {
				item.Input = sub.Problem.TestCases[idx].Input
				item.ExpectedOutput = sub.Problem.TestCases[idx].ExpectedOutput
			} else {
				item.Input = "N/A"
				item.ExpectedOutput = "N/A"
			}
		}
		outCases = append(outCases, item)
	}

	resp := map[string]any{
		"id":         sub.ID,
		"status":     sub.Status,
		"score":      sub.Score,
		"timeUsed":   sub.TimeUsed,
		"memoryUsed": sub.MemoryUsed,
		"language":   sub.Language,
		"code":       sub.Code,
		"output":     sub.Output,
		"createdAt":  sub.CreatedAt,
		"problem": map[string]any{
			"id":    sub.Problem.ID,
			"title": sub.Problem.Title,
		},
		"user": map[string]any{
			"username": sub.User.Username,
			"role":     sub.User.Role,
		},
		"testCaseResults": outCases,
	}

	writeJSON(w, http.StatusOK, resp)
}

func (a *App) handleSubmissionCreate(w http.ResponseWriter, r *http.Request) {
	u, _ := a.currentUser(r)

	// Check if user is banned
	user, err := a.store.GetUserByID(r.Context(), u.ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "Failed to check user status"})
		return
	}
	if user.IsBanned {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": "Your account has been banned"})
		return
	}

	// Check IP ban
	clientIP := getClientIP(r)
	isBanned, err := a.store.IsIPBanned(r.Context(), clientIP)
	if err == nil && isBanned {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": "Your IP has been banned"})
		return
	}

	// Check rate limit
	rateLimit, _ := a.store.GetSubmissionRateLimit(r.Context())
	windowStart := time.Now().Add(-time.Minute)
	count, err := a.store.CountUserSubmissionsInWindow(r.Context(), u.ID, windowStart)
	if err == nil && count >= rateLimit {
		writeJSON(w, http.StatusTooManyRequests, map[string]any{
			"error":  "Rate limit exceeded. Please wait before submitting again.",
			"limit":  rateLimit,
			"window": "1 minute",
		})
		return
	}

	var raw map[string]any
	if err := readJSON(r, &raw); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid JSON"})
		return
	}
	problemID, okPID := parseIntAny(raw["problemId"])
	code, _ := raw["code"].(string)
	language, _ := raw["language"].(string)
	if !okPID || strings.TrimSpace(code) == "" || strings.TrimSpace(language) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid payload"})
		return
	}

	contestIDVal, hasContest := raw["contestId"]
	var contestID *int
	if hasContest {
		if id, ok := parseIntAny(contestIDVal); ok && id > 0 {
			contestID = &id
		}
	}

	p, err := a.store.GetProblemWithTestCases(r.Context(), problemID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]any{"error": "Problem not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}

	var contest store.Contest
	var contestExists bool
	if contestID != nil {
		c, err := a.store.GetContestByID(r.Context(), *contestID)
		if err == nil {
			contest = c
			contestExists = true
		} else {
			contestID = nil
		}
	}

	if contestExists {
		now := time.Now()
		if now.After(contest.EndTime) {
			writeJSON(w, http.StatusForbidden, map[string]any{"error": "Contest ended"})
			return
		}
	}

	if contestExists && len(contest.Languages) > 0 {
		allowed := false
		for _, l := range contest.Languages {
			if l == language {
				allowed = true
				break
			}
		}
		if !allowed {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Language not allowed in this contest"})
			return
		}
	}

	if len(p.TestCases) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Problem has no test cases configured"})
		return
	}

	sub, err := a.store.CreateSubmission(r.Context(), store.CreateSubmissionParams{
		ProblemID: problemID,
		Code:      code,
		Language:  language,
		UserID:    u.ID,
		ContestID: contestID,
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}

	problemForJudge := p
	subID := sub.ID
	go a.judgeSubmission(subID, problemForJudge, code, language)

	writeJSON(w, http.StatusOK, sub)
}

func (a *App) judgeSubmission(submissionID int, p store.ProblemWithTestCases, code string, language string) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	if len(p.TestCases) == 0 {
		_ = a.store.UpdateSubmissionStatus(ctx, submissionID, "System Error", "No test cases found during judging.")
		return
	}

	timeLimit := p.TimeLimit
	if len(p.Config) > 0 {
		var cfg map[string]map[string]any
		if json.Unmarshal(p.Config, &cfg) == nil {
			if langCfg, ok := cfg[language]; ok {
				if tl, ok := parseIntAny(langCfg["timeLimit"]); ok && tl > 0 {
					timeLimit = tl
				}
			}
		}
	}

	testCases := make([]judger.TestCase, 0, len(p.TestCases))
	for _, tc := range p.TestCases {
		testCases = append(testCases, judger.TestCase{Input: tc.Input, ExpectedOutput: tc.ExpectedOutput})
	}

	opts := judger.Options{
		TimeLimitMs:    timeLimit,
		MemoryLimitMB:  p.MemoryLimit,
		CompileOptions: p.DefaultCompileOptions,
	}
	judgeRes, _ := a.docker.Judge(ctx, language, code, testCases, opts)

	finalStatus := "Accepted"
	maxTime := 0
	maxMemory := 0
	passed := 0
	results := judgeRes.Results
	output := ""

	if judgeRes.Status == "Judged" {
		for _, r := range results {
			if r.Status == "Accepted" {
				passed++
			} else if finalStatus == "Accepted" {
				finalStatus = r.Status
				output = r.Output
			}
			if r.TimeUsed > maxTime {
				maxTime = r.TimeUsed
			}
			if r.MemoryUsed > maxMemory {
				maxMemory = r.MemoryUsed
			}
		}
		if finalStatus == "Accepted" {
			output = "All test cases passed"
		}
	} else {
		finalStatus = judgeRes.Status
		output = judgeRes.Output
		results = nil
	}

	score := 0
	if len(p.TestCases) > 0 {
		score = int(float64(passed) / float64(len(p.TestCases)) * 100.0)
	}

	var resultsJSON json.RawMessage
	if results != nil {
		if b, err := json.Marshal(results); err == nil {
			resultsJSON = b
		}
	}

	_ = a.store.UpdateSubmissionJudged(ctx, store.UpdateSubmissionJudgedParams{
		ID:            submissionID,
		Status:        finalStatus,
		TimeUsed:      maxTime,
		MemoryUsed:    maxMemory,
		Score:         score,
		TestCaseJSON:  resultsJSON,
		OutputMessage: output,
	})
}

func (a *App) handleRegistrationGet(w http.ResponseWriter, r *http.Request) {
	enabled, err := a.store.IsRegistrationEnabled(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"enabled": enabled})
}

func (a *App) handleRegistrationPut(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Enabled *bool `json:"enabled"`
	}
	if err := readJSON(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid JSON"})
		return
	}
	if body.Enabled == nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "enabled must be boolean"})
		return
	}
	enabled, err := a.store.UpsertRegistrationEnabled(r.Context(), *body.Enabled)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"enabled": enabled})
}

func (a *App) handleHomepageGet(w http.ResponseWriter, r *http.Request) {
	content, err := a.store.GetHomepageContent(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"content": content})
}

func (a *App) handleHomepagePut(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Content string `json:"content"`
	}
	if err := readJSON(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid JSON"})
		return
	}
	content, err := a.store.UpsertHomepageContent(r.Context(), body.Content)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"content": content})
}

func (a *App) handleContestCreate(w http.ResponseWriter, r *http.Request) {
	var raw map[string]any
	if err := readJSON(r, &raw); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid JSON"})
		return
	}
	name, _ := raw["name"].(string)
	if strings.TrimSpace(name) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Contest name is required"})
		return
	}
	startStr, _ := raw["startTime"].(string)
	endStr, _ := raw["endTime"].(string)
	if strings.TrimSpace(startStr) == "" || strings.TrimSpace(endStr) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Start and end time are required"})
		return
	}
	start, err1 := time.Parse(time.RFC3339, startStr)
	end, err2 := time.Parse(time.RFC3339, endStr)
	if err1 != nil || err2 != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid start or end time"})
		return
	}
	if !end.After(start) {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "End time must be after start time"})
		return
	}
	rule, _ := raw["rule"].(string)
	if rule != "OI" && rule != "IOI" && rule != "ACM" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid contest rule"})
		return
	}

	description := ""
	if v, ok := raw["description"].(string); ok {
		description = v
	}

	var passwordHash *string
	if pw, ok := raw["password"].(string); ok {
		pw = strings.TrimSpace(pw)
		if pw != "" {
			b, err := bcrypt.GenerateFromPassword([]byte(pw), 10)
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
				return
			}
			s := string(b)
			passwordHash = &s
		}
	}

	isPublished := false
	if v, ok := raw["isPublished"].(bool); ok {
		isPublished = v
	}

	languages := normalizeAllowedLanguages(raw["languages"])
	problemIDs := normalizeIntList(raw["problemIds"])

	createdID, err := a.store.CreateContest(r.Context(), store.CreateContestParams{
		Name:         name,
		Description:  description,
		StartTime:    start,
		EndTime:      end,
		Rule:         rule,
		PasswordHash: passwordHash,
		IsPublished:  isPublished,
		Languages:    languages,
		ProblemIDs:   problemIDs,
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	withProblems, err := a.store.GetContestAdmin(r.Context(), createdID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, withProblems)
}

func (a *App) handleContestBatchPublish(w http.ResponseWriter, r *http.Request) {
	var body struct {
		IDs       []any `json:"ids"`
		Published any   `json:"published"`
	}
	if err := readJSON(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid JSON"})
		return
	}
	if len(body.IDs) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Ids are required"})
		return
	}
	ids := make([]int, 0, len(body.IDs))
	for _, v := range body.IDs {
		if id, ok := parseIntAny(v); ok && id > 0 {
			ids = append(ids, id)
		}
	}
	if len(ids) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Ids are invalid"})
		return
	}
	published := false
	if b, ok := body.Published.(bool); ok {
		published = b
	} else if i, ok := parseIntAny(body.Published); ok {
		published = i != 0
	}

	count, err := a.store.BatchSetContestPublished(r.Context(), ids, published)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"count": count})
}

func (a *App) handleContestExport(w http.ResponseWriter, r *http.Request) {
	contestID, ok := parseIntParam(chi.URLParam(r, "id"))
	if !ok || contestID <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid contest id"})
		return
	}
	q := r.URL.Query()

	var pid *int
	if v := q.Get("problemId"); strings.TrimSpace(v) != "" {
		if id, ok := parseIntParam(v); ok && id > 0 {
			pid = &id
		}
	}
	var uid *int
	if v := q.Get("userId"); strings.TrimSpace(v) != "" {
		if id, ok := parseIntParam(v); ok && id > 0 {
			uid = &id
		}
	}

	submissions, err := a.store.ListContestSubmissionsForExport(r.Context(), contestID, pid, uid)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	if len(submissions) == 0 {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "No submissions found for this contest and filters"})
		return
	}

	type key struct {
		UserID    int
		ProblemID int
	}
	latest := map[key]store.ContestSubmissionExportRow{}
	for _, s := range submissions {
		latest[key{UserID: s.UserID, ProblemID: s.ProblemID}] = s
	}

	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", `attachment; filename="contest-`+strconv.Itoa(contestID)+`-submissions.zip"`)

	zw := zip.NewWriter(w)
	defer zw.Close()

	for _, s := range latest {
		username := safeSegment(s.Username)
		problemSeg := safeSegment(strconv.Itoa(s.ProblemID))
		ext := "txt"
		if s.Language == "cpp" {
			ext = "cpp"
		} else if s.Language == "python" {
			ext = "py"
		}
		filename := username + "/" + problemSeg + "/solution." + ext
		f, err := zw.Create(filename)
		if err != nil {
			continue
		}
		_, _ = io.WriteString(f, s.Code)
	}
}

func (a *App) handleContestPublicList(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	page := parsePositiveIntDefault(q.Get("page"), 1)
	pageSize := parsePositiveIntDefault(q.Get("pageSize"), 10)
	if pageSize > 50 {
		pageSize = 50
	}

	status := strings.TrimSpace(q.Get("status"))
	startFrom := parseTimeQuery(q.Get("startFrom"))
	startTo := parseTimeQuery(q.Get("startTo"))

	minParticipants, hasMin := parseOptionalIntString(q.Get("minParticipants"))
	maxParticipants, hasMax := parseOptionalIntString(q.Get("maxParticipants"))

	filter := store.ContestPublicFilter{
		Status:    status,
		StartFrom: startFrom,
		StartTo:   startTo,
		Now:       time.Now(),
	}

	var items []store.ContestPublicListItem
	var total int
	var err error

	if hasMin || hasMax {
		items, total, err = a.store.ListPublishedContestsAll(r.Context(), filter, minParticipants, maxParticipants, page, pageSize)
	} else {
		items, total, err = a.store.ListPublishedContestsPaged(r.Context(), filter, page, pageSize)
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"items":    items,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	})
}

func (a *App) handleContestPublicDetail(w http.ResponseWriter, r *http.Request) {
	id, ok := parseIntParam(chi.URLParam(r, "id"))
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid contest id"})
		return
	}
	u, _ := a.tryUserFromAuthHeader(r)

	contest, err := a.store.GetContestWithProblemsPublic(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]any{"error": "Contest not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}

	if contest.HasPassword {
		joined, err := a.store.HasContestParticipant(r.Context(), id, u.ID)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
			return
		}
		if !joined {
			writeJSON(w, http.StatusForbidden, map[string]any{"error": "Password required"})
			return
		}
	}

	writeJSON(w, http.StatusOK, contest)
}

func (a *App) handleContestPublicProblem(w http.ResponseWriter, r *http.Request) {
	id, ok := parseIntParam(chi.URLParam(r, "id"))
	if !ok || id <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid contest id"})
		return
	}
	order, okOrder := parseIntParam(chi.URLParam(r, "order"))
	if !okOrder || order < 0 {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid problem order"})
		return
	}
	u, _ := a.tryUserFromAuthHeader(r)
	contest, err := a.store.GetContestByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]any{"error": "Contest not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	if !contest.IsPublished {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "Contest not published"})
		return
	}
	if contest.PasswordHash != nil {
		joined, err := a.store.HasContestParticipant(r.Context(), id, u.ID)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
			return
		}
		if !joined {
			writeJSON(w, http.StatusForbidden, map[string]any{"error": "Password required"})
			return
		}
	}
	pid, err := a.store.GetContestProblemIDByOrder(r.Context(), id, order)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]any{"error": "Problem not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	p, err := a.store.GetProblemWithTestCases(r.Context(), pid)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]any{"error": "Problem not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, p)
}
func (a *App) handleContestPublicAttachmentsList(w http.ResponseWriter, r *http.Request) {
	id, ok := parseIntParam(chi.URLParam(r, "id"))
	if !ok || id <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid contest id"})
		return
	}
	u, _ := a.tryUserFromAuthHeader(r)
	contest, err := a.store.GetContestByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]any{"error": "Contest not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	if !contest.IsPublished {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "Contest not published"})
		return
	}
	if contest.PasswordHash != nil {
		joined, err := a.store.HasContestParticipant(r.Context(), id, u.ID)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
			return
		}
		if !joined {
			writeJSON(w, http.StatusForbidden, map[string]any{"error": "Password required"})
			return
		}
	}
	dir := filepath.Join("data", "contest_attachments", strconv.Itoa(id))
	entries, err := os.ReadDir(dir)
	if err != nil {
		writeJSON(w, http.StatusOK, []map[string]any{})
		return
	}
	out := make([]map[string]any, 0, len(entries))
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		out = append(out, map[string]any{
			"name": e.Name(),
			"size": info.Size(),
		})
	}
	writeJSON(w, http.StatusOK, out)
}
func (a *App) handleContestPublicAttachmentDownload(w http.ResponseWriter, r *http.Request) {
	id, ok := parseIntParam(chi.URLParam(r, "id"))
	if !ok || id <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid contest id"})
		return
	}
	filename := strings.TrimSpace(chi.URLParam(r, "filename"))
	if filename == "" || strings.Contains(filename, "/") || strings.Contains(filename, `\`) {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid filename"})
		return
	}
	u, _ := a.tryUserFromAuthHeader(r)
	contest, err := a.store.GetContestByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]any{"error": "Contest not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	if !contest.IsPublished {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "Contest not published"})
		return
	}
	if contest.PasswordHash != nil {
		joined, err := a.store.HasContestParticipant(r.Context(), id, u.ID)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
			return
		}
		if !joined {
			writeJSON(w, http.StatusForbidden, map[string]any{"error": "Password required"})
			return
		}
	}
	path := filepath.Join("data", "contest_attachments", strconv.Itoa(id), filename)
	f, err := os.Open(path)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "File not found"})
		return
	}
	defer f.Close()
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
	_, _ = io.Copy(w, f)
}
func (a *App) handleContestAttachmentUpload(w http.ResponseWriter, r *http.Request) {
	id, ok := parseIntParam(chi.URLParam(r, "id"))
	if !ok || id <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid contest id"})
		return
	}
	if err := r.ParseMultipartForm(16 << 20); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid form"})
		return
	}
	files := r.MultipartForm.File["files"]
	if len(files) == 0 {
		if f := r.MultipartForm.File["file"]; len(f) > 0 {
			files = f
		}
	}
	if len(files) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "No files"})
		return
	}
	dir := filepath.Join("data", "contest_attachments", strconv.Itoa(id))
	_ = os.MkdirAll(dir, 0o755)
	saved := []string{}
	for _, fh := range files {
		name := strings.TrimSpace(fh.Filename)
		if name == "" || strings.Contains(name, "/") || strings.Contains(name, `\`) {
			continue
		}
		src, err := fh.Open()
		if err != nil {
			continue
		}
		defer src.Close()
		dstPath := filepath.Join(dir, name)
		dst, err := os.Create(dstPath)
		if err != nil {
			continue
		}
		_, _ = io.Copy(dst, src)
		_ = dst.Close()
		saved = append(saved, name)
	}
	writeJSON(w, http.StatusOK, map[string]any{"saved": saved})
}
func (a *App) handleContestPublicLeaderboard(w http.ResponseWriter, r *http.Request) {
	id, ok := parseIntParam(chi.URLParam(r, "id"))
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid contest id"})
		return
	}
	q := r.URL.Query()
	page := parsePositiveIntDefault(q.Get("page"), 1)
	pageSize := parsePositiveIntDefault(q.Get("pageSize"), 20)
	if pageSize > 100 {
		pageSize = 100
	}
	sortParam := strings.TrimSpace(q.Get("sort"))
	orderParam := strings.TrimSpace(q.Get("order"))
	asc := strings.EqualFold(orderParam, "asc")
	contest, err := a.store.GetContestByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]any{"error": "Contest not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	if !contest.IsPublished {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "Contest not published"})
		return
	}
	now := time.Now()
	scoreVisible := true
	if strings.EqualFold(contest.Rule, "OI") && now.Before(contest.EndTime) {
		scoreVisible = false
	}
	var sortBy string
	if strings.EqualFold(sortParam, "score") && scoreVisible {
		sortBy = "totalScore"
	} else {
		if scoreVisible {
			sortBy = "totalScore"
		} else {
			sortBy = "submissionCount"
		}
	}
	items, total, err := a.store.ListContestLeaderboardPaged(r.Context(), id, contest.Rule, page, pageSize, sortBy, asc)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	type row struct {
		Rank            int                               `json:"rank"`
		Username        string                            `json:"username"`
		SubmissionCount int                               `json:"submissionCount"`
		Score           int                               `json:"score"`
		ProblemScores   map[int]store.ContestProblemScore `json:"problemScores"`
	}
	out := make([]row, 0, len(items))
	for i, it := range items {
		out = append(out, row{
			Rank:            (page-1)*pageSize + i + 1,
			Username:        it.Username,
			SubmissionCount: it.SubmissionCount,
			Score:           it.TotalScore,
			ProblemScores:   it.ProblemScores,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"items":        out,
		"scoreVisible": scoreVisible,
		"total":        total,
		"page":         page,
		"pageSize":     pageSize,
		"sort":         sortParam,
		"order":        strings.ToLower(orderParam),
	})
}
func (a *App) handleContestJoin(w http.ResponseWriter, r *http.Request) {
	id, ok := parseIntParam(chi.URLParam(r, "id"))
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid contest id"})
		return
	}
	u, _ := a.currentUser(r)

	contest, err := a.store.GetContestByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]any{"error": "Contest not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}

	if contest.PasswordHash != nil {
		var body struct {
			Password any `json:"password"`
		}
		_ = readJSON(r, &body)
		pw, _ := body.Password.(string)

		const maxAttempts = 5
		window := 5 * time.Minute

		attempt, found, err := a.store.GetContestPasswordAttempt(r.Context(), id, u.ID)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
			return
		}
		now := time.Now()
		if found && attempt.LastFailedAt != nil && now.Sub(*attempt.LastFailedAt) <= window && attempt.FailedCount >= maxAttempts {
			writeJSON(w, http.StatusTooManyRequests, map[string]any{
				"error":             "Too many incorrect attempts, please try again later",
				"remainingAttempts": 0,
			})
			return
		}

		if strings.TrimSpace(pw) == "" {
			newCount := 1
			if found && attempt.LastFailedAt != nil && now.Sub(*attempt.LastFailedAt) <= window {
				newCount = attempt.FailedCount + 1
			}
			if _, err := a.store.UpsertContestPasswordAttempt(r.Context(), id, u.ID, newCount, now); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
				return
			}
			remaining := max(0, maxAttempts-newCount)
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Password is required", "remainingAttempts": remaining})
			return
		}

		if bcrypt.CompareHashAndPassword([]byte(*contest.PasswordHash), []byte(pw)) != nil {
			newCount := 1
			if found && attempt.LastFailedAt != nil && now.Sub(*attempt.LastFailedAt) <= window {
				newCount = attempt.FailedCount + 1
			}
			if _, err := a.store.UpsertContestPasswordAttempt(r.Context(), id, u.ID, newCount, now); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
				return
			}
			remaining := max(0, maxAttempts-newCount)
			writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "Incorrect password", "remainingAttempts": remaining})
			return
		}

		if found {
			_ = a.store.DeleteContestPasswordAttempt(r.Context(), id, u.ID)
		}
	}

	if err := a.store.UpsertContestParticipant(r.Context(), id, u.ID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"success": true})
}

func (a *App) handleContestAdminList(w http.ResponseWriter, r *http.Request) {
	items, err := a.store.ListContestsAdmin(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *App) handleContestAdminGet(w http.ResponseWriter, r *http.Request) {
	id, ok := parseIntParam(chi.URLParam(r, "id"))
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid contest id"})
		return
	}
	contest, err := a.store.GetContestAdmin(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]any{"error": "Contest not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, contest)
}

func (a *App) handleContestAdminUpdate(w http.ResponseWriter, r *http.Request) {
	id, ok := parseIntParam(chi.URLParam(r, "id"))
	if !ok || id <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid contest id"})
		return
	}

	var raw map[string]any
	if err := readJSON(r, &raw); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid JSON"})
		return
	}
	name, _ := raw["name"].(string)
	if strings.TrimSpace(name) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Contest name is required"})
		return
	}
	startStr, _ := raw["startTime"].(string)
	endStr, _ := raw["endTime"].(string)
	if strings.TrimSpace(startStr) == "" || strings.TrimSpace(endStr) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Start and end time are required"})
		return
	}
	start, err1 := time.Parse(time.RFC3339, startStr)
	end, err2 := time.Parse(time.RFC3339, endStr)
	if err1 != nil || err2 != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid start or end time"})
		return
	}
	if !end.After(start) {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "End time must be after start time"})
		return
	}
	rule, _ := raw["rule"].(string)
	if rule != "OI" && rule != "IOI" && rule != "ACM" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid contest rule"})
		return
	}

	description := ""
	if v, ok := raw["description"].(string); ok {
		description = v
	}

	languages := normalizeAllowedLanguages(raw["languages"])

	var hasProblemIDs bool
	if _, ok := raw["problemIds"]; ok {
		hasProblemIDs = true
	}
	problemIDs := normalizeIntList(raw["problemIds"])

	var passwordHashUpdate *string
	var updatePassword bool
	if pwRaw, ok := raw["password"]; ok {
		updatePassword = true
		pw, _ := pwRaw.(string)
		pw = strings.TrimSpace(pw)
		if pw == "" {
			passwordHashUpdate = nil
		} else {
			b, err := bcrypt.GenerateFromPassword([]byte(pw), 10)
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
				return
			}
			s := string(b)
			passwordHashUpdate = &s
		}
	}

	var isPublished *bool
	if v, ok := raw["isPublished"].(bool); ok {
		isPublished = &v
	}

	err := a.store.UpdateContest(r.Context(), store.UpdateContestParams{
		ID:             id,
		Name:           name,
		Description:    description,
		StartTime:      start,
		EndTime:        end,
		Rule:           rule,
		Languages:      languages,
		IsPublished:    isPublished,
		UpdatePassword: updatePassword,
		PasswordHash:   passwordHashUpdate,
		UpdateProblems: hasProblemIDs,
		ProblemIDs:     problemIDs,
	})
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]any{"error": "Contest not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}

	contest, err := a.store.GetContestAdmin(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, contest)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func readJSON(r *http.Request, dst any) error {
	defer r.Body.Close()
	dec := json.NewDecoder(r.Body)
	return dec.Decode(dst)
}

func parseIntParam(s string) (int, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0, false
	}
	n, err := strconv.Atoi(s)
	return n, err == nil
}

func parseIntAny(v any) (int, bool) {
	switch x := v.(type) {
	case float64:
		return int(x), true
	case float32:
		return int(x), true
	case int:
		return x, true
	case int64:
		return int(x), true
	case json.Number:
		i, err := x.Int64()
		return int(i), err == nil
	case string:
		return parseIntParam(x)
	default:
		return 0, false
	}
}

func parseOptionalIntAny(v any) (int, bool) {
	n, ok := parseIntAny(v)
	if !ok {
		return 0, false
	}
	return n, true
}

func parsePositiveIntDefault(s string, def int) int {
	if n, ok := parseIntParam(s); ok && n > 0 {
		return n
	}
	return def
}

func parseTags(q map[string][]string) []string {
	var out []string
	if vals, ok := q["tags"]; ok && len(vals) > 0 {
		for _, v := range vals {
			out = append(out, splitCSV(v)...)
		}
		return uniqNonEmpty(out)
	}
	return nil
}

func splitCSV(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func uniqNonEmpty(in []string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(in))
	for _, s := range in {
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		if _, ok := seen[s]; ok {
			continue
		}
		seen[s] = struct{}{}
		out = append(out, s)
	}
	return out
}

func normalizeStringList(v any) []string {
	switch x := v.(type) {
	case string:
		return uniqNonEmpty(splitCSV(x))
	case []any:
		out := make([]string, 0, len(x))
		for _, item := range x {
			if s, ok := item.(string); ok {
				out = append(out, s)
			}
		}
		return uniqNonEmpty(out)
	default:
		return nil
	}
}

func normalizeIntList(v any) []int {
	arr, ok := v.([]any)
	if !ok {
		return nil
	}
	seen := map[int]struct{}{}
	out := make([]int, 0, len(arr))
	for _, item := range arr {
		n, ok := parseIntAny(item)
		if !ok {
			continue
		}
		if _, exists := seen[n]; exists {
			continue
		}
		seen[n] = struct{}{}
		out = append(out, n)
	}
	return out
}

func normalizeAllowedLanguages(v any) []string {
	in := normalizeStringList(v)
	if len(in) == 0 {
		return nil
	}
	allowed := map[string]struct{}{"cpp": {}, "python": {}}
	out := make([]string, 0, len(in))
	for _, l := range in {
		l = strings.TrimSpace(l)
		if _, ok := allowed[l]; ok {
			out = append(out, l)
		}
	}
	return uniqNonEmpty(out)
}

func parseTimeQuery(s string) *time.Time {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		return nil
	}
	return &t
}

func parseOptionalIntString(s string) (int, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0, false
	}
	n, ok := parseIntParam(s)
	return n, ok
}

func safeSegment(value string) string {
	if strings.TrimSpace(value) == "" {
		return "unknown"
	}
	var b strings.Builder
	for _, r := range value {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' || r == '-' {
			b.WriteRune(r)
		} else {
			b.WriteByte('_')
		}
	}
	return b.String()
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// Footer handlers
func (a *App) handleFooterGet(w http.ResponseWriter, r *http.Request) {
	content, err := a.store.GetFooterContent(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"content": content})
}

func (a *App) handleFooterPut(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Content string `json:"content"`
	}
	if err := readJSON(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid JSON"})
		return
	}
	content, err := a.store.UpsertFooterContent(r.Context(), body.Content)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"content": content})
}

// Rate limit handlers
func (a *App) handleRateLimitGet(w http.ResponseWriter, r *http.Request) {
	limit, err := a.store.GetSubmissionRateLimit(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"limit": limit})
}

func (a *App) handleRateLimitPut(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Limit int `json:"limit"`
	}
	if err := readJSON(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid JSON"})
		return
	}
	if body.Limit < 1 || body.Limit > 100 {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Rate limit must be between 1 and 100"})
		return
	}
	limit, err := a.store.UpsertSubmissionRateLimit(r.Context(), body.Limit)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"limit": limit})
}

func (a *App) handleGetPreferences(w http.ResponseWriter, r *http.Request) {
	u, _ := a.currentUser(r)
	// Re-fetch user to get latest preferences
	user, err := a.store.GetUserByID(r.Context(), u.ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	// Return empty object if preferences is nil
	if user.Preferences == nil {
		writeJSON(w, http.StatusOK, map[string]any{"preferences": map[string]any{}})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"preferences": user.Preferences})
}

func (a *App) handleUpdatePreferences(w http.ResponseWriter, r *http.Request) {
	u, _ := a.currentUser(r)
	var body struct {
		Preferences json.RawMessage `json:"preferences"`
	}
	if err := readJSON(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid JSON"})
		return
	}

	if err := a.store.UpdateUserPreferences(r.Context(), u.ID, body.Preferences); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"success": true})
}

// User management handlers
func (a *App) handleUserList(w http.ResponseWriter, r *http.Request) {
	users, err := a.store.ListUsers(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, users)
}

func (a *App) handleUserBan(w http.ResponseWriter, r *http.Request) {
	id, ok := parseIntParam(chi.URLParam(r, "id"))
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid user id"})
		return
	}
	var body struct {
		Reason string `json:"reason"`
		BanIP  bool   `json:"banIP"`
	}
	_ = readJSON(r, &body)

	// Check if user exists
	user, err := a.store.GetUserByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]any{"error": "User not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}

	// Cannot ban admins
	if user.Role == "ADMIN" {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": "Cannot ban admin users"})
		return
	}

	if err := a.store.BanUser(r.Context(), id, body.Reason); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"success": true})
}

func (a *App) handleUserUnban(w http.ResponseWriter, r *http.Request) {
	id, ok := parseIntParam(chi.URLParam(r, "id"))
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid user id"})
		return
	}

	if err := a.store.UnbanUser(r.Context(), id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]any{"error": "User not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"success": true})
}

func (a *App) handleUserDelete(w http.ResponseWriter, r *http.Request) {
	id, ok := parseIntParam(chi.URLParam(r, "id"))
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid user id"})
		return
	}

	var body struct {
		BanIP bool `json:"banIP"`
	}
	_ = readJSON(r, &body)

	// Check if user exists
	user, err := a.store.GetUserByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]any{"error": "User not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}

	// Cannot delete admins
	if user.Role == "ADMIN" {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": "Cannot delete admin users"})
		return
	}

	if err := a.store.DeleteUser(r.Context(), id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"success": true})
}

func (a *App) handleUserDeleteSubmissions(w http.ResponseWriter, r *http.Request) {
	id, ok := parseIntParam(chi.URLParam(r, "id"))
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid user id"})
		return
	}

	count, err := a.store.DeleteUserSubmissions(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"success": true, "deleted": count})
}

func (a *App) handleAdminDeleteSubmission(w http.ResponseWriter, r *http.Request) {
	id, ok := parseIntParam(chi.URLParam(r, "id"))
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid submission id"})
		return
	}

	if err := a.store.DeleteSubmission(r.Context(), id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]any{"error": "Submission not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"success": true})
}

// Banned IP handlers
func (a *App) handleBannedIPList(w http.ResponseWriter, r *http.Request) {
	ips, err := a.store.ListBannedIPs(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, ips)
}

func (a *App) handleBanIP(w http.ResponseWriter, r *http.Request) {
	var body struct {
		IP        string  `json:"ip"`
		UserID    *int    `json:"userId"`
		Reason    string  `json:"reason"`
		ExpiresAt *string `json:"expiresAt"`
	}
	if err := readJSON(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid JSON"})
		return
	}
	if strings.TrimSpace(body.IP) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "IP is required"})
		return
	}

	var expiresAt *time.Time
	if body.ExpiresAt != nil && *body.ExpiresAt != "" {
		t, err := time.Parse(time.RFC3339, *body.ExpiresAt)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid expiresAt format"})
			return
		}
		expiresAt = &t
	}

	if err := a.store.BanIP(r.Context(), body.IP, body.UserID, body.Reason, expiresAt); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"success": true})
}

func (a *App) handleUnbanIP(w http.ResponseWriter, r *http.Request) {
	ip := chi.URLParam(r, "ip")
	if strings.TrimSpace(ip) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid IP"})
		return
	}

	if err := a.store.UnbanIP(r.Context(), ip); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]any{"error": "IP not found in ban list"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"success": true})
}

// getClientIP extracts the client IP from the request
func getClientIP(r *http.Request) string {
	// Check X-Forwarded-For header
	xff := r.Header.Get("X-Forwarded-For")
	if xff != "" {
		ips := strings.Split(xff, ",")
		if len(ips) > 0 {
			return strings.TrimSpace(ips[0])
		}
	}
	// Check X-Real-IP header
	xri := r.Header.Get("X-Real-IP")
	if xri != "" {
		return xri
	}
	// Fall back to RemoteAddr
	ip := r.RemoteAddr
	if idx := strings.LastIndex(ip, ":"); idx != -1 {
		ip = ip[:idx]
	}
	return ip
}
