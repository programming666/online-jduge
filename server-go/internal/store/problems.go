package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

type ProblemListItem struct {
	ID         int       `json:"id"`
	Title      string    `json:"title"`
	Difficulty string    `json:"difficulty"`
	Tags       []string  `json:"tags"`
	CreatedAt  time.Time `json:"createdAt"`
	Visible    bool      `json:"visible"`
	Score      *int      `json:"score,omitempty"`
}

type ListProblemsParams struct {
	Difficulty string
	Search     string
	Tags       []string
}

func (s *Store) ListProblemsPublic(ctx context.Context, p ListProblemsParams) ([]ProblemListItem, error) {
	return s.listProblems(ctx, p, true)
}

func (s *Store) ListProblemsAdmin(ctx context.Context, p ListProblemsParams) ([]ProblemListItem, error) {
	return s.listProblems(ctx, p, false)
}

func (s *Store) listProblems(ctx context.Context, p ListProblemsParams, public bool) ([]ProblemListItem, error) {
	conds := []string{}
	args := []any{}
	arg := 1

	if strings.TrimSpace(p.Difficulty) != "" {
		conds = append(conds, `"difficulty"=$`+itoa(arg))
		args = append(args, p.Difficulty)
		arg++
	}

	if strings.TrimSpace(p.Search) != "" {
		if id, ok := tryAtoi(p.Search); ok {
			conds = append(conds, `("id"=$`+itoa(arg)+` OR "title" ILIKE $`+itoa(arg+1)+`)`)
			args = append(args, id, "%"+p.Search+"%")
			arg += 2
		} else {
			conds = append(conds, `"title" ILIKE $`+itoa(arg))
			args = append(args, "%"+p.Search+"%")
			arg++
		}
	}

	if len(p.Tags) > 0 {
		conds = append(conds, `"tags" && $`+itoa(arg)+`::text[]`)
		args = append(args, p.Tags)
		arg++
	}

	if public {
		conds = append(conds, `"visible"=true`)
	}

	where := ""
	if len(conds) > 0 {
		where = "WHERE " + strings.Join(conds, " AND ")
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT "id","title","difficulty","tags","createdAt","visible"
		FROM "Problem"
		`+where+`
		ORDER BY "id" ASC
	`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []ProblemListItem
	for rows.Next() {
		var item ProblemListItem
		var tags PGTextArray
		if err := rows.Scan(&item.ID, &item.Title, &item.Difficulty, &tags, &item.CreatedAt, &item.Visible); err != nil {
			return nil, err
		}
		item.Tags = []string(tags)
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *Store) GetUserMaxScoresByProblem(ctx context.Context, userID int) (map[int]int, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT "problemId", MAX("score") as "maxScore"
		FROM "Submission"
		WHERE "userId"=$1
		GROUP BY "problemId"
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[int]int{}
	for rows.Next() {
		var pid int
		var maxScore sql.NullInt64
		if err := rows.Scan(&pid, &maxScore); err != nil {
			return nil, err
		}
		if maxScore.Valid {
			out[pid] = int(maxScore.Int64)
		}
	}
	return out, rows.Err()
}

type Problem struct {
	ID                    int             `json:"id"`
	Title                 string          `json:"title"`
	Description           string          `json:"description"`
	TimeLimit             int             `json:"timeLimit"`
	MemoryLimit           int             `json:"memoryLimit"`
	Config                json.RawMessage `json:"config"`
	DefaultCompileOptions string          `json:"defaultCompileOptions"`
	Difficulty            string          `json:"difficulty"`
	Tags                  []string        `json:"tags"`
	Visible               bool            `json:"visible"`
	CreatedAt             time.Time       `json:"createdAt"`
	UpdatedAt             time.Time       `json:"updatedAt"`
}

func (s *Store) GetProblemByID(ctx context.Context, id int) (Problem, error) {
	var p Problem
	var cfg []byte
	var tags PGTextArray
	err := s.db.QueryRowContext(ctx, `
		SELECT "id","title","description","timeLimit","memoryLimit","config","defaultCompileOptions","difficulty","tags","visible","createdAt","updatedAt"
		FROM "Problem"
		WHERE "id"=$1
	`, id).Scan(&p.ID, &p.Title, &p.Description, &p.TimeLimit, &p.MemoryLimit, &cfg, &p.DefaultCompileOptions, &p.Difficulty, &tags, &p.Visible, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Problem{}, ErrNotFound
		}
		return Problem{}, err
	}
	if cfg != nil {
		p.Config = cfg
	}
	p.Tags = []string(tags)
	return p, nil
}

type TestCase struct {
	ID             int    `json:"id"`
	Input          string `json:"input"`
	ExpectedOutput string `json:"expectedOutput"`
	ProblemID      int    `json:"problemId"`
}

type ProblemWithTestCases struct {
	Problem
	TestCases []TestCase `json:"testCases"`
}

func (s *Store) GetProblemWithTestCases(ctx context.Context, id int) (ProblemWithTestCases, error) {
	p, err := s.GetProblemByID(ctx, id)
	if err != nil {
		return ProblemWithTestCases{}, err
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT "id","input","expectedOutput","problemId"
		FROM "TestCase"
		WHERE "problemId"=$1
		ORDER BY "id" ASC
	`, id)
	if err != nil {
		return ProblemWithTestCases{}, err
	}
	defer rows.Close()

	var cases []TestCase
	for rows.Next() {
		var tc TestCase
		if err := rows.Scan(&tc.ID, &tc.Input, &tc.ExpectedOutput, &tc.ProblemID); err != nil {
			return ProblemWithTestCases{}, err
		}
		cases = append(cases, tc)
	}
	if err := rows.Err(); err != nil {
		return ProblemWithTestCases{}, err
	}
	return ProblemWithTestCases{Problem: p, TestCases: cases}, nil
}

type TestCaseInput struct {
	Input          string
	ExpectedOutput string
}

type CreateProblemParams struct {
	Title                 string
	Description           string
	TimeLimit             int
	MemoryLimit           int
	DefaultCompileOptions string
	Difficulty            string
	Tags                  []string
	Config                json.RawMessage
	TestCases             []TestCaseInput
	ContestID             int
}

func (s *Store) CreateProblem(ctx context.Context, p CreateProblemParams) (Problem, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Problem{}, err
	}
	defer tx.Rollback()

	var created Problem
	var cfg []byte
	var tags PGTextArray
	err = tx.QueryRowContext(ctx, `
		INSERT INTO "Problem" ("title","description","timeLimit","memoryLimit","defaultCompileOptions","difficulty","tags","config","createdAt","updatedAt")
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
		RETURNING "id","title","description","timeLimit","memoryLimit","config","defaultCompileOptions","difficulty","tags","visible","createdAt","updatedAt"
	`, p.Title, p.Description, p.TimeLimit, p.MemoryLimit, p.DefaultCompileOptions, p.Difficulty, p.Tags, p.Config).
		Scan(&created.ID, &created.Title, &created.Description, &created.TimeLimit, &created.MemoryLimit, &cfg, &created.DefaultCompileOptions, &created.Difficulty, &tags, &created.Visible, &created.CreatedAt, &created.UpdatedAt)
	if err != nil {
		return Problem{}, err
	}
	if cfg != nil {
		created.Config = cfg
	}
	created.Tags = []string(tags)

	for _, tc := range p.TestCases {
		_, err := tx.ExecContext(ctx, `INSERT INTO "TestCase" ("input","expectedOutput","problemId") VALUES ($1,$2,$3)`, tc.Input, tc.ExpectedOutput, created.ID)
		if err != nil {
			return Problem{}, err
		}
	}

	if p.ContestID > 0 {
		var exists bool
		if err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM "Contest" WHERE "id"=$1)`, p.ContestID).Scan(&exists); err != nil {
			return Problem{}, err
		}
		if exists {
			var maxOrder sql.NullInt64
			if err := tx.QueryRowContext(ctx, `SELECT MAX("order") FROM "ContestProblem" WHERE "contestId"=$1`, p.ContestID).Scan(&maxOrder); err != nil {
				return Problem{}, err
			}
			nextOrder := 0
			if maxOrder.Valid {
				nextOrder = int(maxOrder.Int64) + 1
			}
			_, err := tx.ExecContext(ctx, `INSERT INTO "ContestProblem" ("contestId","problemId","order") VALUES ($1,$2,$3)`, p.ContestID, created.ID, nextOrder)
			if err != nil {
				return Problem{}, err
			}
		}
	}

	if err := tx.Commit(); err != nil {
		return Problem{}, err
	}
	return created, nil
}

type UpdateProblemParams struct {
	ID                    int
	Title                 string
	Description           string
	TimeLimit             int
	MemoryLimit           int
	DefaultCompileOptions string
	Difficulty            string
	Tags                  []string
	Config                json.RawMessage
	TestCases             []TestCaseInput
}

func (s *Store) UpdateProblem(ctx context.Context, p UpdateProblemParams) (ProblemWithTestCases, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return ProblemWithTestCases{}, err
	}
	defer tx.Rollback()

	res, err := tx.ExecContext(ctx, `
		UPDATE "Problem"
		SET "title"=$1,"description"=$2,"timeLimit"=$3,"memoryLimit"=$4,"defaultCompileOptions"=$5,"difficulty"=$6,"tags"=$7,"config"=$8,"updatedAt"=NOW()
		WHERE "id"=$9
	`, p.Title, p.Description, p.TimeLimit, p.MemoryLimit, p.DefaultCompileOptions, p.Difficulty, p.Tags, p.Config, p.ID)
	if err != nil {
		return ProblemWithTestCases{}, err
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return ProblemWithTestCases{}, ErrNotFound
	}

	if _, err := tx.ExecContext(ctx, `DELETE FROM "TestCase" WHERE "problemId"=$1`, p.ID); err != nil {
		return ProblemWithTestCases{}, err
	}

	for _, tc := range p.TestCases {
		_, err := tx.ExecContext(ctx, `INSERT INTO "TestCase" ("input","expectedOutput","problemId") VALUES ($1,$2,$3)`, tc.Input, tc.ExpectedOutput, p.ID)
		if err != nil {
			return ProblemWithTestCases{}, err
		}
	}

	if err := tx.Commit(); err != nil {
		return ProblemWithTestCases{}, err
	}
	return s.GetProblemWithTestCases(ctx, p.ID)
}

func (s *Store) UpdateProblemVisibility(ctx context.Context, id int, visible bool) (Problem, error) {
	var p Problem
	var cfg []byte
	var tags PGTextArray
	err := s.db.QueryRowContext(ctx, `
		UPDATE "Problem" SET "visible"=$1,"updatedAt"=NOW() WHERE "id"=$2
		RETURNING "id","title","description","timeLimit","memoryLimit","config","defaultCompileOptions","difficulty","tags","visible","createdAt","updatedAt"
	`, visible, id).Scan(&p.ID, &p.Title, &p.Description, &p.TimeLimit, &p.MemoryLimit, &cfg, &p.DefaultCompileOptions, &p.Difficulty, &tags, &p.Visible, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Problem{}, ErrNotFound
		}
		return Problem{}, err
	}
	if cfg != nil {
		p.Config = cfg
	}
	p.Tags = []string(tags)
	return p, nil
}

func (s *Store) DeleteProblemCascade(ctx context.Context, problemID int) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, `DELETE FROM "Submission" WHERE "problemId"=$1`, problemID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM "TestCase" WHERE "problemId"=$1`, problemID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM "Problem" WHERE "id"=$1`, problemID); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) CloneProblem(ctx context.Context, problemID int, newTitle string) (ProblemWithTestCases, error) {
	original, err := s.GetProblemWithTestCases(ctx, problemID)
	if err != nil {
		return ProblemWithTestCases{}, err
	}

	title := strings.TrimSpace(newTitle)
	if title == "" {
		title = original.Title + " (Copy)"
	}

	testInputs := make([]TestCaseInput, 0, len(original.TestCases))
	for _, tc := range original.TestCases {
		testInputs = append(testInputs, TestCaseInput{Input: tc.Input, ExpectedOutput: tc.ExpectedOutput})
	}

	created, err := s.CreateProblem(ctx, CreateProblemParams{
		Title:                 title,
		Description:           original.Description,
		TimeLimit:             original.TimeLimit,
		MemoryLimit:           original.MemoryLimit,
		DefaultCompileOptions: original.DefaultCompileOptions,
		Difficulty:            original.Difficulty,
		Tags:                  original.Tags,
		Config:                original.Config,
		TestCases:             testInputs,
	})
	if err != nil {
		return ProblemWithTestCases{}, err
	}
	return s.GetProblemWithTestCases(ctx, created.ID)
}
