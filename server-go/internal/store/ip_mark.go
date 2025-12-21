package store

import (
	"context"
	"database/sql"
	"time"
)

type IPMark struct {
	IPAddress string    `json:"ipAddress"`
	MarkType  string    `json:"markType"`
	Reason    *string   `json:"reason,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
	ExpireAt  *time.Time `json:"expireAt,omitempty"`
	Operator  *string   `json:"operator,omitempty"`
}

func (s *Store) UpsertIPMark(ctx context.Context, ip string, markType string, reason *string, expireAt *time.Time, operator *string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO "IPMark" ("ipAddress", "markType", "reason", "expireAt", "operator")
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT ("ipAddress") DO UPDATE SET
			"markType" = EXCLUDED."markType",
			"reason" = EXCLUDED."reason",
			"expireAt" = EXCLUDED."expireAt",
			"operator" = EXCLUDED."operator"
	`, ip, markType, reason, expireAt, operator)
	return err
}

func (s *Store) GetIPMark(ctx context.Context, ip string) (IPMark, error) {
	var m IPMark
	var reason sql.NullString
	var expireAt sql.NullTime
	var operator sql.NullString
	err := s.db.QueryRowContext(ctx, `
		SELECT "ipAddress", "markType", "reason", "createdAt", "expireAt", "operator"
		FROM "IPMark"
		WHERE "ipAddress" = $1
	`, ip).Scan(&m.IPAddress, &m.MarkType, &reason, &m.CreatedAt, &expireAt, &operator)
	if err != nil {
		if err == sql.ErrNoRows {
			return IPMark{}, ErrNotFound
		}
		return IPMark{}, err
	}
	if reason.Valid {
		m.Reason = &reason.String
	}
	if expireAt.Valid {
		t := expireAt.Time
		m.ExpireAt = &t
	}
	if operator.Valid {
		m.Operator = &operator.String
	}
	return m, nil
}

func (s *Store) DeleteIPMark(ctx context.Context, ip string) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM "IPMark" WHERE "ipAddress" = $1`, ip)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) ListIPMarks(ctx context.Context, markType *string, limit, offset int) ([]IPMark, error) {
	query := `
		SELECT "ipAddress", "markType", "reason", "createdAt", "expireAt", "operator"
		FROM "IPMark"
	`
	var args []any
	idx := 1
	if markType != nil {
		query += ` WHERE "markType" = $1`
		args = append(args, *markType)
		idx++
	}
	query += ` ORDER BY "createdAt" DESC`
	if limit > 0 {
		query += ` LIMIT $` + string(rune('0'+idx))
		args = append(args, limit)
		idx++
	}
	if offset > 0 {
		query += ` OFFSET $` + string(rune('0'+idx))
		args = append(args, offset)
	}
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var items []IPMark
	for rows.Next() {
		var m IPMark
		var reason sql.NullString
		var expireAt sql.NullTime
		var operator sql.NullString
		if err := rows.Scan(&m.IPAddress, &m.MarkType, &reason, &m.CreatedAt, &expireAt, &operator); err != nil {
			return nil, err
		}
		if reason.Valid {
			m.Reason = &reason.String
		}
		if expireAt.Valid {
			t := expireAt.Time
			m.ExpireAt = &t
		}
		if operator.Valid {
			m.Operator = &operator.String
		}
		items = append(items, m)
	}
	return items, nil
}

func (s *Store) CleanupExpiredIPMarks(ctx context.Context, now time.Time) (int64, error) {
	res, err := s.db.ExecContext(ctx, `
		DELETE FROM "IPMark"
		WHERE "expireAt" IS NOT NULL AND "expireAt" <= $1
	`, now)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

