package store

import (
	"context"
	"time"
)

type AuditLog struct {
	ID         int       `json:"id"`
	OperatorID *int      `json:"operatorId,omitempty"`
	Action     string    `json:"action"`
	TargetType string    `json:"targetType"`
	TargetID   *string   `json:"targetId,omitempty"`
	Metadata   []byte    `json:"metadata,omitempty"`
	CreatedAt  time.Time `json:"createdAt"`
}

func (s *Store) CreateAuditLog(ctx context.Context, operatorID *int, action string, targetType string, targetID *string, metadata []byte) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO "AuditLog" ("operatorId", "action", "targetType", "targetId", "metadata")
		VALUES ($1, $2, $3, $4, $5)
	`, operatorID, action, targetType, targetID, metadata)
	return err
}

