package store

import (
	"database/sql/driver"
	"fmt"
	"strings"
)

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var buf [32]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}

func tryAtoi(s string) (int, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0, false
	}
	n := 0
	for _, r := range s {
		if r < '0' || r > '9' {
			return 0, false
		}
		n = n*10 + int(r-'0')
	}
	return n, true
}

type PGTextArray []string

func (a *PGTextArray) Scan(src any) error {
	switch v := src.(type) {
	case nil:
		*a = nil
		return nil
	case []byte:
		return a.parse(string(v))
	case string:
		return a.parse(v)
	case []string:
		out := make([]string, 0, len(v))
		out = append(out, v...)
		*a = out
		return nil
	default:
		return fmt.Errorf("unsupported Scan, storing driver.Value type %T into type %T", src, a)
	}
}

func (a PGTextArray) Value() (driver.Value, error) {
	return []string(a), nil
}

func (a *PGTextArray) parse(s string) error {
	s = strings.TrimSpace(s)
	if s == "" || s == "{}" {
		*a = []string{}
		return nil
	}
	if len(s) < 2 || s[0] != '{' || s[len(s)-1] != '}' {
		return fmt.Errorf("invalid postgres array: %q", s)
	}

	inner := s[1 : len(s)-1]
	if strings.TrimSpace(inner) == "" {
		*a = []string{}
		return nil
	}

	out := make([]string, 0, 8)
	for i := 0; i < len(inner); {
		if inner[i] == ',' {
			i++
			continue
		}
		if inner[i] == '"' {
			i++
			var b strings.Builder
			for i < len(inner) {
				if inner[i] == '\\' {
					if i+1 < len(inner) {
						b.WriteByte(inner[i+1])
						i += 2
						continue
					}
					i++
					continue
				}
				if inner[i] == '"' {
					i++
					break
				}
				b.WriteByte(inner[i])
				i++
			}
			out = append(out, b.String())
			if i < len(inner) && inner[i] == ',' {
				i++
			}
			continue
		}

		start := i
		for i < len(inner) && inner[i] != ',' {
			i++
		}
		token := strings.TrimSpace(inner[start:i])
		if token != "" && token != "NULL" {
			out = append(out, token)
		} else if token == "" {
			out = append(out, "")
		}
		if i < len(inner) && inner[i] == ',' {
			i++
		}
	}

	*a = out
	return nil
}
