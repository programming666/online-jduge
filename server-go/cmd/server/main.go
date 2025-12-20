package main

import (
	"context"
	"database/sql"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"onlinejudge-server-go/internal/app"

	_ "github.com/jackc/pgx/v5/stdlib"
)

func main() {
	port := os.Getenv("API_PORT")
	if strings.TrimSpace(port) == "" {
		port = os.Getenv("PORT")
	}
	if strings.TrimSpace(port) == "" {
		port = "3000"
	}

	jwtSecret := os.Getenv("JWT_SECRET")
	if strings.TrimSpace(jwtSecret) == "" {
		jwtSecret = "your-secret-key"
	}

	databaseURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if databaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}

	normalizedDatabaseURL := normalizeDatabaseURL(databaseURL)

	db, err := sql.Open("pgx", normalizedDatabaseURL)
	if err != nil {
		log.Fatal(err)
	}

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(25)
	db.SetConnMaxLifetime(30 * time.Minute)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		log.Fatal(err)
	}

	a, err := app.New(app.Config{
		DB:        db,
		JWTSecret: jwtSecret,
	})
	if err != nil {
		log.Fatal(err)
	}

	server := &http.Server{
		Addr:              ":" + port,
		Handler:           a.Router(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	log.Printf("Server running on port %s", port)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

func normalizeDatabaseURL(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return raw
	}
	q := u.Query()
	q.Del("schema")
	u.RawQuery = q.Encode()
	return u.String()
}
