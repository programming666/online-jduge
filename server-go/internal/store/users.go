package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
)

type User struct {
	ID           int             `json:"id"`
	Username     string          `json:"username"`
	Password     string          `json:"-"`
	Role         string          `json:"role"`
	IsBanned     bool            `json:"isBanned"`
	BannedAt     *time.Time      `json:"bannedAt,omitempty"`
	BannedReason *string         `json:"bannedReason,omitempty"`
	Preferences  json.RawMessage `json:"preferences,omitempty"`
}

type UserListItem struct {
	ID              int        `json:"id"`
	Username        string     `json:"username"`
	Role            string     `json:"role"`
	IsBanned        bool       `json:"isBanned"`
	BannedAt        *time.Time `json:"bannedAt,omitempty"`
	BannedReason    *string    `json:"bannedReason,omitempty"`
	SubmissionCount int        `json:"submissionCount"`
}

type BannedIP struct {
	ID        int        `json:"id"`
	IP        string     `json:"ip"`
	UserID    *int       `json:"userId,omitempty"`
	Username  *string    `json:"username,omitempty"`
	Reason    *string    `json:"reason,omitempty"`
	CreatedAt time.Time  `json:"createdAt"`
	ExpiresAt *time.Time `json:"expiresAt,omitempty"`
}

func (s *Store) GetUserByUsername(ctx context.Context, username string) (User, error) {
	var u User
	var bannedAt sql.NullTime
	var bannedReason sql.NullString
	var preferences []byte
	err := s.db.QueryRowContext(ctx, `SELECT "id","username","password","role","isBanned","bannedAt","bannedReason","preferences" FROM "User" WHERE "username"=$1`, username).
		Scan(&u.ID, &u.Username, &u.Password, &u.Role, &u.IsBanned, &bannedAt, &bannedReason, &preferences)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return User{}, ErrNotFound
		}
		return User{}, err
	}
	if bannedAt.Valid {
		u.BannedAt = &bannedAt.Time
	}
	if bannedReason.Valid {
		u.BannedReason = &bannedReason.String
	}
	if preferences != nil {
		u.Preferences = json.RawMessage(preferences)
	}
	return u, nil
}

type CreateUserParams struct {
	Username string
	Password string
	Role     string
}

func (s *Store) CreateUser(ctx context.Context, p CreateUserParams) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO "User" ("username","password","role") VALUES ($1,$2,$3)`, p.Username, p.Password, p.Role)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return ErrUniqueViolation
		}
		return err
	}
	return nil
}

func (s *Store) GetUserByID(ctx context.Context, id int) (User, error) {
	var u User
	var bannedAt sql.NullTime
	var bannedReason sql.NullString
	var preferences []byte
	err := s.db.QueryRowContext(ctx, `SELECT "id","username","password","role","isBanned","bannedAt","bannedReason","preferences" FROM "User" WHERE "id"=$1`, id).
		Scan(&u.ID, &u.Username, &u.Password, &u.Role, &u.IsBanned, &bannedAt, &bannedReason, &preferences)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return User{}, ErrNotFound
		}
		return User{}, err
	}
	if bannedAt.Valid {
		u.BannedAt = &bannedAt.Time
	}
	if bannedReason.Valid {
		u.BannedReason = &bannedReason.String
	}
	if preferences != nil {
		u.Preferences = json.RawMessage(preferences)
	}
	return u, nil
}

func (s *Store) UpdateUserPreferences(ctx context.Context, userID int, preferences json.RawMessage) error {
	_, err := s.db.ExecContext(ctx, `UPDATE "User" SET "preferences"=$1 WHERE "id"=$2`, preferences, userID)
	return err
}

func (s *Store) UpdateUserPassword(ctx context.Context, id int, hashed string) error {
	res, err := s.db.ExecContext(ctx, `UPDATE "User" SET "password"=$1 WHERE "id"=$2`, hashed, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// ListUsers returns all users with submission count
func (s *Store) ListUsers(ctx context.Context) ([]UserListItem, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT u."id", u."username", u."role", u."isBanned", u."bannedAt", u."bannedReason",
		       COALESCE((SELECT COUNT(*) FROM "Submission" s WHERE s."userId" = u."id"), 0) as submission_count
		FROM "User" u
		ORDER BY u."id" ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []UserListItem
	for rows.Next() {
		var u UserListItem
		var bannedAt sql.NullTime
		var bannedReason sql.NullString
		if err := rows.Scan(&u.ID, &u.Username, &u.Role, &u.IsBanned, &bannedAt, &bannedReason, &u.SubmissionCount); err != nil {
			return nil, err
		}
		if bannedAt.Valid {
			u.BannedAt = &bannedAt.Time
		}
		if bannedReason.Valid {
			u.BannedReason = &bannedReason.String
		}
		users = append(users, u)
	}
	return users, nil
}

// BanUser bans a user
func (s *Store) BanUser(ctx context.Context, userID int, reason string) error {
	now := time.Now()
	res, err := s.db.ExecContext(ctx, `
		UPDATE "User" SET "isBanned" = true, "bannedAt" = $1, "bannedReason" = $2
		WHERE "id" = $3
	`, now, reason, userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// UnbanUser unbans a user
func (s *Store) UnbanUser(ctx context.Context, userID int) error {
	res, err := s.db.ExecContext(ctx, `
		UPDATE "User" SET "isBanned" = false, "bannedAt" = NULL, "bannedReason" = NULL
		WHERE "id" = $1
	`, userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// DeleteUser deletes a user and their submissions
func (s *Store) DeleteUser(ctx context.Context, userID int) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Delete contest participants
	_, _ = tx.ExecContext(ctx, `DELETE FROM "ContestParticipant" WHERE "userId" = $1`, userID)
	// Delete contest password attempts
	_, _ = tx.ExecContext(ctx, `DELETE FROM "ContestPasswordAttempt" WHERE "userId" = $1`, userID)
	// Delete submissions
	_, _ = tx.ExecContext(ctx, `DELETE FROM "Submission" WHERE "userId" = $1`, userID)
	// Delete banned IPs associated with user
	_, _ = tx.ExecContext(ctx, `UPDATE "BannedIP" SET "userId" = NULL WHERE "userId" = $1`, userID)
	// Delete user
	res, err := tx.ExecContext(ctx, `DELETE FROM "User" WHERE "id" = $1`, userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}

	return tx.Commit()
}

// DeleteUserSubmissions deletes all submissions for a user
func (s *Store) DeleteUserSubmissions(ctx context.Context, userID int) (int64, error) {
	res, err := s.db.ExecContext(ctx, `DELETE FROM "Submission" WHERE "userId" = $1`, userID)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// DeleteSubmission deletes a specific submission
func (s *Store) DeleteSubmission(ctx context.Context, submissionID int) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM "Submission" WHERE "id" = $1`, submissionID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// BanIP adds an IP to the banned list
func (s *Store) BanIP(ctx context.Context, ip string, userID *int, reason string, expiresAt *time.Time) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO "BannedIP" ("ip", "userId", "reason", "expiresAt")
		VALUES ($1, $2, $3, $4)
		ON CONFLICT ("ip") DO UPDATE SET "userId" = $2, "reason" = $3, "expiresAt" = $4, "createdAt" = CURRENT_TIMESTAMP
	`, ip, userID, reason, expiresAt)
	return err
}

// UnbanIP removes an IP from the banned list
func (s *Store) UnbanIP(ctx context.Context, ip string) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM "BannedIP" WHERE "ip" = $1`, ip)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// IsIPBanned checks if an IP is banned
func (s *Store) IsIPBanned(ctx context.Context, ip string) (bool, error) {
	var id int
	err := s.db.QueryRowContext(ctx, `
		SELECT "id" FROM "BannedIP" 
		WHERE "ip" = $1 AND ("expiresAt" IS NULL OR "expiresAt" > CURRENT_TIMESTAMP)
	`, ip).Scan(&id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

// ListBannedIPs returns all banned IPs
func (s *Store) ListBannedIPs(ctx context.Context) ([]BannedIP, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT b."id", b."ip", b."userId", u."username", b."reason", b."createdAt", b."expiresAt"
		FROM "BannedIP" b
		LEFT JOIN "User" u ON b."userId" = u."id"
		ORDER BY b."createdAt" DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ips []BannedIP
	for rows.Next() {
		var b BannedIP
		var userID sql.NullInt64
		var username sql.NullString
		var reason sql.NullString
		var expiresAt sql.NullTime
		if err := rows.Scan(&b.ID, &b.IP, &userID, &username, &reason, &b.CreatedAt, &expiresAt); err != nil {
			return nil, err
		}
		if userID.Valid {
			id := int(userID.Int64)
			b.UserID = &id
		}
		if username.Valid {
			b.Username = &username.String
		}
		if reason.Valid {
			b.Reason = &reason.String
		}
		if expiresAt.Valid {
			b.ExpiresAt = &expiresAt.Time
		}
		ips = append(ips, b)
	}
	return ips, nil
}

// CountUserSubmissionsInWindow counts submissions by a user in a time window
func (s *Store) CountUserSubmissionsInWindow(ctx context.Context, userID int, windowStart time.Time) (int, error) {
	var count int
	err := s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM "Submission" WHERE "userId" = $1 AND "createdAt" >= $2
	`, userID, windowStart).Scan(&count)
	if err != nil {
		return 0, err
	}
	return count, nil
}
