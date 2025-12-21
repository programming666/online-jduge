package store

import (
	"context"
	"database/sql"
	"errors"
	"strconv"
)

func (s *Store) IsRegistrationEnabled(ctx context.Context) (bool, error) {
	var value sql.NullString
	err := s.db.QueryRowContext(ctx, `SELECT "value" FROM "Setting" WHERE "key"='registration_enabled'`).Scan(&value)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return true, nil
		}
		return false, err
	}
	if !value.Valid {
		return true, nil
	}
	return value.String != "false", nil
}

func (s *Store) UpsertRegistrationEnabled(ctx context.Context, enabled bool) (bool, error) {
	value := "false"
	if enabled {
		value = "true"
	}
	var stored string
	err := s.db.QueryRowContext(ctx, `
		INSERT INTO "Setting" ("key","value") VALUES ('registration_enabled',$1)
		ON CONFLICT ("key") DO UPDATE SET "value"=EXCLUDED."value"
		RETURNING "value"
	`, value).Scan(&stored)
	if err != nil {
		return false, err
	}
	return stored == "true", nil
}

func (s *Store) GetHomepageContent(ctx context.Context) (string, error) {
	var value sql.NullString
	err := s.db.QueryRowContext(ctx, `SELECT "value" FROM "Setting" WHERE "key"='homepage_content'`).Scan(&value)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", nil
		}
		return "", err
	}
	if !value.Valid {
		return "", nil
	}
	return value.String, nil
}

func (s *Store) UpsertHomepageContent(ctx context.Context, content string) (string, error) {
	var stored string
	err := s.db.QueryRowContext(ctx, `
		INSERT INTO "Setting" ("key","value") VALUES ('homepage_content',$1)
		ON CONFLICT ("key") DO UPDATE SET "value"=EXCLUDED."value"
		RETURNING "value"
	`, content).Scan(&stored)
	if err != nil {
		return "", err
	}
	return stored, nil
}

// Footer content
func (s *Store) GetFooterContent(ctx context.Context) (string, error) {
	var value sql.NullString
	err := s.db.QueryRowContext(ctx, `SELECT "value" FROM "Setting" WHERE "key"='footer_content'`).Scan(&value)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", nil
		}
		return "", err
	}
	if !value.Valid {
		return "", nil
	}
	return value.String, nil
}

func (s *Store) UpsertFooterContent(ctx context.Context, content string) (string, error) {
	var stored string
	err := s.db.QueryRowContext(ctx, `
		INSERT INTO "Setting" ("key","value") VALUES ('footer_content',$1)
		ON CONFLICT ("key") DO UPDATE SET "value"=EXCLUDED."value"
		RETURNING "value"
	`, content).Scan(&stored)
	if err != nil {
		return "", err
	}
	return stored, nil
}

// Rate limit settings (submissions per minute)
func (s *Store) GetSubmissionRateLimit(ctx context.Context) (int, error) {
	var value sql.NullString
	err := s.db.QueryRowContext(ctx, `SELECT "value" FROM "Setting" WHERE "key"='submission_rate_limit'`).Scan(&value)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 3, nil // default 3 per minute
		}
		return 3, err
	}
	if !value.Valid {
		return 3, nil
	}
	limit, err := strconv.Atoi(value.String)
	if err != nil {
		return 3, nil
	}
	return limit, nil
}

func (s *Store) UpsertSubmissionRateLimit(ctx context.Context, limit int) (int, error) {
	var stored string
	err := s.db.QueryRowContext(ctx, `
		INSERT INTO "Setting" ("key","value") VALUES ('submission_rate_limit',$1)
		ON CONFLICT ("key") DO UPDATE SET "value"=EXCLUDED."value"
		RETURNING "value"
		`, strconv.Itoa(limit)).Scan(&stored)
	if err != nil {
		return 0, err
	}
	result, _ := strconv.Atoi(stored)
	return result, nil
}

// Code run rate limit settings (runs per minute)
func (s *Store) GetCodeRunRateLimit(ctx context.Context) (int, error) {
	var value sql.NullString
	err := s.db.QueryRowContext(ctx, `SELECT "value" FROM "Setting" WHERE "key"='code_run_rate_limit'`).Scan(&value)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 6, nil
		}
		return 6, err
	}
	if !value.Valid {
		return 6, nil
	}
	limit, err := strconv.Atoi(value.String)
	if err != nil {
		return 6, nil
	}
	return limit, nil
}

func (s *Store) UpsertCodeRunRateLimit(ctx context.Context, limit int) (int, error) {
	var stored string
	err := s.db.QueryRowContext(ctx, `
		INSERT INTO "Setting" ("key","value") VALUES ('code_run_rate_limit',$1)
		ON CONFLICT ("key") DO UPDATE SET "value"=EXCLUDED."value"
		RETURNING "value"
		`, strconv.Itoa(limit)).Scan(&stored)
	if err != nil {
		return 0, err
	}
	result, _ := strconv.Atoi(stored)
	return result, nil
}

// Turnstile settings
func (s *Store) GetTurnstileEnabled(ctx context.Context) (bool, error) {
	var value sql.NullString
	err := s.db.QueryRowContext(ctx, `SELECT "value" FROM "Setting" WHERE "key"='turnstile_enabled'`).Scan(&value)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	if !value.Valid {
		return false, nil
	}
	return value.String == "true", nil
}

func (s *Store) UpsertTurnstileEnabled(ctx context.Context, enabled bool) (bool, error) {
	val := "false"
	if enabled {
		val = "true"
	}
	var stored string
	err := s.db.QueryRowContext(ctx, `
		INSERT INTO "Setting" ("key","value") VALUES ('turnstile_enabled',$1)
		ON CONFLICT ("key") DO UPDATE SET "value"=EXCLUDED."value"
		RETURNING "value"
	`, val).Scan(&stored)
	if err != nil {
		return false, err
	}
	return stored == "true", nil
}

func (s *Store) GetTurnstileSiteKey(ctx context.Context) (string, error) {
	var value sql.NullString
	err := s.db.QueryRowContext(ctx, `SELECT "value" FROM "Setting" WHERE "key"='turnstile_site_key'`).Scan(&value)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", nil
		}
		return "", err
	}
	if !value.Valid {
		return "", nil
	}
	return value.String, nil
}

func (s *Store) UpsertTurnstileSiteKey(ctx context.Context, siteKey string) (string, error) {
	var stored string
	err := s.db.QueryRowContext(ctx, `
		INSERT INTO "Setting" ("key","value") VALUES ('turnstile_site_key',$1)
		ON CONFLICT ("key") DO UPDATE SET "value"=EXCLUDED."value"
		RETURNING "value"
	`, siteKey).Scan(&stored)
	if err != nil {
		return "", err
	}
	return stored, nil
}
