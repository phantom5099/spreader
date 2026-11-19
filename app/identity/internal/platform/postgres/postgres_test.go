package postgres

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
)

// fakeExec 按预设行数逐次回应，用来验证批处理循环的终止条件（无需真实 PG）。
type fakeExec struct {
	rows   []int64 // 第 i 次调用删除的行数
	failAt int     // 第几次调用报错（0 表示不报错）
	calls  int
	args   []any
}

func (f *fakeExec) Exec(_ context.Context, _ string, args ...any) (pgconn.CommandTag, error) {
	f.calls++
	f.args = args
	if f.calls == f.failAt {
		return pgconn.CommandTag{}, errors.New("boom")
	}
	return pgconn.NewCommandTag(fmt.Sprintf("DELETE %d", f.rows[f.calls-1])), nil
}

func TestDeleteInBatches(t *testing.T) {
	const full = int64(cleanupBatchSize)
	fullRows := func(n int) []int64 {
		r := make([]int64, n)
		for i := range r {
			r[i] = full
		}
		return r
	}

	cases := []struct {
		name      string
		rows      []int64
		failAt    int
		wantTotal int64
		wantCalls int
		wantErr   bool
	}{
		{
			name:      "删不满一批即为最后一批",
			rows:      []int64{full, full, 500},
			wantTotal: 2*full + 500,
			wantCalls: 3,
		},
		{
			name:      "恰好整批时多跑一次空批收尾",
			rows:      []int64{full, full, 0},
			wantTotal: 2 * full,
			wantCalls: 3,
		},
		{
			name:      "持续整批时撞上批数上限即停",
			rows:      fullRows(cleanupMaxBatches),
			wantTotal: int64(cleanupMaxBatches) * full,
			wantCalls: cleanupMaxBatches,
		},
		{
			name:      "中途报错保留已删数量",
			rows:      []int64{full, full, full},
			failAt:    2,
			wantTotal: full,
			wantCalls: 2,
			wantErr:   true,
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			f := &fakeExec{rows: c.rows, failAt: c.failAt}
			total, err := deleteInBatches(context.Background(), f, "DELETE ...", sessionRetentionDays)

			if (err != nil) != c.wantErr {
				t.Fatalf("err = %v, wantErr %v", err, c.wantErr)
			}
			if total != c.wantTotal {
				t.Errorf("total = %d, want %d", total, c.wantTotal)
			}
			if f.calls != c.wantCalls {
				t.Errorf("calls = %d, want %d", f.calls, c.wantCalls)
			}
			if f.args[0] != sessionRetentionDays {
				t.Errorf("retention arg = %v, want %d", f.args[0], sessionRetentionDays)
			}
			if f.args[1] != cleanupBatchSize {
				t.Errorf("batch arg = %v, want %d", f.args[1], cleanupBatchSize)
			}
		})
	}
}
