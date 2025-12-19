package store

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"
)

type Contest struct {
	ID           int       `json:"id"`
	Name         string    `json:"name"`
	Description  *string   `json:"description"`
	StartTime    time.Time `json:"startTime"`
	EndTime      time.Time `json:"endTime"`
	Rule         string    `json:"rule"`
	PasswordHash *string   `json:"passwordHash"`
	IsPublished  bool      `json:"isPublished"`
	Languages    []string  `json:"languages"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

type ContestProblem struct {
	ID        int `json:"id"`
	Order     int `json:"order"`
	ContestID int `json:"contestId"`
	ProblemID int `json:"problemId"`
	Problem   struct {
		ID         int    `json:"id"`
		Title      string `json:"title"`
		Difficulty string `json:"difficulty"`
	} `json:"problem"`
}

type ContestAdminDetail struct {
	Contest
	Problems []ContestProblem `json:"problems"`
}

type ContestAdminListItem struct {
	ID               int       `json:"id"`
	Name             string    `json:"name"`
	Description      *string   `json:"description"`
	StartTime        time.Time `json:"startTime"`
	EndTime          time.Time `json:"endTime"`
	Rule             string    `json:"rule"`
	IsPublished      bool      `json:"isPublished"`
	Languages        []string  `json:"languages"`
	ParticipantCount int       `json:"participantCount"`
	Problems         []struct {
		ID         int    `json:"id"`
		Title      string `json:"title"`
		Difficulty string `json:"difficulty"`
	} `json:"problems"`
}

type ContestPublicListItem struct {
	ID               int       `json:"id"`
	Name             string    `json:"name"`
	Description      *string   `json:"description"`
	StartTime        time.Time `json:"startTime"`
	EndTime          time.Time `json:"endTime"`
	Rule             string    `json:"rule"`
	ParticipantCount int       `json:"participantCount"`
	HasPassword      bool      `json:"hasPassword"`
}

type ContestPublicDetail struct {
	ID               int       `json:"id"`
	Name             string    `json:"name"`
	Description      *string   `json:"description"`
	StartTime        time.Time `json:"startTime"`
	EndTime          time.Time `json:"endTime"`
	Rule             string    `json:"rule"`
	Languages        []string  `json:"languages"`
	ParticipantCount int       `json:"participantCount"`
	HasPassword      bool      `json:"hasPassword"`
	Problems         []struct {
		ID         int    `json:"id"`
		Title      string `json:"title"`
		Difficulty string `json:"difficulty"`
	} `json:"problems"`
}

type ContestLeaderboardItem struct {
	UserID          int                         `json:"userId"`
	Username        string                      `json:"username"`
	SubmissionCount int                         `json:"submissionCount"`
	TotalScore      int                         `json:"totalScore"`
	ProblemScores   map[int]ContestProblemScore `json:"problemScores"`
}

type ContestUserProblemStat struct {
	UserID          int
	Username        string
	ProblemID       int
	MaxScore        int
	SubmissionCount int
}

type ContestProblemScore struct {
	Score           int `json:"score"`
	SubmissionCount int `json:"submissionCount"`
}

type CreateContestParams struct {
	Name         string
	Description  string
	StartTime    time.Time
	EndTime      time.Time
	Rule         string
	PasswordHash *string
	IsPublished  bool
	Languages    []string
	ProblemIDs   []int
}

func (s *Store) CreateContest(ctx context.Context, p CreateContestParams) (int, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	var created Contest
	var desc sql.NullString
	if strings.TrimSpace(p.Description) != "" {
		desc = sql.NullString{String: p.Description, Valid: true}
	}
	var password sql.NullString
	if p.PasswordHash != nil && strings.TrimSpace(*p.PasswordHash) != "" {
		password = sql.NullString{String: *p.PasswordHash, Valid: true}
	}
	var languages PGTextArray

	err = tx.QueryRowContext(ctx, `
		INSERT INTO "Contest" ("name","description","startTime","endTime","rule","passwordHash","isPublished","languages")
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		RETURNING "id","name","description","startTime","endTime","rule","passwordHash","isPublished","languages","createdAt","updatedAt"
	`, p.Name, desc, p.StartTime, p.EndTime, p.Rule, password, p.IsPublished, p.Languages).
		Scan(&created.ID, &created.Name, &created.Description, &created.StartTime, &created.EndTime, &created.Rule, &created.PasswordHash, &created.IsPublished, &languages, &created.CreatedAt, &created.UpdatedAt)
	if err != nil {
		return 0, err
	}
	created.Languages = []string(languages)

	if len(p.ProblemIDs) > 0 {
		existing, err := fetchExistingProblemIDs(ctx, tx, p.ProblemIDs)
		if err != nil {
			return 0, err
		}
		if len(existing) > 0 {
			if err := replaceContestProblems(ctx, tx, created.ID, p.ProblemIDs, existing); err != nil {
				return 0, err
			}
		}
	}

	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return created.ID, nil
}

type UpdateContestParams struct {
	ID             int
	Name           string
	Description    string
	StartTime      time.Time
	EndTime        time.Time
	Rule           string
	Languages      []string
	IsPublished    *bool
	UpdatePassword bool
	PasswordHash   *string
	UpdateProblems bool
	ProblemIDs     []int
}

func (s *Store) UpdateContest(ctx context.Context, p UpdateContestParams) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	setParts := []string{`"name"=$1`, `"description"=$2`, `"startTime"=$3`, `"endTime"=$4`, `"rule"=$5`, `"languages"=$6`}
	args := []any{}

	desc := sql.NullString{}
	if strings.TrimSpace(p.Description) != "" {
		desc = sql.NullString{String: p.Description, Valid: true}
	}
	args = append(args, p.Name, desc, p.StartTime, p.EndTime, p.Rule, p.Languages)

	arg := 7
	if p.IsPublished != nil {
		setParts = append(setParts, `"isPublished"=$`+itoa(arg))
		args = append(args, *p.IsPublished)
		arg++
	}
	if p.UpdatePassword {
		var password sql.NullString
		if p.PasswordHash != nil && strings.TrimSpace(*p.PasswordHash) != "" {
			password = sql.NullString{String: *p.PasswordHash, Valid: true}
		}
		setParts = append(setParts, `"passwordHash"=$`+itoa(arg))
		args = append(args, password)
		arg++
	}

	args = append(args, p.ID)

	setParts = append(setParts, `"updatedAt"=NOW()`)
	res, err := tx.ExecContext(ctx, `UPDATE "Contest" SET `+strings.Join(setParts, ",")+` WHERE "id"=$`+itoa(len(args)), args...)
	if err != nil {
		return err
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return ErrNotFound
	}

	if p.UpdateProblems {
		if _, err := tx.ExecContext(ctx, `DELETE FROM "ContestProblem" WHERE "contestId"=$1`, p.ID); err != nil {
			return err
		}
		if len(p.ProblemIDs) > 0 {
			existing, err := fetchExistingProblemIDs(ctx, tx, p.ProblemIDs)
			if err != nil {
				return err
			}
			if len(existing) > 0 {
				if err := insertContestProblems(ctx, tx, p.ID, p.ProblemIDs, existing); err != nil {
					return err
				}
			}
		}
	}

	return tx.Commit()
}

func (s *Store) GetContestByID(ctx context.Context, id int) (Contest, error) {
	var c Contest
	var languages PGTextArray
	err := s.db.QueryRowContext(ctx, `
		SELECT "id","name","description","startTime","endTime","rule","passwordHash","isPublished","languages","createdAt","updatedAt"
		FROM "Contest"
		WHERE "id"=$1
	`, id).Scan(&c.ID, &c.Name, &c.Description, &c.StartTime, &c.EndTime, &c.Rule, &c.PasswordHash, &c.IsPublished, &languages, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Contest{}, ErrNotFound
		}
		return Contest{}, err
	}
	c.Languages = []string(languages)
	return c, nil
}

func (s *Store) GetContestAdmin(ctx context.Context, id int) (ContestAdminDetail, error) {
	c, err := s.GetContestByID(ctx, id)
	if err != nil {
		return ContestAdminDetail{}, err
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT cp."id",cp."order",cp."contestId",cp."problemId",p."id",p."title",p."difficulty"
		FROM "ContestProblem" cp
		JOIN "Problem" p ON p."id"=cp."problemId"
		WHERE cp."contestId"=$1
		ORDER BY cp."order" ASC
	`, id)
	if err != nil {
		return ContestAdminDetail{}, err
	}
	defer rows.Close()

	var problems []ContestProblem
	for rows.Next() {
		var cp ContestProblem
		if err := rows.Scan(&cp.ID, &cp.Order, &cp.ContestID, &cp.ProblemID, &cp.Problem.ID, &cp.Problem.Title, &cp.Problem.Difficulty); err != nil {
			return ContestAdminDetail{}, err
		}
		problems = append(problems, cp)
	}
	if err := rows.Err(); err != nil {
		return ContestAdminDetail{}, err
	}

	return ContestAdminDetail{Contest: c, Problems: problems}, nil
}

func (s *Store) ListContestsAdmin(ctx context.Context) ([]ContestAdminListItem, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT c."id",c."name",c."description",c."startTime",c."endTime",c."rule",c."isPublished",c."languages",
		       COUNT(p."id") as "participantCount"
		FROM "Contest" c
		LEFT JOIN "ContestParticipant" p ON p."contestId"=c."id"
		GROUP BY c."id"
		ORDER BY c."startTime" DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var contests []ContestAdminListItem
	ids := make([]int, 0)
	for rows.Next() {
		var item ContestAdminListItem
		var languages PGTextArray
		if err := rows.Scan(&item.ID, &item.Name, &item.Description, &item.StartTime, &item.EndTime, &item.Rule, &item.IsPublished, &languages, &item.ParticipantCount); err != nil {
			return nil, err
		}
		item.Languages = []string(languages)
		contests = append(contests, item)
		ids = append(ids, item.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(ids) == 0 {
		return contests, nil
	}

	problemsByContest, err := listContestProblemsSimple(ctx, s.db, ids, false)
	if err != nil {
		return nil, err
	}

	for i := range contests {
		contests[i].Problems = problemsByContest[contests[i].ID]
	}
	return contests, nil
}

type ContestPublicFilter struct {
	Status    string
	StartFrom *time.Time
	StartTo   *time.Time
	Now       time.Time
}

func (s *Store) ListPublishedContestsPaged(ctx context.Context, f ContestPublicFilter, page int, pageSize int) ([]ContestPublicListItem, int, error) {
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 10
	}

	where, args := buildContestPublicWhere(f)
	offset := (page - 1) * pageSize

	var total int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM "Contest" c `+where, args...).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	argsWithPage := append([]any{}, args...)
	argsWithPage = append(argsWithPage, pageSize, offset)

	rows, err := s.db.QueryContext(ctx, `
		SELECT c."id",c."name",c."description",c."startTime",c."endTime",c."rule",
		       COUNT(p."id") as "participantCount",
		       (c."passwordHash" IS NOT NULL) as "hasPassword"
		FROM "Contest" c
		LEFT JOIN "ContestParticipant" p ON p."contestId"=c."id"
		`+where+`
		GROUP BY c."id"
		ORDER BY c."startTime" DESC
		LIMIT $`+itoa(len(args)+1)+` OFFSET $`+itoa(len(args)+2)+`
	`, argsWithPage...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var out []ContestPublicListItem
	for rows.Next() {
		var item ContestPublicListItem
		if err := rows.Scan(&item.ID, &item.Name, &item.Description, &item.StartTime, &item.EndTime, &item.Rule, &item.ParticipantCount, &item.HasPassword); err != nil {
			return nil, 0, err
		}
		out = append(out, item)
	}
	return out, total, rows.Err()
}

func (s *Store) ListPublishedContestsAll(ctx context.Context, f ContestPublicFilter, minParticipants int, maxParticipants int, page int, pageSize int) ([]ContestPublicListItem, int, error) {
	where, args := buildContestPublicWhere(f)
	rows, err := s.db.QueryContext(ctx, `
		SELECT c."id",c."name",c."description",c."startTime",c."endTime",c."rule",
		       COUNT(p."id") as "participantCount",
		       (c."passwordHash" IS NOT NULL) as "hasPassword"
		FROM "Contest" c
		LEFT JOIN "ContestParticipant" p ON p."contestId"=c."id"
		`+where+`
		GROUP BY c."id"
		ORDER BY c."startTime" DESC
	`, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var all []ContestPublicListItem
	for rows.Next() {
		var item ContestPublicListItem
		if err := rows.Scan(&item.ID, &item.Name, &item.Description, &item.StartTime, &item.EndTime, &item.Rule, &item.ParticipantCount, &item.HasPassword); err != nil {
			return nil, 0, err
		}
		all = append(all, item)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}

	filtered := make([]ContestPublicListItem, 0, len(all))
	for _, c := range all {
		if minParticipants > 0 && c.ParticipantCount < minParticipants {
			continue
		}
		if maxParticipants > 0 && c.ParticipantCount > maxParticipants {
			continue
		}
		filtered = append(filtered, c)
	}

	total := len(filtered)
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 10
	}
	start := (page - 1) * pageSize
	if start >= total {
		return []ContestPublicListItem{}, total, nil
	}
	end := start + pageSize
	if end > total {
		end = total
	}
	return filtered[start:end], total, nil
}

func (s *Store) GetContestWithProblemsPublic(ctx context.Context, id int) (ContestPublicDetail, error) {
	var contest ContestPublicDetail
	var hasPassword bool
	var languages PGTextArray

	err := s.db.QueryRowContext(ctx, `
		SELECT c."id",c."name",c."description",c."startTime",c."endTime",c."rule",c."languages",
		       COUNT(p."id") as "participantCount",
		       (c."passwordHash" IS NOT NULL) as "hasPassword"
		FROM "Contest" c
		LEFT JOIN "ContestParticipant" p ON p."contestId"=c."id"
		WHERE c."id"=$1 AND c."isPublished"=true
		GROUP BY c."id"
	`, id).Scan(&contest.ID, &contest.Name, &contest.Description, &contest.StartTime, &contest.EndTime, &contest.Rule, &languages, &contest.ParticipantCount, &hasPassword)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ContestPublicDetail{}, ErrNotFound
		}
		return ContestPublicDetail{}, err
	}
	contest.Languages = []string(languages)
	contest.HasPassword = hasPassword

	rows, err := s.db.QueryContext(ctx, `
		SELECT p."id",p."title",p."difficulty"
		FROM "ContestProblem" cp
		JOIN "Problem" p ON p."id"=cp."problemId"
		WHERE cp."contestId"=$1 AND p."visible"=true
		ORDER BY cp."order" ASC
	`, id)
	if err != nil {
		return ContestPublicDetail{}, err
	}
	defer rows.Close()

	for rows.Next() {
		var item struct {
			ID         int    `json:"id"`
			Title      string `json:"title"`
			Difficulty string `json:"difficulty"`
		}
		if err := rows.Scan(&item.ID, &item.Title, &item.Difficulty); err != nil {
			return ContestPublicDetail{}, err
		}
		contest.Problems = append(contest.Problems, item)
	}
	if err := rows.Err(); err != nil {
		return ContestPublicDetail{}, err
	}
	return contest, nil
}

func (s *Store) HasContestParticipant(ctx context.Context, contestID int, userID int) (bool, error) {
	var exists bool
	err := s.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM "ContestParticipant" WHERE "contestId"=$1 AND "userId"=$2)`, contestID, userID).Scan(&exists)
	return exists, err
}

func (s *Store) UpsertContestParticipant(ctx context.Context, contestID int, userID int) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO "ContestParticipant" ("contestId","userId")
		VALUES ($1,$2)
		ON CONFLICT ("contestId","userId") DO NOTHING
	`, contestID, userID)
	return err
}

type ContestPasswordAttempt struct {
	FailedCount  int        `json:"failedCount"`
	LastFailedAt *time.Time `json:"lastFailedAt"`
}

func (s *Store) GetContestPasswordAttempt(ctx context.Context, contestID int, userID int) (ContestPasswordAttempt, bool, error) {
	var out ContestPasswordAttempt
	var last sql.NullTime
	err := s.db.QueryRowContext(ctx, `
		SELECT "failedCount","lastFailedAt"
		FROM "ContestPasswordAttempt"
		WHERE "contestId"=$1 AND "userId"=$2
	`, contestID, userID).Scan(&out.FailedCount, &last)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ContestPasswordAttempt{}, false, nil
		}
		return ContestPasswordAttempt{}, false, err
	}
	if last.Valid {
		out.LastFailedAt = &last.Time
	}
	return out, true, nil
}

func (s *Store) UpsertContestPasswordAttempt(ctx context.Context, contestID int, userID int, failedCount int, lastFailedAt time.Time) (int, error) {
	var stored int
	err := s.db.QueryRowContext(ctx, `
		INSERT INTO "ContestPasswordAttempt" ("contestId","userId","failedCount","lastFailedAt")
		VALUES ($1,$2,$3,$4)
		ON CONFLICT ("contestId","userId") DO UPDATE SET
			"failedCount"=EXCLUDED."failedCount",
			"lastFailedAt"=EXCLUDED."lastFailedAt"
		RETURNING "failedCount"
	`, contestID, userID, failedCount, lastFailedAt).Scan(&stored)
	if err != nil {
		return 0, err
	}
	return stored, nil
}

func (s *Store) DeleteContestPasswordAttempt(ctx context.Context, contestID int, userID int) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM "ContestPasswordAttempt" WHERE "contestId"=$1 AND "userId"=$2`, contestID, userID)
	return err
}

func (s *Store) BatchSetContestPublished(ctx context.Context, ids []int, published bool) (int, error) {
	res, err := s.db.ExecContext(ctx, `UPDATE "Contest" SET "isPublished"=$1 WHERE "id" = ANY($2)`, published, ids)
	if err != nil {
		return 0, err
	}
	affected, _ := res.RowsAffected()
	return int(affected), nil
}

type ContestSubmissionExportRow struct {
	UserID    int
	Username  string
	ProblemID int
	Language  string
	Code      string
	CreatedAt time.Time
}

func (s *Store) ListContestSubmissionsForExport(ctx context.Context, contestID int, problemID *int, userID *int) ([]ContestSubmissionExportRow, error) {
	conds := []string{`s."contestId"=$1`}
	args := []any{contestID}
	arg := 2
	if problemID != nil {
		conds = append(conds, `s."problemId"=$`+itoa(arg))
		args = append(args, *problemID)
		arg++
	}
	if userID != nil {
		conds = append(conds, `s."userId"=$`+itoa(arg))
		args = append(args, *userID)
		arg++
	}
	where := "WHERE " + strings.Join(conds, " AND ")

	rows, err := s.db.QueryContext(ctx, `
		SELECT u."id",u."username",p."id",s."language",s."code",s."createdAt"
		FROM "Submission" s
		JOIN "User" u ON u."id"=s."userId"
		JOIN "Problem" p ON p."id"=s."problemId"
		`+where+`
		ORDER BY s."createdAt" ASC
	`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []ContestSubmissionExportRow
	for rows.Next() {
		var row ContestSubmissionExportRow
		if err := rows.Scan(&row.UserID, &row.Username, &row.ProblemID, &row.Language, &row.Code, &row.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func buildContestPublicWhere(f ContestPublicFilter) (string, []any) {
	conds := []string{`c."isPublished"=true`}
	args := []any{}
	arg := 1

	now := f.Now
	if f.Status == "upcoming" {
		conds = append(conds, `c."startTime" > $`+itoa(arg))
		args = append(args, now)
		arg++
	} else if f.Status == "finished" {
		conds = append(conds, `c."endTime" < $`+itoa(arg))
		args = append(args, now)
		arg++
	} else if f.Status == "ongoing" {
		conds = append(conds, `c."startTime" <= $`+itoa(arg)+` AND c."endTime" >= $`+itoa(arg+1))
		args = append(args, now, now)
		arg += 2
	}

	if f.StartFrom != nil {
		conds = append(conds, `c."startTime" >= $`+itoa(arg))
		args = append(args, *f.StartFrom)
		arg++
	}
	if f.StartTo != nil {
		conds = append(conds, `c."startTime" <= $`+itoa(arg))
		args = append(args, *f.StartTo)
		arg++
	}

	if len(conds) == 0 {
		return "", args
	}
	return "WHERE " + strings.Join(conds, " AND "), args
}

func fetchExistingProblemIDs(ctx context.Context, tx *sql.Tx, ids []int) (map[int]struct{}, error) {
	rows, err := tx.QueryContext(ctx, `SELECT "id" FROM "Problem" WHERE "id"=ANY($1)`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[int]struct{}{}
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out[id] = struct{}{}
	}
	return out, rows.Err()
}

func replaceContestProblems(ctx context.Context, tx *sql.Tx, contestID int, orderedIDs []int, existing map[int]struct{}) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM "ContestProblem" WHERE "contestId"=$1`, contestID); err != nil {
		return err
	}
	return insertContestProblems(ctx, tx, contestID, orderedIDs, existing)
}

func insertContestProblems(ctx context.Context, tx *sql.Tx, contestID int, orderedIDs []int, existing map[int]struct{}) error {
	type row struct {
		ProblemID int
		Order     int
	}
	rows := make([]row, 0, len(orderedIDs))
	seen := map[int]struct{}{}
	for idx, pid := range orderedIDs {
		if _, ok := existing[pid]; !ok {
			continue
		}
		if _, ok := seen[pid]; ok {
			continue
		}
		seen[pid] = struct{}{}
		rows = append(rows, row{ProblemID: pid, Order: idx})
	}
	if len(rows) == 0 {
		return nil
	}

	placeholders := make([]string, 0, len(rows))
	args := make([]any, 0, len(rows)*3)
	arg := 1
	for _, r := range rows {
		placeholders = append(placeholders, `($`+itoa(arg)+`,$`+itoa(arg+1)+`,$`+itoa(arg+2)+`)`)
		args = append(args, contestID, r.ProblemID, r.Order)
		arg += 3
	}
	_, err := tx.ExecContext(ctx, `INSERT INTO "ContestProblem" ("contestId","problemId","order") VALUES `+strings.Join(placeholders, ","), args...)
	return err
}

func listContestProblemsSimple(ctx context.Context, db *sql.DB, contestIDs []int, onlyVisible bool) (map[int][]struct {
	ID         int    `json:"id"`
	Title      string `json:"title"`
	Difficulty string `json:"difficulty"`
}, error) {
	where := `cp."contestId"=ANY($1)`
	if onlyVisible {
		where += ` AND p."visible"=true`
	}
	rows, err := db.QueryContext(ctx, `
		SELECT cp."contestId",p."id",p."title",p."difficulty"
		FROM "ContestProblem" cp
		JOIN "Problem" p ON p."id"=cp."problemId"
		WHERE `+where+`
		ORDER BY cp."contestId" ASC, cp."order" ASC
	`, contestIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[int][]struct {
		ID         int    `json:"id"`
		Title      string `json:"title"`
		Difficulty string `json:"difficulty"`
	}{}
	for rows.Next() {
		var cid int
		var item struct {
			ID         int    `json:"id"`
			Title      string `json:"title"`
			Difficulty string `json:"difficulty"`
		}
		if err := rows.Scan(&cid, &item.ID, &item.Title, &item.Difficulty); err != nil {
			return nil, err
		}
		out[cid] = append(out[cid], item)
	}
	return out, rows.Err()
}

func (s *Store) ListContestLeaderboard(ctx context.Context, contestID int) ([]ContestLeaderboardItem, error) {
	rows, err := s.db.QueryContext(ctx, `
		WITH user_problem_max AS (
			SELECT s."userId" AS "userId", s."problemId" AS "problemId", MAX(COALESCE(s."score",0)) AS "maxScore"
			FROM "Submission" s
			WHERE s."contestId"=$1
			GROUP BY s."userId", s."problemId"
		),
		user_totals AS (
			SELECT "userId", SUM("maxScore") AS "totalScore"
			FROM user_problem_max
			GROUP BY "userId"
		),
		user_counts AS (
			SELECT s."userId" AS "userId", COUNT(*) AS "submissionCount"
			FROM "Submission" s
			WHERE s."contestId"=$1
			GROUP BY s."userId"
		)
		SELECT u."id",u."username",COALESCE(uc."submissionCount",0),COALESCE(ut."totalScore",0)
		FROM "User" u
		JOIN user_counts uc ON uc."userId"=u."id"
		LEFT JOIN user_totals ut ON ut."userId"=u."id"
		ORDER BY COALESCE(ut."totalScore",0) DESC, u."username" ASC
	`, contestID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ContestLeaderboardItem
	for rows.Next() {
		var item ContestLeaderboardItem
		if err := rows.Scan(&item.UserID, &item.Username, &item.SubmissionCount, &item.TotalScore); err != nil {
			return nil, err
		}
		item.ProblemScores = map[int]ContestProblemScore{}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *Store) ListContestLeaderboardPaged(ctx context.Context, contestID int, contestRule string, page int, pageSize int, sortBy string, asc bool) ([]ContestLeaderboardItem, int, error) {
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 10
	}
	if pageSize > 100 {
		pageSize = 100
	}
	orderDir := "DESC"
	if asc {
		orderDir = "ASC"
	}
	orderKey := `COALESCE(ut."totalScore",0)`
	if strings.EqualFold(sortBy, "submissionCount") {
		orderKey = `COALESCE(uc."submissionCount",0)`
	}

	query := ""
	useLast := strings.EqualFold(contestRule, "OI")
	if useLast {
		query = `
			WITH user_problem_last AS (
				SELECT s."userId" AS "userId", s."problemId" AS "problemId",
				       (ARRAY_AGG(COALESCE(s."score",0) ORDER BY s."createdAt" DESC, s."id" DESC))[1] AS "lastScore"
				FROM "Submission" s
				WHERE s."contestId"=$1
				GROUP BY s."userId", s."problemId"
			),
			user_totals AS (
				SELECT "userId", SUM("lastScore") AS "totalScore"
				FROM user_problem_last
				GROUP BY "userId"
			),
			user_counts AS (
				SELECT s."userId" AS "userId", COUNT(*) AS "submissionCount"
				FROM "Submission" s
				WHERE s."contestId"=$1
				GROUP BY s."userId"
			)
			SELECT u."id",u."username",COALESCE(uc."submissionCount",0),COALESCE(ut."totalScore",0)
			FROM "User" u
			JOIN user_counts uc ON uc."userId"=u."id"
			LEFT JOIN user_totals ut ON ut."userId"=u."id"
			ORDER BY ` + orderKey + ` ` + orderDir + `, u."username" ASC
			LIMIT $2 OFFSET $3
		`
	} else {
		query = `
			WITH user_problem_max AS (
				SELECT s."userId" AS "userId", s."problemId" AS "problemId", MAX(COALESCE(s."score",0)) AS "maxScore"
				FROM "Submission" s
				WHERE s."contestId"=$1
				GROUP BY s."userId", s."problemId"
			),
			user_totals AS (
				SELECT "userId", SUM("maxScore") AS "totalScore"
				FROM user_problem_max
				GROUP BY "userId"
			),
			user_counts AS (
				SELECT s."userId" AS "userId", COUNT(*) AS "submissionCount"
				FROM "Submission" s
				WHERE s."contestId"=$1
				GROUP BY s."userId"
			)
			SELECT u."id",u."username",COALESCE(uc."submissionCount",0),COALESCE(ut."totalScore",0)
			FROM "User" u
			JOIN user_counts uc ON uc."userId"=u."id"
			LEFT JOIN user_totals ut ON ut."userId"=u."id"
			ORDER BY ` + orderKey + ` ` + orderDir + `, u."username" ASC
			LIMIT $2 OFFSET $3
		`
	}

	rows, err := s.db.QueryContext(ctx, query, contestID, pageSize, (page-1)*pageSize)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	var out []ContestLeaderboardItem
	userIDs := make([]int, 0, pageSize)
	for rows.Next() {
		var item ContestLeaderboardItem
		if err := rows.Scan(&item.UserID, &item.Username, &item.SubmissionCount, &item.TotalScore); err != nil {
			return nil, 0, err
		}
		item.ProblemScores = map[int]ContestProblemScore{}
		out = append(out, item)
		userIDs = append(userIDs, item.UserID)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	var total int
	if err := s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM (
			SELECT s."userId" AS "userId"
			FROM "Submission" s
			WHERE s."contestId"=$1
			GROUP BY s."userId"
		) t
	`, contestID).Scan(&total); err != nil {
		return nil, 0, err
	}
	if len(out) == 0 {
		return out, total, nil
	}

	statsQuery := ""
	if useLast {
		statsQuery = `
			SELECT s."userId", s."problemId",
			       (ARRAY_AGG(COALESCE(s."score",0) ORDER BY s."createdAt" DESC, s."id" DESC))[1] AS "lastScore",
			       COUNT(*) AS "submissionCount"
			FROM "Submission" s
			WHERE s."contestId"=$1 AND s."userId"=ANY($2)
			GROUP BY s."userId", s."problemId"
		`
	} else {
		statsQuery = `
			SELECT s."userId", s."problemId", MAX(COALESCE(s."score",0)) AS "maxScore", COUNT(*) AS "submissionCount"
			FROM "Submission" s
			WHERE s."contestId"=$1 AND s."userId"=ANY($2)
			GROUP BY s."userId", s."problemId"
		`
	}

	statsRows, err := s.db.QueryContext(ctx, statsQuery, contestID, userIDs)
	if err != nil {
		return nil, 0, err
	}
	defer statsRows.Close()
	index := map[int]int{}
	for i, it := range out {
		index[it.UserID] = i
	}
	for statsRows.Next() {
		var uid int
		var pid int
		var score int
		var count int
		if err := statsRows.Scan(&uid, &pid, &score, &count); err != nil {
			return nil, 0, err
		}
		i := index[uid]
		out[i].ProblemScores[pid] = ContestProblemScore{Score: score, SubmissionCount: count}
	}
	return out, total, statsRows.Err()
}
func (s *Store) ListContestUserProblemStats(ctx context.Context, contestID int) ([]ContestUserProblemStat, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT u."id",u."username",s."problemId",
		       MAX(COALESCE(s."score",0)) as "maxScore",
		       COUNT(*) as "submissionCount"
		FROM "Submission" s
		JOIN "User" u ON u."id"=s."userId"
		WHERE s."contestId"=$1
		GROUP BY u."id",u."username",s."problemId"
		ORDER BY u."id" ASC, s."problemId" ASC
	`, contestID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ContestUserProblemStat
	for rows.Next() {
		var r ContestUserProblemStat
		var maxScore sql.NullInt64
		if err := rows.Scan(&r.UserID, &r.Username, &r.ProblemID, &maxScore, &r.SubmissionCount); err != nil {
			return nil, err
		}
		if maxScore.Valid {
			r.MaxScore = int(maxScore.Int64)
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *Store) ListContestProblemsSimple(ctx context.Context, contestID int) ([]struct {
	ID    int    `json:"id"`
	Title string `json:"title"`
}, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT p."id",p."title"
		FROM "ContestProblem" cp
		JOIN "Problem" p ON p."id"=cp."problemId"
		WHERE cp."contestId"=$1 AND p."visible"=true
		ORDER BY cp."order" ASC
	`, contestID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []struct {
		ID    int    `json:"id"`
		Title string `json:"title"`
	}
	for rows.Next() {
		var item struct {
			ID    int    `json:"id"`
			Title string `json:"title"`
		}
		if err := rows.Scan(&item.ID, &item.Title); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *Store) GetContestProblemIDByOrder(ctx context.Context, contestID int, order int) (int, error) {
	var pid int
	err := s.db.QueryRowContext(ctx, `
		SELECT p."id"
		FROM "ContestProblem" cp
		JOIN "Problem" p ON p."id"=cp."problemId"
		WHERE cp."contestId"=$1 AND cp."order"=$2 AND p."visible"=true
	`, contestID, order).Scan(&pid)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 0, ErrNotFound
		}
		return 0, err
	}
	return pid, nil
}
