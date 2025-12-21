package store

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// AccessHistory represents a user's access record
type AccessHistory struct {
	ID          int       `json:"id"`
	UserID      int       `json:"userId"`
	Username    string    `json:"username,omitempty"`
	IP          string    `json:"ip"`
	Country     *string   `json:"country,omitempty"`
	Province    *string   `json:"province,omitempty"`
	City        *string   `json:"city,omitempty"`
	ISP         *string   `json:"isp,omitempty"`
	Browser     *string   `json:"browser,omitempty"`
	OS          *string   `json:"os,omitempty"`
	Device      *string   `json:"device,omitempty"`
	UserAgent   *string   `json:"userAgent,omitempty"`
	AccessType  string    `json:"accessType"`
	StatusCode  *int      `json:"statusCode,omitempty"`
	RequestPath *string   `json:"requestPath,omitempty"`
	IsSensitive bool      `json:"isSensitive"`
	CreatedAt   time.Time `json:"createdAt"`
	WebRTCIP    *string   `json:"webrtcIP,omitempty"`
}

type ErrorStats struct {
	Date       time.Time `json:"date"`
	Total      int       `json:"total"`
	ErrorCount int       `json:"errorCount"`
}

type SensitiveAccessRow struct {
	RequestPath string    `json:"requestPath"`
	Count       int       `json:"count"`
	UserCount   int       `json:"userCount"`
	IPCount     int       `json:"ipCount"`
	LastSeen    time.Time `json:"lastSeen"`
}

// UserIPAssociation represents a user-IP association
type UserIPAssociation struct {
	ID          int       `json:"id"`
	UserID      int       `json:"userId"`
	Username    string    `json:"username,omitempty"`
	IP          string    `json:"ip"`
	FirstSeen   time.Time `json:"firstSeen"`
	LastSeen    time.Time `json:"lastSeen"`
	AccessCount int       `json:"accessCount"`
	IsBanned    bool      `json:"isBanned"`
}

// CreateAccessHistoryParams contains parameters for creating an access history record
type CreateAccessHistoryParams struct {
	UserID      int
	IP          string
	Country     *string
	Province    *string
	City        *string
	ISP         *string
	Browser     *string
	OS          *string
	Device      *string
	UserAgent   *string
	AccessType  string
	WebRTCIP    *string
	StatusCode  *int
	RequestPath *string
	IsSensitive bool
}

// CreateAccessHistory creates a new access history record
func (s *Store) CreateAccessHistory(ctx context.Context, p CreateAccessHistoryParams) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO "AccessHistory" ("userId", "ip", "country", "province", "city", "isp", "browser", "os", "device", "userAgent", "accessType", "webrtcIP", "statusCode", "requestPath", "isSensitive")
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
	`, p.UserID, p.IP, p.Country, p.Province, p.City, p.ISP, p.Browser, p.OS, p.Device, p.UserAgent, p.AccessType, p.WebRTCIP, p.StatusCode, p.RequestPath, p.IsSensitive)
	if err != nil {
		return err
	}

	// Update or insert user-IP association
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO "UserIPAssociation" ("userId", "ip", "firstSeen", "lastSeen", "accessCount")
		VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)
		ON CONFLICT ("userId", "ip") DO UPDATE SET
			"lastSeen" = CURRENT_TIMESTAMP,
			"accessCount" = "UserIPAssociation"."accessCount" + 1
	`, p.UserID, p.IP)

	return err
}

// ListAccessHistory returns all access history records with optional filtering
func (s *Store) ListAccessHistory(ctx context.Context, userID *int, limit int) ([]AccessHistory, error) {
	query := `
		SELECT h."id", h."userId", u."username", h."ip", h."country", h."province", h."city", 
		       h."isp", h."browser", h."os", h."device", h."userAgent", h."accessType", h."statusCode", h."requestPath", h."isSensitive", h."createdAt", h."webrtcIP"
		FROM "AccessHistory" h
		LEFT JOIN "User" u ON h."userId" = u."id"
	`
	var args []any
	argIdx := 1

	if userID != nil {
		query += ` WHERE h."userId" = $` + string(rune('0'+argIdx))
		args = append(args, *userID)
		argIdx++
	}

	query += ` ORDER BY h."createdAt" DESC`

	if limit > 0 {
		query += ` LIMIT $` + string(rune('0'+argIdx))
		args = append(args, limit)
	}

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []AccessHistory
	for rows.Next() {
		var h AccessHistory
		var country, province, city, isp, browser, os, device, userAgent, requestPath, webrtcIP sql.NullString
		var statusCode sql.NullInt32
		if err := rows.Scan(&h.ID, &h.UserID, &h.Username, &h.IP, &country, &province, &city,
			&isp, &browser, &os, &device, &userAgent, &h.AccessType, &statusCode, &requestPath, &h.IsSensitive, &h.CreatedAt, &webrtcIP); err != nil {
			return nil, err
		}
		if country.Valid {
			h.Country = &country.String
		}
		if province.Valid {
			h.Province = &province.String
		}
		if city.Valid {
			h.City = &city.String
		}
		if isp.Valid {
			h.ISP = &isp.String
		}
		if browser.Valid {
			h.Browser = &browser.String
		}
		if os.Valid {
			h.OS = &os.String
		}
		if device.Valid {
			h.Device = &device.String
		}
		if userAgent.Valid {
			h.UserAgent = &userAgent.String
		}
		if statusCode.Valid {
			v := int(statusCode.Int32)
			h.StatusCode = &v
		}
		if requestPath.Valid {
			h.RequestPath = &requestPath.String
		}
		if webrtcIP.Valid {
			h.WebRTCIP = &webrtcIP.String
		}
		records = append(records, h)
	}
	return records, nil
}

func (s *Store) ListAccessHistoryByIP(ctx context.Context, ip string, limit int) ([]AccessHistory, error) {
	query := `
		SELECT h."id", h."userId", u."username", h."ip", h."country", h."province", h."city", 
		       h."isp", h."browser", h."os", h."device", h."userAgent", h."accessType", h."statusCode", h."requestPath", h."isSensitive", h."createdAt", h."webrtcIP"
		FROM "AccessHistory" h
		LEFT JOIN "User" u ON h."userId" = u."id"
		WHERE h."ip" = $1
		ORDER BY h."createdAt" DESC
		LIMIT $2
	`
	rows, err := s.db.QueryContext(ctx, query, ip, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []AccessHistory
	for rows.Next() {
		var h AccessHistory
		var country, province, city, isp, browser, os, device, userAgent, requestPath, webrtcIP sql.NullString
		var statusCode sql.NullInt32
		if err := rows.Scan(&h.ID, &h.UserID, &h.Username, &h.IP, &country, &province, &city,
			&isp, &browser, &os, &device, &userAgent, &h.AccessType, &statusCode, &requestPath, &h.IsSensitive, &h.CreatedAt, &webrtcIP); err != nil {
			return nil, err
		}
		if country.Valid {
			h.Country = &country.String
		}
		if province.Valid {
			h.Province = &province.String
		}
		if city.Valid {
			h.City = &city.String
		}
		if isp.Valid {
			h.ISP = &isp.String
		}
		if browser.Valid {
			h.Browser = &browser.String
		}
		if os.Valid {
			h.OS = &os.String
		}
		if device.Valid {
			h.Device = &device.String
		}
		if userAgent.Valid {
			h.UserAgent = &userAgent.String
		}
		if statusCode.Valid {
			v := int(statusCode.Int32)
			h.StatusCode = &v
		}
		if requestPath.Valid {
			h.RequestPath = &requestPath.String
		}
		if webrtcIP.Valid {
			h.WebRTCIP = &webrtcIP.String
		}
		records = append(records, h)
	}
	return records, nil
}

// GetUserIPAssociations returns all IP associations for a user
func (s *Store) GetUserIPAssociations(ctx context.Context, userID int) ([]UserIPAssociation, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT a."id", a."userId", u."username", a."ip", a."firstSeen", a."lastSeen", a."accessCount",
		       COALESCE((SELECT 1 FROM "BannedIP" b WHERE b."ip" = a."ip" AND (b."expiresAt" IS NULL OR b."expiresAt" > CURRENT_TIMESTAMP) LIMIT 1), 0) as is_banned
		FROM "UserIPAssociation" a
		LEFT JOIN "User" u ON a."userId" = u."id"
		WHERE a."userId" = $1
		ORDER BY a."lastSeen" DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var associations []UserIPAssociation
	for rows.Next() {
		var a UserIPAssociation
		var isBannedInt int
		if err := rows.Scan(&a.ID, &a.UserID, &a.Username, &a.IP, &a.FirstSeen, &a.LastSeen, &a.AccessCount, &isBannedInt); err != nil {
			return nil, err
		}
		a.IsBanned = isBannedInt == 1
		associations = append(associations, a)
	}
	return associations, nil
}

// GetAllIPsForUser returns all IPs that a user has ever used
func (s *Store) GetAllIPsForUser(ctx context.Context, userID int) ([]string, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT DISTINCT "ip" FROM "UserIPAssociation" WHERE "userId" = $1
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ips []string
	for rows.Next() {
		var ip string
		if err := rows.Scan(&ip); err != nil {
			return nil, err
		}
		ips = append(ips, ip)
	}
	return ips, nil
}

// BanUserWithAllIPs bans a user and all their associated IPs
func (s *Store) BanUserWithAllIPs(ctx context.Context, userID int, reason string) (int, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	// Ban the user
	now := time.Now()
	_, err = tx.ExecContext(ctx, `
		UPDATE "User" SET "isBanned" = true, "bannedAt" = $1, "bannedReason" = $2
		WHERE "id" = $3
	`, now, reason, userID)
	if err != nil {
		return 0, err
	}

	// Get all IPs associated with this user
	rows, err := tx.QueryContext(ctx, `
		SELECT DISTINCT "ip" FROM "UserIPAssociation" WHERE "userId" = $1
	`, userID)
	if err != nil {
		return 0, err
	}

	var ips []string
	for rows.Next() {
		var ip string
		if err := rows.Scan(&ip); err != nil {
			rows.Close()
			return 0, err
		}
		ips = append(ips, ip)
	}
	rows.Close()

	// Ban all associated IPs
	bannedCount := 0
	for _, ip := range ips {
		result, err := tx.ExecContext(ctx, `
			INSERT INTO "BannedIP" ("ip", "userId", "reason")
			VALUES ($1, $2, $3)
			ON CONFLICT ("ip") DO UPDATE SET "userId" = $2, "reason" = $3, "createdAt" = CURRENT_TIMESTAMP
		`, ip, userID, reason)
		if err != nil {
			return 0, err
		}
		affected, _ := result.RowsAffected()
		bannedCount += int(affected)
	}

	if err := tx.Commit(); err != nil {
		return 0, err
	}

	return bannedCount, nil
}

// GetAccessHistoryForUser returns access history for a specific user
func (s *Store) GetAccessHistoryForUser(ctx context.Context, userID int, limit int) ([]AccessHistory, error) {
	query := `
		SELECT h."id", h."userId", u."username", h."ip", h."country", h."province", h."city", 
		       h."isp", h."browser", h."os", h."device", h."userAgent", h."accessType", h."statusCode", h."requestPath", h."isSensitive", h."createdAt", h."webrtcIP"
		FROM "AccessHistory" h
		LEFT JOIN "User" u ON h."userId" = u."id"
		WHERE h."userId" = $1
		ORDER BY h."createdAt" DESC
		LIMIT $2
	`

	rows, err := s.db.QueryContext(ctx, query, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []AccessHistory
	for rows.Next() {
		var h AccessHistory
		var country, province, city, isp, browser, os, device, userAgent, requestPath, webrtcIP sql.NullString
		var statusCode sql.NullInt32
		if err := rows.Scan(&h.ID, &h.UserID, &h.Username, &h.IP, &country, &province, &city,
			&isp, &browser, &os, &device, &userAgent, &h.AccessType, &statusCode, &requestPath, &h.IsSensitive, &h.CreatedAt, &webrtcIP); err != nil {
			return nil, err
		}
		if country.Valid {
			h.Country = &country.String
		}
		if province.Valid {
			h.Province = &province.String
		}
		if city.Valid {
			h.City = &city.String
		}
		if isp.Valid {
			h.ISP = &isp.String
		}
		if browser.Valid {
			h.Browser = &browser.String
		}
		if os.Valid {
			h.OS = &os.String
		}
		if device.Valid {
			h.Device = &device.String
		}
		if userAgent.Valid {
			h.UserAgent = &userAgent.String
		}
		if statusCode.Valid {
			v := int(statusCode.Int32)
			h.StatusCode = &v
		}
		if requestPath.Valid {
			h.RequestPath = &requestPath.String
		}
		if webrtcIP.Valid {
			h.WebRTCIP = &webrtcIP.String
		}
		records = append(records, h)
	}
	return records, nil
}

func (s *Store) GetErrorStats(ctx context.Context, from, to time.Time, statusMin, statusMax *int, pathLike *string) ([]ErrorStats, error) {
	query := `
		SELECT DATE("createdAt") as d,
		       COUNT(*) as total,
		       COUNT(*) FILTER (WHERE "statusCode" >= 400 AND "statusCode" < 600) as error_count
		FROM "AccessHistory"
		WHERE "createdAt" >= $1 AND "createdAt" <= $2
		  AND "accessType" <> 'MEMORY_THROTTLED'
	`
	args := []any{from, to}
	argIdx := 3

	if statusMin != nil {
		query += ` AND "statusCode" >= $` + string(rune('0'+argIdx))
		args = append(args, *statusMin)
		argIdx++
	}
	if statusMax != nil {
		query += ` AND "statusCode" <= $` + string(rune('0'+argIdx))
		args = append(args, *statusMax)
		argIdx++
	}
	if pathLike != nil && *pathLike != "" {
		query += ` AND "requestPath" ILIKE $` + string(rune('0'+argIdx))
		args = append(args, "%"+*pathLike+"%")
		argIdx++
	}

	query += ` GROUP BY d ORDER BY d ASC`

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var stats []ErrorStats
	for rows.Next() {
		var es ErrorStats
		if err := rows.Scan(&es.Date, &es.Total, &es.ErrorCount); err != nil {
			return nil, err
		}
		stats = append(stats, es)
	}
	return stats, nil
}

func (s *Store) GetSensitiveAccessReport(ctx context.Context, from, to time.Time, limit int) ([]SensitiveAccessRow, error) {
	if limit <= 0 {
		limit = 100
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT "requestPath",
		       COUNT(*) as cnt,
		       COUNT(DISTINCT "userId") as user_cnt,
		       COUNT(DISTINCT "ip") as ip_cnt,
		       MAX("createdAt") as last_seen
		FROM "AccessHistory"
		WHERE "isSensitive" = true
		  AND "createdAt" >= $1 AND "createdAt" <= $2
		GROUP BY "requestPath"
		ORDER BY cnt DESC
		LIMIT $3
	`, from, to, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []SensitiveAccessRow
	for rows.Next() {
		var row SensitiveAccessRow
		if err := rows.Scan(&row.RequestPath, &row.Count, &row.UserCount, &row.IPCount, &row.LastSeen); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, nil
}

// GetUserByIP returns user IDs that have used a specific IP
func (s *Store) GetUsersByIP(ctx context.Context, ip string) ([]int, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT DISTINCT "userId" FROM "UserIPAssociation" WHERE "ip" = $1
	`, ip)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var userIDs []int
	for rows.Next() {
		var userID int
		if err := rows.Scan(&userID); err != nil {
			return nil, err
		}
		userIDs = append(userIDs, userID)
	}
	return userIDs, nil
}

// UnbanIPByID removes a specific IP from the banned list
func (s *Store) UnbanIPByID(ctx context.Context, id int) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM "BannedIP" WHERE "id" = $1`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// GetBannedIPByID returns a specific banned IP by ID
func (s *Store) GetBannedIPByID(ctx context.Context, id int) (BannedIP, error) {
	var b BannedIP
	var userID sql.NullInt64
	var username sql.NullString
	var reason sql.NullString
	var expiresAt sql.NullTime

	err := s.db.QueryRowContext(ctx, `
		SELECT b."id", b."ip", b."userId", u."username", b."reason", b."createdAt", b."expiresAt"
		FROM "BannedIP" b
		LEFT JOIN "User" u ON b."userId" = u."id"
		WHERE b."id" = $1
	`, id).Scan(&b.ID, &b.IP, &userID, &username, &reason, &b.CreatedAt, &expiresAt)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return BannedIP{}, ErrNotFound
		}
		return BannedIP{}, err
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

	return b, nil
}
