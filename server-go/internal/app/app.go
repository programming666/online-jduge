package app

import (
	"archive/zip"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
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
	store          *store.Store
	jwtSecret      []byte
	docker         *judger.DockerRunner
	httpRouter     http.Handler
	codeRunMu      sync.Mutex
	codeRunHistory map[int][]time.Time
	geoIPService   *GeoIPService
	sensitiveCache sync.Map
	judgeQueue     chan judgeTask
	judgeOnce      sync.Once
	memoryThrottle uint32
}

type judgeTask struct {
	submissionID int
	problem      store.ProblemWithTestCases
	code         string
	language     string
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
		store:          store.New(cfg.DB),
		jwtSecret:      []byte(secret),
		docker:         runner,
		codeRunHistory: make(map[int][]time.Time),
		geoIPService:   NewGeoIPService(),
		judgeQueue:     make(chan judgeTask, 128),
	}
	a.startJudgeWorkers()
	a.startMemoryMonitor()
	a.httpRouter = a.buildRouter()
	return a, nil
}

func (a *App) startJudgeWorkers() {
	a.judgeOnce.Do(func() {
		workerCount := 2
		for i := 0; i < workerCount; i++ {
			go func() {
				for task := range a.judgeQueue {
					a.judgeSubmission(task.submissionID, task.problem, task.code, task.language)
				}
			}()
		}
	})
}

func (a *App) isMemoryThrottled() bool {
	return atomic.LoadUint32(&a.memoryThrottle) == 1
}

func (a *App) setMemoryThrottled(on bool) {
	if on {
		atomic.StoreUint32(&a.memoryThrottle, 1)
	} else {
		atomic.StoreUint32(&a.memoryThrottle, 0)
	}
}

func (a *App) startMemoryMonitor() {
	go func() {
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			hostUsed, hostTotal := readHostMemory()
			cgUsed, cgLimit := readCgroupMemory()
			var hostRatio float64
			var cgRatio float64
			if hostTotal > 0 && hostUsed >= 0 {
				hostRatio = float64(hostUsed) / float64(hostTotal)
			}
			if cgLimit > 0 && cgUsed >= 0 {
				cgRatio = float64(cgUsed) / float64(cgLimit)
			}

			throttleOn := hostRatio > 0.8 || cgRatio > 0.8
			throttleOff := hostRatio < 0.6 && cgRatio < 0.6

			if throttleOn && !a.isMemoryThrottled() {
				a.setMemoryThrottled(true)
				log.Printf("[memory-monitor] enable throttle host=%.1f%% cgroup=%.1f%%", hostRatio*100, cgRatio*100)
			} else if throttleOff && a.isMemoryThrottled() {
				a.setMemoryThrottled(false)
				log.Printf("[memory-monitor] disable throttle host=%.1f%% cgroup=%.1f%%", hostRatio*100, cgRatio*100)
			}

			go func() {
				cmd := exec.Command("free", "-h")
				out, err := cmd.CombinedOutput()
				if err == nil {
					log.Printf("[memory-monitor] free -h output:\n%s", string(out))
				}
			}()
		}
	}()
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
		r.Use(a.logAccess)
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

		r.With(a.authenticateToken).Post("/run", a.handleRunCode)

		r.Route("/settings", func(r chi.Router) {
			r.Get("/registration", a.handleRegistrationGet)
			r.With(a.authenticateToken, a.authorizeAdmin).Put("/registration", a.handleRegistrationPut)
			r.Get("/homepage", a.handleHomepageGet)
			r.With(a.authenticateToken, a.authorizeAdmin).Put("/homepage", a.handleHomepagePut)
			r.Get("/footer", a.handleFooterGet)
			r.With(a.authenticateToken, a.authorizeAdmin).Put("/footer", a.handleFooterPut)
			r.Get("/rate-limit", a.handleRateLimitGet)
			r.With(a.authenticateToken, a.authorizeAdmin).Put("/rate-limit", a.handleRateLimitPut)
			r.Get("/code-run-rate-limit", a.handleCodeRunRateLimitGet)
			r.With(a.authenticateToken, a.authorizeAdmin).Put("/code-run-rate-limit", a.handleCodeRunRateLimitPut)
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
			r.Delete("/id/{id}", a.handleUnbanIPByID)
		})

		r.Route("/admin/access-history", func(r chi.Router) {
			r.Use(a.authenticateToken, a.authorizeAdmin)
			r.Get("/", a.handleAccessHistoryList)
			r.Get("/user/{id}", a.handleUserAccessHistory)
			r.Get("/user/{id}/ips", a.handleUserIPAssociations)
		})

		r.Route("/admin/security", func(r chi.Router) {
			r.Use(a.authenticateToken, a.authorizeAdmin)
			r.Get("/error-stats", a.handleErrorStats)
			r.Get("/sensitive-report", a.handleSensitiveReport)
			r.Get("/ip-marks", a.handleIPMarkList)
			r.Put("/ip-marks/{ip}", a.handleIPMarkUpsert)
			r.Delete("/ip-marks/{ip}", a.handleIPMarkDelete)
			r.Get("/ip-marks/{ip}/associations", a.handleIPMarkAssociations)
			r.Get("/system-status", a.handleSystemStatus)
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

type accessResponseWriter struct {
	http.ResponseWriter
	status int
}

func (w *accessResponseWriter) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}

func (a *App) logAccess(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u, ok := a.currentUser(r)
		if !ok {
			next.ServeHTTP(w, r)
			return
		}
		aw := &accessResponseWriter{ResponseWriter: w, status: http.StatusOK}
		start := time.Now()
		next.ServeHTTP(aw, r)
		_ = start
		path := r.URL.RequestURI()
		if len(path) > 1024 {
			path = path[:1024]
		}
		isSensitive := a.isSensitivePath(path)
		status := aw.status
		accessType := r.Method
		if status == http.StatusServiceUnavailable && aw.Header().Get("X-System-Status") == "memory_throttle" {
			accessType = "MEMORY_THROTTLED"
		}
		go func(userID int, ip, ua, accessType, requestPath string, statusCode int, webrtcIP string, sensitive bool) {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			ipToUse := ip
			geoInfo := a.geoIPService.LookupIP(ipToUse)
			browser, osName := ParseUserAgent(ua)
			strPtr := func(s string) *string {
				if s == "" {
					return nil
				}
				return &s
			}
			var statusPtr *int
			if statusCode > 0 {
				v := statusCode
				statusPtr = &v
			}
			reqPath := requestPath
			var reqPathPtr *string
			if reqPath != "" {
				reqPathPtr = &reqPath
			}
			params := store.CreateAccessHistoryParams{
				UserID:      userID,
				IP:          ipToUse,
				UserAgent:   strPtr(ua),
				AccessType:  accessType,
				Country:     strPtr(geoInfo.Country),
				Province:    strPtr(geoInfo.Province),
				City:        strPtr(geoInfo.City),
				ISP:         strPtr(geoInfo.ISP),
				Browser:     strPtr(browser),
				OS:          strPtr(osName),
				WebRTCIP:    strPtr(webrtcIP),
				StatusCode:  statusPtr,
				RequestPath: reqPathPtr,
				IsSensitive: sensitive,
			}
			_ = a.store.CreateAccessHistory(ctx, params)
		}(u.ID, getClientIP(r), r.UserAgent(), accessType, path, status, r.Header.Get("X-WebRTC-IP"), isSensitive)
	})
}

func (a *App) isSensitivePath(p string) bool {
	if v, ok := a.sensitiveCache.Load(p); ok {
		if b, ok := v.(bool); ok {
			return b
		}
	}
	l := strings.ToLower(p)
	sensitive := false
	if strings.HasPrefix(l, "/api/admin") ||
		strings.HasPrefix(l, "/admin") ||
		strings.HasPrefix(l, "/.git") ||
		strings.HasPrefix(l, "/.env") ||
		strings.Contains(l, "config") {
		sensitive = true
	}
	a.sensitiveCache.Store(p, sensitive)
	return sensitive
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

	// Record access history asynchronously
	go func() {
		a.recordAccessHistory(u.ID, clientIP, r.UserAgent(), "LOGIN", r.Header.Get("X-WebRTC-IP"))
	}()

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
	select {
	case a.judgeQueue <- judgeTask{submissionID: subID, problem: problemForJudge, code: code, language: language}:
	default:
		go a.judgeSubmission(subID, problemForJudge, code, language)
	}

	writeJSON(w, http.StatusOK, sub)
}

func (a *App) handleRunCode(w http.ResponseWriter, r *http.Request) {
	u, ok := a.currentUser(r)
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	user, err := a.store.GetUserByID(r.Context(), u.ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "Failed to check user status"})
		return
	}
	if user.IsBanned {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": "Your account has been banned"})
		return
	}

	clientIP := getClientIP(r)
	isBanned, err := a.store.IsIPBanned(r.Context(), clientIP)
	if err == nil && isBanned {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": "Your IP has been banned"})
		return
	}

	if a.isMemoryThrottled() {
		w.Header().Set("X-System-Status", "memory_throttle")
		log.Printf("[memory-throttle] 内存限流拒绝 user=%d ip=%s path=%s", u.ID, clientIP, r.URL.Path)
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{
			"error": "System is under memory pressure. Please try test run later.",
		})
		return
	}

	allowed, limit, used, err := a.allowCodeRun(r.Context(), u.ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "Failed to check rate limit"})
		return
	}
	if !allowed {
		writeJSON(w, http.StatusTooManyRequests, map[string]any{
			"error":  "Code run rate limit exceeded. Please wait before testing again.",
			"limit":  limit,
			"used":   used,
			"window": "1 minute",
		})
		return
	}

	var body struct {
		ProblemID int    `json:"problemId"`
		Language  string `json:"language"`
		Code      string `json:"code"`
		Input     string `json:"input"`
	}
	if err := readJSON(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid JSON"})
		return
	}
	if body.ProblemID <= 0 || strings.TrimSpace(body.Code) == "" || strings.TrimSpace(body.Language) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid payload"})
		return
	}

	p, err := a.store.GetProblemWithTestCases(r.Context(), body.ProblemID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]any{"error": "Problem not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}

	timeLimit := p.TimeLimit
	if len(p.Config) > 0 {
		var cfg map[string]map[string]any
		if json.Unmarshal(p.Config, &cfg) == nil {
			if langCfg, ok := cfg[body.Language]; ok {
				if tl, ok := parseIntAny(langCfg["timeLimit"]); ok && tl > 0 {
					timeLimit = tl
				}
			}
		}
	}

	opts := judger.Options{
		TimeLimitMs:    timeLimit,
		MemoryLimitMB:  p.MemoryLimit,
		CompileOptions: p.DefaultCompileOptions,
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Minute)
	defer cancel()

	testCases := []judger.TestCase{
		{
			Input:          body.Input,
			ExpectedOutput: "",
		},
	}

	judgeRes, _ := a.docker.Judge(ctx, body.Language, body.Code, testCases, opts)

	if judgeRes.Status != "Judged" || len(judgeRes.Results) == 0 {
		writeJSON(w, http.StatusOK, map[string]any{
			"status": judgeRes.Status,
			"output": judgeRes.Output,
		})
		return
	}

	res := judgeRes.Results[0]
	writeJSON(w, http.StatusOK, map[string]any{
		"status":     res.Status,
		"output":     res.Output,
		"timeUsed":   res.TimeUsed,
		"memoryUsed": res.MemoryUsed,
	})
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

	u, okUser := a.tryUserFromAuthHeader(r)
	userID := 0
	if okUser {
		userID = u.ID
	}

	if hasMin || hasMax {
		items, total, err = a.store.ListPublishedContestsAll(r.Context(), filter, userID, minParticipants, maxParticipants, page, pageSize)
	} else {
		items, total, err = a.store.ListPublishedContestsPaged(r.Context(), filter, userID, page, pageSize)
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
	u, okUser := a.tryUserFromAuthHeader(r)

	contest, err := a.store.GetContestWithProblemsPublic(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]any{"error": "Contest not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}

	now := time.Now()
	if now.After(contest.EndTime) {
		if !okUser {
			writeJSON(w, http.StatusForbidden, map[string]any{"error": "Only participants can view finished contests"})
			return
		}
		joined, err := a.store.HasContestParticipant(r.Context(), id, u.ID)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
			return
		}
		if !joined {
			writeJSON(w, http.StatusForbidden, map[string]any{"error": "Only participants can view finished contests"})
			return
		}
	} else if contest.HasPassword {
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
	u, okUser := a.tryUserFromAuthHeader(r)
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
	if now.After(contest.EndTime) {
		if !okUser {
			writeJSON(w, http.StatusForbidden, map[string]any{"error": "Only participants can view finished contests"})
			return
		}
		joined, err := a.store.HasContestParticipant(r.Context(), id, u.ID)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
			return
		}
		if !joined {
			writeJSON(w, http.StatusForbidden, map[string]any{"error": "Only participants can view finished contests"})
			return
		}
	} else if contest.PasswordHash != nil {
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
	u, okUser := a.tryUserFromAuthHeader(r)
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
	if now.After(contest.EndTime) {
		if !okUser {
			writeJSON(w, http.StatusForbidden, map[string]any{"error": "Only participants can view finished contests"})
			return
		}
		joined, err := a.store.HasContestParticipant(r.Context(), id, u.ID)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
			return
		}
		if !joined {
			writeJSON(w, http.StatusForbidden, map[string]any{"error": "Only participants can view finished contests"})
			return
		}
	} else if contest.PasswordHash != nil {
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
	u, okUser := a.tryUserFromAuthHeader(r)
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
	if now.After(contest.EndTime) {
		if !okUser {
			writeJSON(w, http.StatusForbidden, map[string]any{"error": "Only participants can view finished contests"})
			return
		}
		joined, err := a.store.HasContestParticipant(r.Context(), id, u.ID)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
			return
		}
		if !joined {
			writeJSON(w, http.StatusForbidden, map[string]any{"error": "Only participants can view finished contests"})
			return
		}
	} else if contest.PasswordHash != nil {
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

func (a *App) allowCodeRun(ctx context.Context, userID int) (bool, int, int, error) {
	limit, err := a.store.GetCodeRunRateLimit(ctx)
	if err != nil {
		return false, 0, 0, err
	}
	now := time.Now()
	windowStart := now.Add(-time.Minute)

	a.codeRunMu.Lock()
	defer a.codeRunMu.Unlock()

	times := a.codeRunHistory[userID]
	pruned := times[:0]
	for _, ts := range times {
		if ts.After(windowStart) {
			pruned = append(pruned, ts)
		}
	}
	times = pruned
	used := len(times)
	if used >= limit {
		a.codeRunHistory[userID] = times
		return false, limit, used, nil
	}
	times = append(times, now)
	a.codeRunHistory[userID] = times
	return true, limit, len(times), nil
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

func (a *App) handleCodeRunRateLimitGet(w http.ResponseWriter, r *http.Request) {
	limit, err := a.store.GetCodeRunRateLimit(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"limit": limit})
}

func (a *App) handleCodeRunRateLimitPut(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Limit int `json:"limit"`
	}
	if err := readJSON(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid JSON"})
		return
	}
	if body.Limit < 1 || body.Limit > 60 {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Rate limit must be between 1 and 60"})
		return
	}
	limit, err := a.store.UpsertCodeRunRateLimit(r.Context(), body.Limit)
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

	var bannedIPCount int
	var banErr error

	if body.BanIP {
		// Smart ban: ban user and all associated IPs
		bannedIPCount, banErr = a.store.BanUserWithAllIPs(r.Context(), id, body.Reason)
	} else {
		// Simple ban: only ban the user account
		banErr = a.store.BanUser(r.Context(), id, body.Reason)
	}

	if banErr != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": banErr.Error()})
		return
	}

	response := map[string]any{"success": true}
	if body.BanIP && bannedIPCount > 0 {
		response["bannedIPCount"] = bannedIPCount
	}
	writeJSON(w, http.StatusOK, response)
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

	userIDs, err := a.store.GetUsersByIP(r.Context(), body.IP)
	if err == nil {
		for _, uid := range userIDs {
			_, _ = a.store.BanUserWithAllIPs(r.Context(), uid, body.Reason)
		}
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

// handleUnbanIPByID removes a specific IP from the banned list by ID
func (a *App) handleUnbanIPByID(w http.ResponseWriter, r *http.Request) {
	id, ok := parseIntParam(chi.URLParam(r, "id"))
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid ID"})
		return
	}

	if err := a.store.UnbanIPByID(r.Context(), id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]any{"error": "Banned IP not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"success": true})
}

// Access History handlers

// handleAccessHistoryList returns all access history records
func (a *App) handleAccessHistoryList(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit := 100
	if l, ok := parseIntParam(q.Get("limit")); ok && l > 0 && l <= 1000 {
		limit = l
	}

	var userID *int
	if uid, ok := parseIntParam(q.Get("userId")); ok && uid > 0 {
		userID = &uid
	}

	records, err := a.store.ListAccessHistory(r.Context(), userID, limit)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, records)
}

// handleUserAccessHistory returns access history for a specific user
func (a *App) handleUserAccessHistory(w http.ResponseWriter, r *http.Request) {
	userID, ok := parseIntParam(chi.URLParam(r, "id"))
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid user id"})
		return
	}

	q := r.URL.Query()
	limit := 100
	if l, ok := parseIntParam(q.Get("limit")); ok && l > 0 && l <= 1000 {
		limit = l
	}

	records, err := a.store.GetAccessHistoryForUser(r.Context(), userID, limit)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, records)
}

// handleUserIPAssociations returns all IP associations for a user
func (a *App) handleUserIPAssociations(w http.ResponseWriter, r *http.Request) {
	userID, ok := parseIntParam(chi.URLParam(r, "id"))
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid user id"})
		return
	}

	associations, err := a.store.GetUserIPAssociations(r.Context(), userID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, associations)
}

func (a *App) handleErrorStats(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	fromStr := strings.TrimSpace(q.Get("from"))
	toStr := strings.TrimSpace(q.Get("to"))
	if fromStr == "" || toStr == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "from and to are required"})
		return
	}
	from, err1 := time.Parse(time.RFC3339, fromStr)
	to, err2 := time.Parse(time.RFC3339, toStr)
	if err1 != nil || err2 != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid from or to format, must be RFC3339"})
		return
	}
	if to.Before(from) {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "to must be after from"})
		return
	}

	var statusMin *int
	var statusMax *int
	if v := strings.TrimSpace(q.Get("statusMin")); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			statusMin = &n
		}
	}
	if v := strings.TrimSpace(q.Get("statusMax")); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			statusMax = &n
		}
	}
	var pathLike *string
	if v := strings.TrimSpace(q.Get("pathLike")); v != "" {
		pathLike = &v
	}

	stats, err := a.store.GetErrorStats(r.Context(), from, to, statusMin, statusMax, pathLike)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, stats)
}

func (a *App) handleSensitiveReport(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	fromStr := strings.TrimSpace(q.Get("from"))
	toStr := strings.TrimSpace(q.Get("to"))
	if fromStr == "" || toStr == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "from and to are required"})
		return
	}
	from, err1 := time.Parse(time.RFC3339, fromStr)
	to, err2 := time.Parse(time.RFC3339, toStr)
	if err1 != nil || err2 != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid from or to format, must be RFC3339"})
		return
	}
	if to.Before(from) {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "to must be after from"})
		return
	}
	limit := 100
	if v := strings.TrimSpace(q.Get("limit")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 1000 {
			limit = n
		}
	}

	rows, err := a.store.GetSensitiveAccessReport(r.Context(), from, to, limit)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, rows)
}

func (a *App) handleIPMarkList(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	var markType *string
	if v := strings.TrimSpace(q.Get("markType")); v != "" {
		markType = &v
	}
	limit := 50
	if v := strings.TrimSpace(q.Get("limit")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 500 {
			limit = n
		}
	}
	offset := 0
	if v := strings.TrimSpace(q.Get("offset")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			offset = n
		}
	}
	items, err := a.store.ListIPMarks(r.Context(), markType, limit, offset)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *App) handleIPMarkUpsert(w http.ResponseWriter, r *http.Request) {
	ip := strings.TrimSpace(chi.URLParam(r, "ip"))
	if ip == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "ip is required"})
		return
	}
	var body struct {
		MarkType string  `json:"markType"`
		Reason   *string `json:"reason"`
		ExpireAt *string `json:"expireAt"`
	}
	if err := readJSON(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid JSON"})
		return
	}
	mt := strings.ToUpper(strings.TrimSpace(body.MarkType))
	if mt != "MALICIOUS" && mt != "SUSPICIOUS" && mt != "WHITELIST" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid markType"})
		return
	}
	var expireAt *time.Time
	if body.ExpireAt != nil && strings.TrimSpace(*body.ExpireAt) != "" {
		t, err := time.Parse(time.RFC3339, strings.TrimSpace(*body.ExpireAt))
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "Invalid expireAt format"})
			return
		}
		expireAt = &t
	}
	u, _ := a.currentUser(r)
	var operator *string
	if u.Username != "" {
		op := u.Username
		operator = &op
	}
	if err := a.store.UpsertIPMark(r.Context(), ip, mt, body.Reason, expireAt, operator); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"success": true})
}

func (a *App) handleIPMarkDelete(w http.ResponseWriter, r *http.Request) {
	ip := strings.TrimSpace(chi.URLParam(r, "ip"))
	if ip == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "ip is required"})
		return
	}
	if err := a.store.DeleteIPMark(r.Context(), ip); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]any{"error": "mark not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"success": true})
}

func (a *App) handleIPMarkAssociations(w http.ResponseWriter, r *http.Request) {
	ip := strings.TrimSpace(chi.URLParam(r, "ip"))
	if ip == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "ip is required"})
		return
	}

	var mark any
	m, err := a.store.GetIPMark(r.Context(), ip)
	if err != nil {
		if !errors.Is(err, store.ErrNotFound) {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
			return
		}
	} else {
		mark = m
	}

	userIDs, err := a.store.GetUsersByIP(r.Context(), ip)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}

	assoc := []store.UserIPAssociation{}
	for _, uid := range userIDs {
		rows, err := a.store.GetUserIPAssociations(r.Context(), uid)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
			return
		}
		assoc = append(assoc, rows...)
	}

	history, err := a.store.ListAccessHistoryByIP(r.Context(), ip, 200)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"ip":           ip,
		"mark":         mark,
		"userIDs":      userIDs,
		"associations": assoc,
		"recentAccess": history,
	})
}

func (a *App) handleSystemStatus(w http.ResponseWriter, r *http.Request) {
	hostUsed, hostTotal := readHostMemory()
	cgUsed, cgLimit := readCgroupMemory()
	hostRatio := 0.0
	cgRatio := 0.0
	if hostTotal > 0 && hostUsed > 0 {
		hostRatio = float64(hostUsed) / float64(hostTotal)
	}
	if cgLimit > 0 && cgUsed > 0 {
		cgRatio = float64(cgUsed) / float64(cgLimit)
	}
	containerID := strings.TrimSpace(os.Getenv("HOSTNAME"))
	if containerID == "" {
		containerID = "unknown"
	}
	resp := map[string]any{
		"hostUsedBytes":    hostUsed,
		"hostTotalBytes":   hostTotal,
		"hostRatio":        hostRatio,
		"cgroupUsedBytes":  cgUsed,
		"cgroupLimitBytes": cgLimit,
		"cgroupRatio":      cgRatio,
		"memoryThrottle":   a.isMemoryThrottled(),
		"containerId":      containerID,
		"containerName":    containerID,
	}
	writeJSON(w, http.StatusOK, resp)
}

// recordAccessHistory records a user's access with IP and metadata
func (a *App) recordAccessHistory(userID int, clientIP, userAgent, action, webrtcIP string) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	ipToUse := clientIP
	if webrtcIP != "" {
		ipToUse = webrtcIP
	}

	geoInfo := a.geoIPService.LookupIP(ipToUse)

	browser, osName := ParseUserAgent(userAgent)

	strPtr := func(s string) *string {
		if s == "" {
			return nil
		}
		return &s
	}

	params := store.CreateAccessHistoryParams{
		UserID:      userID,
		IP:          ipToUse,
		UserAgent:   strPtr(userAgent),
		AccessType:  action,
		Country:     strPtr(geoInfo.Country),
		Province:    strPtr(geoInfo.Province),
		City:        strPtr(geoInfo.City),
		ISP:         strPtr(geoInfo.ISP),
		Browser:     strPtr(browser),
		OS:          strPtr(osName),
		WebRTCIP:    strPtr(webrtcIP),
		StatusCode:  nil,
		RequestPath: nil,
		IsSensitive: false,
	}

	if err := a.store.CreateAccessHistory(ctx, params); err != nil {
		// Log error but don't fail the request
		// In production, you might want to use a proper logger
		_ = err
	}
}

// parseUserAgent extracts browser and OS information from User-Agent string
func parseUserAgent(ua string) (browser, os string) {
	ua = strings.ToLower(ua)

	// Detect browser
	switch {
	case strings.Contains(ua, "edg/"):
		browser = "Edge"
	case strings.Contains(ua, "chrome/") && !strings.Contains(ua, "chromium/"):
		browser = "Chrome"
	case strings.Contains(ua, "firefox/"):
		browser = "Firefox"
	case strings.Contains(ua, "safari/") && !strings.Contains(ua, "chrome/"):
		browser = "Safari"
	case strings.Contains(ua, "opr/") || strings.Contains(ua, "opera/"):
		browser = "Opera"
	case strings.Contains(ua, "msie") || strings.Contains(ua, "trident/"):
		browser = "Internet Explorer"
	default:
		browser = "Unknown"
	}

	// Detect OS
	switch {
	case strings.Contains(ua, "windows nt 10"):
		os = "Windows 10/11"
	case strings.Contains(ua, "windows nt 6.3"):
		os = "Windows 8.1"
	case strings.Contains(ua, "windows nt 6.2"):
		os = "Windows 8"
	case strings.Contains(ua, "windows nt 6.1"):
		os = "Windows 7"
	case strings.Contains(ua, "windows"):
		os = "Windows"
	case strings.Contains(ua, "mac os x"):
		os = "macOS"
	case strings.Contains(ua, "android"):
		os = "Android"
	case strings.Contains(ua, "iphone") || strings.Contains(ua, "ipad"):
		os = "iOS"
	case strings.Contains(ua, "linux"):
		os = "Linux"
	default:
		os = "Unknown"
	}

	return browser, os
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
