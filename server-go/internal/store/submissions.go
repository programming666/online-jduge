package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

type SubmissionListItem struct {
	ID         int       `json:"id"`
	Code       string    `json:"code"`
	Language   string    `json:"language"`
	Status     string    `json:"status"`
	Output     *string   `json:"output"`
	TimeUsed   *int      `json:"timeUsed"`
	MemoryUsed *int      `json:"memoryUsed"`
	Score      *int      `json:"score"`
	CreatedAt  time.Time `json:"createdAt"`
	ProblemID  int       `json:"problemId"`
	Problem    struct {
		Title string `json:"title"`
	} `json:"problem"`
	User struct {
		Username string `json:"username"`
	} `json:"user"`
}

type ListSubmissionsParams struct {
	UserID         int
	IsAdmin        bool
	Limit          int
	ExcludeContest bool
	ContestID      *int
}

func (s *Store) ListSubmissions(ctx context.Context, p ListSubmissionsParams) ([]SubmissionListItem, error) {
	limit := p.Limit
	if limit <= 0 {
		limit = 50
	}

	args := []any{}
	conds := []string{}
	argID := 1

	if !p.IsAdmin {
		conds = append(conds, `s."userId"=$`+itoa(argID))
		args = append(args, p.UserID)
		argID++
	}
	if p.ExcludeContest {
		conds = append(conds, `s."contestId" IS NULL`)
	}
	if p.ContestID != nil {
		conds = append(conds, `s."contestId"=$`+itoa(argID))
		args = append(args, *p.ContestID)
		argID++
	}

	where := ""
	if len(conds) > 0 {
		where = "WHERE " + strings.Join(conds, " AND ")
	}

	args = append(args, limit) 
	rows, err := s.db.QueryContext(ctx, `
		SELECT s."id",s."code",s."language",s."status",s."output",s."timeUsed",s."memoryUsed",s."score",s."createdAt",s."problemId",
		       p."title", u."username",
		       c."rule", c."endTime"
		FROM "Submission" s
		JOIN "Problem" p ON p."id"=s."problemId"
		LEFT JOIN "User" u ON u."id"=s."userId"
		LEFT JOIN "Contest" c ON c."id"=s."contestId"
		`+where+`
		ORDER BY s."createdAt" DESC
		LIMIT $`+itoa(argID)+`
	`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []SubmissionListItem
	now := time.Now()

	for rows.Next() {
		var item SubmissionListItem
		var rule sql.NullString
		var endTime sql.NullTime

		if err := rows.Scan(&item.ID, &item.Code, &item.Language, &item.Status, &item.Output, &item.TimeUsed, &item.MemoryUsed, &item.Score, &item.CreatedAt, &item.ProblemID, &item.Problem.Title, &item.User.Username, &rule, &endTime); err != nil {
			return nil, err
		}

		// OI Masking
		if !p.IsAdmin && rule.Valid && rule.String == "OI" && endTime.Valid && now.Before(endTime.Time) {
			item.Status = "Submitted"
			item.Output = nil
			item.TimeUsed = nil
			item.MemoryUsed = nil
			item.Score = nil
		}

		out = append(out, item)
	}
	return out, rows.Err()
}

type Submission struct {
	ID              int             `json:"id"`
	Code            string          `json:"code"`
	Language        string          `json:"language"`
	Status          string          `json:"status"`
	Output          *string         `json:"output"`
	TimeUsed        *int            `json:"timeUsed"`
	MemoryUsed      *int            `json:"memoryUsed"`
	Score           *int            `json:"score"`
	TestCaseResults json.RawMessage `json:"testCaseResults"`
	CreatedAt       time.Time       `json:"createdAt"`
	ProblemID       int             `json:"problemId"`
	UserID          *int            `json:"userId"`
	ContestID       *int            `json:"contestId"`
}

type CreateSubmissionParams struct {
	ProblemID int
	Code      string
	Language  string
	UserID    int
	ContestID *int
}

func (s *Store) CreateSubmission(ctx context.Context, p CreateSubmissionParams) (Submission, error) {
	var sub Submission
	var output sql.NullString
	var timeUsed sql.NullInt64
	var memUsed sql.NullInt64
	var score sql.NullInt64
	var tcJSON []byte
	var userID sql.NullInt64
	var contestID sql.NullInt64

	err := s.db.QueryRowContext(ctx, `
		INSERT INTO "Submission" ("problemId","code","language","status","userId","contestId","score")
		VALUES ($1,$2,$3,'Pending',$4,$5,0)
		RETURNING "id","code","language","status","output","timeUsed","memoryUsed","score","testCaseResults","createdAt","problemId","userId","contestId"
	`, p.ProblemID, p.Code, p.Language, p.UserID, p.ContestID).
		Scan(&sub.ID, &sub.Code, &sub.Language, &sub.Status, &output, &timeUsed, &memUsed, &score, &tcJSON, &sub.CreatedAt, &sub.ProblemID, &userID, &contestID)
	if err != nil {
		return Submission{}, err
	}

	if output.Valid {
		sub.Output = &output.String
	}
	if timeUsed.Valid {
		v := int(timeUsed.Int64)
		sub.TimeUsed = &v
	}
	if memUsed.Valid {
		v := int(memUsed.Int64)
		sub.MemoryUsed = &v
	}
	if score.Valid {
		v := int(score.Int64)
		sub.Score = &v
	}
	if tcJSON != nil {
		sub.TestCaseResults = tcJSON
	}
	if userID.Valid {
		v := int(userID.Int64)
		sub.UserID = &v
	}
	if contestID.Valid {
		v := int(contestID.Int64)
		sub.ContestID = &v
	}
	return sub, nil
}

type SubmissionDetail struct {
	Submission
	Problem ProblemWithTestCases `json:"problem"`
	User    struct {
		ID       int    `json:"id"`
		Username string `json:"username"`
		Role     string `json:"role"`
	} `json:"user"`
}

func (s *Store) GetSubmissionWithProblemAndUser(ctx context.Context, submissionID int, isAdmin bool) (SubmissionDetail, error) {
	var sub SubmissionDetail
	var cfg []byte
	var output sql.NullString
	var timeUsed sql.NullInt64
	var memUsed sql.NullInt64
	var score sql.NullInt64
	var tcJSON []byte
	var userID sql.NullInt64
	var contestID sql.NullInt64
	var tags PGTextArray
	var rule sql.NullString
	var endTime sql.NullTime

	err := s.db.QueryRowContext(ctx, `
		SELECT s."id",s."code",s."language",s."status",s."output",s."timeUsed",s."memoryUsed",s."score",s."testCaseResults",s."createdAt",s."problemId",s."userId",s."contestId",
		       p."id",p."title",p."description",p."timeLimit",p."memoryLimit",p."config",p."defaultCompileOptions",p."difficulty",p."tags",p."visible",p."createdAt",p."updatedAt",
		       u."id",u."username",u."role",
		       c."rule", c."endTime"
		FROM "Submission" s
		JOIN "Problem" p ON p."id"=s."problemId"
		LEFT JOIN "User" u ON u."id"=s."userId"
		LEFT JOIN "Contest" c ON c."id"=s."contestId"
		WHERE s."id"=$1
	`, submissionID).Scan(
		&sub.ID, &sub.Code, &sub.Language, &sub.Status, &output, &timeUsed, &memUsed, &score, &tcJSON, &sub.CreatedAt, &sub.ProblemID, &userID, &contestID,
		&sub.Problem.ID, &sub.Problem.Title, &sub.Problem.Description, &sub.Problem.TimeLimit, &sub.Problem.MemoryLimit, &cfg, &sub.Problem.DefaultCompileOptions, &sub.Problem.Difficulty, &tags, &sub.Problem.Visible, &sub.Problem.CreatedAt, &sub.Problem.UpdatedAt,
		&sub.User.ID, &sub.User.Username, &sub.User.Role,
		&rule, &endTime,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return SubmissionDetail{}, ErrNotFound
		}
		return SubmissionDetail{}, err
	}
	sub.Problem.Tags = []string(tags)

	// OI Masking
	if !isAdmin && rule.Valid && rule.String == "OI" && endTime.Valid && time.Now().Before(endTime.Time) {
		sub.Status = "Submitted"
		// Mask output, time, memory, score
		// Note: We don't set them in the struct because they are pointers/fields.
		// We just don't populate them from the SQL result or explicitly set them to nil.
		// Since we haven't assigned output/timeUsed/etc to sub yet, we can just skip assignment or reset them.

		// Ensure we don't expose them
		output = sql.NullString{}
		timeUsed = sql.NullInt64{}
		memUsed = sql.NullInt64{}
		score = sql.NullInt64{}
		tcJSON = nil // Hide test case results
	}

	if output.Valid {
		sub.Output = &output.String
	}
	if timeUsed.Valid {
		v := int(timeUsed.Int64)
		sub.TimeUsed = &v
	}
	if memUsed.Valid {
		v := int(memUsed.Int64)
		sub.MemoryUsed = &v
	}
	if score.Valid {
		v := int(score.Int64)
		sub.Score = &v
	}
	if tcJSON != nil {
		sub.TestCaseResults = tcJSON
	}
	if cfg != nil {
		sub.Problem.Config = cfg
	}
	if userID.Valid {
		v := int(userID.Int64)
		sub.UserID = &v
	}
	if contestID.Valid {
		v := int(contestID.Int64)
		sub.ContestID = &v
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT "id","input","expectedOutput","problemId"
		FROM "TestCase"
		WHERE "problemId"=$1
		ORDER BY "id" ASC
	`, sub.Problem.ID)
	if err != nil {
		return SubmissionDetail{}, err
	}
	defer rows.Close()

	for rows.Next() {
		var tc TestCase
		if err := rows.Scan(&tc.ID, &tc.Input, &tc.ExpectedOutput, &tc.ProblemID); err != nil {
			return SubmissionDetail{}, err
		}
		sub.Problem.TestCases = append(sub.Problem.TestCases, tc)
	}
	if err := rows.Err(); err != nil {
		return SubmissionDetail{}, err
	}

	return sub, nil
}

type JudgeCaseResult struct {
	Status     string `json:"status"`
	TimeUsed   int    `json:"timeUsed"`
	MemoryUsed int    `json:"memoryUsed"`
	Output     string `json:"output"`
}

func (s *Store) UpdateSubmissionStatus(ctx context.Context, submissionID int, status string, output string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE "Submission" SET "status"=$1,"output"=$2 WHERE "id"=$3`, status, output, submissionID)
	return err
}

type UpdateSubmissionJudgedParams struct {
	ID            int
	Status        string
	TimeUsed      int
	MemoryUsed    int
	Score         int
	TestCaseJSON  json.RawMessage
	OutputMessage string
}

func (s *Store) UpdateSubmissionJudged(ctx context.Context, p UpdateSubmissionJudgedParams) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE "Submission"
		SET "status"=$1,"timeUsed"=$2,"memoryUsed"=$3,"score"=$4,"testCaseResults"=$5,"output"=$6
		WHERE "id"=$7
	`, p.Status, p.TimeUsed, p.MemoryUsed, p.Score, p.TestCaseJSON, p.OutputMessage, p.ID)
	return err
}
